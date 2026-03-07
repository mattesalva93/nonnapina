import axios from 'axios';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { prisma } from './product.service.js';

// ─── Scoring formula ──────────────────────────────────────────────────────────
// Weighted confidence score: rating * (1 - e^(-reviewCount / k))
// k = 30 means: at 30 reviews → ~63% confidence, 90 → ~95%, 150 → ~99%
// After the confidence threshold, score ≈ rating itself, so high-rating
// products with enough reviews naturally float to the top.
//
// Verification with the user's examples:
//   4.1 rating / 402 reviews → 4.10  >  4.9 / 12  → 1.62  ✓
//   3.5 rating / 502 reviews → 3.50  <  4.3 / 100 → 4.15  ✓
const CONFIDENCE_K = 30;

export function computeDealScore(rating: number, reviewCount: number): number {
  const confidence = 1 - Math.exp(-reviewCount / CONFIDENCE_K);
  return rating * confidence;
}

// ─── Deal selection ───────────────────────────────────────────────────────────

export async function selectNextDeal() {
  const candidates = await prisma.deal.findMany({
    where: {
      published: false,
      rating: { not: null },
      reviewCount: { not: null, gt: 0 },
      price: { not: null },
      affiliateWeb: { not: null },
    },
    include: { product: true },
    orderBy: { fetchedAt: 'desc' },
    take: 200,
  });

  if (candidates.length === 0) return undefined;

  let bestDeal = candidates[0];
  let bestScore = -1;

  for (const deal of candidates) {
    const score = computeDealScore(deal.rating!, deal.reviewCount!);
    if (score > bestScore) {
      bestScore = score;
      bestDeal = deal;
    }
  }

  logger.info(
    { dealId: bestDeal.id, asin: bestDeal.asin, score: bestScore.toFixed(2) },
    'Selected next deal for publishing'
  );

  return bestDeal;
}

// ─── Post template builder ───────────────────────────────────────────────────

function formatPrice(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

export function buildPostContent(deal: {
  product: { title: string };
  price: number | null;
  currentPrice: number | null;
  avgPrice: number | null;
  discount: number | null;
  affiliateWeb: string | null;
  reviewCount: number | null;
  rating: number | null;
}): string {
  const title = deal.product.title;
  // currentPrice = Keepa's actual deal price; price = Amazon API listing price (fallback)
  const dealPrice = deal.currentPrice ?? deal.price;
  const price = dealPrice != null ? formatPrice(dealPrice) : '–';
  const originalPrice = deal.avgPrice != null ? formatPrice(deal.avgPrice) : undefined;
  const discount = deal.discount != null ? deal.discount : undefined;
  const link = deal.affiliateWeb ?? '';
  const reviews = deal.reviewCount ?? 0;
  const rating = deal.rating != null ? deal.rating.toFixed(1) : '–';

  const lines: string[] = [];

  // Title
  lines.push(`💬 ${title}`);
  lines.push('');

  // Price line
  if (originalPrice && discount) {
    lines.push(`💰 A soli ${price}€ invece di ${originalPrice}€ (-${discount}%)`);
  } else {
    lines.push(`💰 A soli ${price}€`);
  }
  lines.push('');

  // Affiliate link
  lines.push(`🔗 ${link}`);
  lines.push('');

  // Rating + shipping
  lines.push(`⭐ ${reviews} Recensioni: ${rating} / 5.0`);
  lines.push('🚚 Venduto e spedito da Amazon');

  return lines.join('\n');
}

// ─── Channel dispatchers (stubs) ─────────────────────────────────────────────
// These will be replaced with actual WhatsApp/Telegram API integrations later.

export type ChannelName = 'WHATSAPP' | 'TELEGRAM';

interface ChannelResult {
  channel: ChannelName;
  success: boolean;
  error?: string;
}

interface ChannelPayload {
  postContent: string;
  imageUrl: string | undefined;
}

async function publishToWhatsApp(payload: ChannelPayload): Promise<ChannelResult> {
  // TODO: integrate with WhatsApp Business API or web bridge
  logger.info(
    { channel: 'WHATSAPP', length: payload.postContent.length },
    'Publishing to WhatsApp (stub)'
  );
  return { channel: 'WHATSAPP', success: true };
}

// ─── Telegram dispatcher ─────────────────────────────────────────────────────
// sendPhoto caption limit is 1024 chars. If the post fits, send photo+caption.
// Otherwise send photo alone then sendMessage with the full text.

const TELEGRAM_CAPTION_LIMIT = 1024;

async function publishToTelegram(payload: ChannelPayload): Promise<ChannelResult> {
  const { botToken, chatId } = config.telegram;
  if (!botToken || !chatId) {
    return {
      channel: 'TELEGRAM',
      success: false,
      error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured',
    };
  }

  const baseUrl = `https://api.telegram.org/bot${botToken}`;
  const { postContent, imageUrl } = payload;

  try {
    if (imageUrl && postContent.length <= TELEGRAM_CAPTION_LIMIT) {
      // Happy path: photo + caption in one message
      await axios.post(
        `${baseUrl}/sendPhoto`,
        {
          chat_id: chatId,
          photo: imageUrl,
          caption: postContent,
          parse_mode: 'HTML',
        },
        { timeout: 15000 }
      );
    } else if (imageUrl) {
      // Caption too long: send photo first, then text
      await axios.post(
        `${baseUrl}/sendPhoto`,
        {
          chat_id: chatId,
          photo: imageUrl,
        },
        { timeout: 15000 }
      );
      await axios.post(
        `${baseUrl}/sendMessage`,
        {
          chat_id: chatId,
          text: postContent,
          disable_web_page_preview: true,
        },
        { timeout: 15000 }
      );
    } else {
      // No image: text-only
      await axios.post(
        `${baseUrl}/sendMessage`,
        {
          chat_id: chatId,
          text: postContent,
          disable_web_page_preview: true,
        },
        { timeout: 15000 }
      );
    }

    logger.info({ channel: 'TELEGRAM', chatId }, 'Published to Telegram');
    return { channel: 'TELEGRAM', success: true };
  } catch (err) {
    const msg = axios.isAxiosError(err)
      ? (err.response?.data?.description ?? err.message)
      : (err as Error).message;
    logger.error({ channel: 'TELEGRAM', error: msg }, 'Telegram publish failed');
    return { channel: 'TELEGRAM', success: false, error: String(msg) };
  }
}

const CHANNELS: Array<{
  name: ChannelName;
  send: (payload: ChannelPayload) => Promise<ChannelResult>;
}> = [
  { name: 'WHATSAPP', send: publishToWhatsApp },
  { name: 'TELEGRAM', send: publishToTelegram },
];

// ─── Orchestration ────────────────────────────────────────────────────────────

export interface PublishResult {
  dealId: string;
  asin: string;
  postContent: string;
  channels: ChannelResult[];
  allSucceeded: boolean;
}

export async function runPublishCycle(): Promise<PublishResult | undefined> {
  const deal = await selectNextDeal();
  if (!deal) {
    logger.info('No unpublished deals available — skipping publish cycle');
    return undefined;
  }

  const postContent = buildPostContent(deal);
  const imageUrl = deal.product.imageLarge ?? deal.product.imageSmall ?? undefined;

  // Dispatch to all channels
  const results: ChannelResult[] = [];
  for (const channel of CHANNELS) {
    try {
      const result = await channel.send({ postContent, imageUrl });
      results.push(result);
    } catch (err) {
      results.push({
        channel: channel.name,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Record every publication attempt
  for (const result of results) {
    await prisma.publication.create({
      data: {
        dealId: deal.id,
        channel: result.channel,
        postContent,
        success: result.success,
      },
    });
  }

  // Mark deal as published only if ALL channels succeeded
  const allSucceeded = results.every(r => r.success);
  if (allSucceeded) {
    await prisma.deal.update({
      where: { id: deal.id },
      data: { published: true },
    });
    logger.info({ dealId: deal.id, asin: deal.asin }, 'Deal marked as published');
  } else {
    logger.warn(
      { dealId: deal.id, failures: results.filter(r => !r.success).map(r => r.channel) },
      'Deal NOT marked as published — some channels failed'
    );
  }

  return {
    dealId: deal.id,
    asin: deal.asin,
    postContent,
    channels: results,
    allSucceeded,
  };
}
