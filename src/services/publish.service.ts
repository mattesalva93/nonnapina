import axios from 'axios';
import { config } from '../config/index.js';
import { createComponentLogger } from '../utils/logger.js';
import { sendErrorAlert } from './email.service.js';
import { prisma } from './product.service.js';
import { sendToWhatsAppChannel } from './whatsapp.service.js';

const logger = createComponentLogger('PublishService');

// ─── Scoring formula ──────────────────────────────────────────────────────────
// Combines the weighted confidence score with discount percentage.
// Both components are normalized to 0–1 and then combined with:
//   W_DISCOUNT    = 0.6  (discount is the dominant factor)
//   W_CONFIDENCE  = 0.4  (rating with review-count confidence adds context)
//
// normalizedDiscount   = clamp(discount, 0..100) / 100
// confidence           = 1 - e^(-reviewCount / K)              K = 30
// normalizedConfidence = rating * confidence / 5
const W_DISCOUNT = 0.6;
const W_CONFIDENCE = 0.4;
const MAX_RATING = 5;
const CONFIDENCE_K = 30;

export function computeDealScore(discount: number, rating: number, reviewCount: number): number {
  const normalizedDiscount = Math.min(Math.max(discount, 0), 100) / 100;
  const confidence = 1 - Math.exp(-reviewCount / CONFIDENCE_K);
  const normalizedConfidence = (rating * confidence) / MAX_RATING;
  return W_DISCOUNT * normalizedDiscount + W_CONFIDENCE * normalizedConfidence;
}

// ─── Deal selection ───────────────────────────────────────────────────────────

const TOP_POOL_SIZE = 5;

export async function selectNextDeal() {
  const candidates = await prisma.deal.findMany({
    where: {
      published: false,
      rating: { not: null },
      reviewCount: { not: null, gt: 0 },
      discount: { not: null, gt: 0 },
      price: { not: null },
      affiliateWeb: { not: null },
    },
    include: { product: true },
    orderBy: { fetchedAt: 'desc' },
    take: 200,
  });

  if (candidates.length === 0) return undefined;

  // Score all candidates and sort descending
  const scored = candidates
    .map(deal => ({
      deal,
      score: computeDealScore(deal.discount!, deal.rating!, deal.reviewCount!),
    }))
    .sort((a, b) => b.score - a.score);

  // Pick randomly from the top pool to avoid a predictable descending pattern
  const poolSize = Math.min(TOP_POOL_SIZE, scored.length);
  const pick = scored[Math.floor(Math.random() * poolSize)];

  logger.info(
    { dealId: pick.deal.id, asin: pick.deal.asin, score: pick.score.toFixed(2), poolSize },
    'Selected next deal for publishing (random from top pool)'
  );

  return pick.deal;
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

// ─── Channel dispatchers ─────────────────────────────────────────────────────

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
  const result = await sendToWhatsAppChannel(payload.postContent, payload.imageUrl);
  if (!result.success) {
    logger.error({ channel: 'WHATSAPP', error: result.error }, 'WhatsApp publish failed');
  }
  return { channel: 'WHATSAPP', success: result.success, error: result.error };
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

interface ChannelDef {
  name: ChannelName;
  send: (payload: ChannelPayload) => Promise<ChannelResult>;
}

/**
 * Build the active channels list dynamically.
 * A channel is only included if it has the minimum configuration.
 * This prevents unconfigured channels from blocking the published flag.
 */
function getActiveChannels(): ChannelDef[] {
  const channels: ChannelDef[] = [];

  if (config.telegram.botToken && config.telegram.chatId) {
    channels.push({ name: 'TELEGRAM', send: publishToTelegram });
  }

  if (config.whatsapp.channelId) {
    channels.push({ name: 'WHATSAPP', send: publishToWhatsApp });
  }

  return channels;
}

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

  // Dispatch to all active channels
  const activeChannels = getActiveChannels();
  if (activeChannels.length === 0) {
    logger.warn('No channels configured — skipping publish');
    return undefined;
  }

  const results: ChannelResult[] = [];
  for (const channel of activeChannels) {
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

  // Mark deal as published if at least one channel succeeded
  const anySucceeded = results.some(r => r.success);
  const allSucceeded = results.every(r => r.success);
  if (anySucceeded) {
    await prisma.deal.update({
      where: { id: deal.id },
      data: { published: true },
    });
    logger.info({ dealId: deal.id, asin: deal.asin }, 'Deal marked as published');
  }

  if (!allSucceeded) {
    const failedChannels = results.filter(r => !r.success);
    logger.warn(
      { dealId: deal.id, failures: failedChannels.map(r => r.channel) },
      'Some channels failed during publish'
    );
    for (const failure of failedChannels) {
      void sendErrorAlert({
        errorMessage: `Publish failed on channel ${failure.channel}: ${failure.error ?? 'Unknown error'}`,
        component: 'PublishService',
        severity: 'error',
        additionalData: {
          dealId: deal.id,
          asin: deal.asin,
          channel: failure.channel,
        },
      });
    }
  }

  return {
    dealId: deal.id,
    asin: deal.asin,
    postContent,
    channels: results,
    allSucceeded,
  };
}
