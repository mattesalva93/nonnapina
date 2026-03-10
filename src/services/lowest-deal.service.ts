import { config } from '../config/index.js';
import { createComponentLogger } from '../utils/logger.js';
import { sendErrorAlert } from './email.service.js';
import { prisma } from './product.service.js';
import {
  type ChannelName,
  type PublishResult,
  computeDealScore,
  buildPostContent as buildRegularPostContent,
} from './publish.service.js';
import { sendToWhatsAppChannel } from './whatsapp.service.js';
import axios from 'axios';

const logger = createComponentLogger('LowestDealService');

// ─── Headline templates ──────────────────────────────────────────────────────
// Each template receives a short product name and returns the headline.

const HEADLINE_TEMPLATES: Array<(name: string) => string> = [
  name => `${name} al nuovo minimo storico`,
  name => `Calo per ${name} al minimo storico`,
  name => `🔥 Prezzo più basso di sempre per ${name}`,
  name => `📉 ${name}: mai così economico`,
  name => `⚡ Minimo storico raggiunto: ${name}`,
];

function pickRandomHeadline(name: string): string {
  const idx = Math.floor(Math.random() * HEADLINE_TEMPLATES.length);
  return HEADLINE_TEMPLATES[idx](name);
}

// ─── Title shortener ─────────────────────────────────────────────────────────
// Strips trailing parenthesized specs and truncates to keep headlines readable.

function shortenTitle(title: string, maxLength = 50): string {
  const cleaned = title.replace(/\s*\([^)]*\)\s*$/g, '').trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength).replace(/\s+\S*$/, '') + '…';
}

// ─── Deal selection ──────────────────────────────────────────────────────────

const TOP_POOL_SIZE = 5;

export async function selectNextLowestDeal() {
  const candidates = await prisma.deal.findMany({
    where: {
      published: false,
      isLowest: true,
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

  const scored = candidates
    .map(deal => ({
      deal,
      score: computeDealScore(deal.discount!, deal.rating!, deal.reviewCount!),
    }))
    .sort((a, b) => b.score - a.score);

  const poolSize = Math.min(TOP_POOL_SIZE, scored.length);
  const pick = scored[Math.floor(Math.random() * poolSize)];

  logger.info(
    { dealId: pick.deal.id, asin: pick.deal.asin, score: pick.score.toFixed(2), poolSize },
    'Selected next lowest-price deal for publishing'
  );

  return pick.deal;
}

// ─── Post template builder ───────────────────────────────────────────────────

function formatPrice(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

export function buildLowestPostContent(deal: {
  product: { title: string };
  price: number | null;
  currentPrice: number | null;
  avgPrice: number | null;
  discount: number | null;
  affiliateWeb: string | null;
  reviewCount: number | null;
  rating: number | null;
}): string {
  const shortName = shortenTitle(deal.product.title);
  const headline = pickRandomHeadline(shortName);

  const dealPrice = deal.currentPrice ?? deal.price;
  const price = dealPrice != null ? formatPrice(dealPrice) : '–';
  const originalPrice = deal.avgPrice != null ? formatPrice(deal.avgPrice) : undefined;
  const discount = deal.discount != null ? deal.discount : undefined;
  const link = deal.affiliateWeb ?? '';
  const reviews = deal.reviewCount ?? 0;
  const rating = deal.rating != null ? deal.rating.toFixed(1) : '–';

  const lines: string[] = [];

  // Headline (alternative format)
  lines.push(`📢 ${headline}`);
  lines.push('');

  // Full title
  lines.push(`💬 ${deal.product.title}`);
  lines.push('');

  // Price line
  if (originalPrice && discount) {
    lines.push(`💰 Solo ${price}€ invece di ${originalPrice}€ (-${discount}%)`);
    lines.push('📊 Il prezzo pieno è calcolato sulla media degli ultimi 3 mesi');
  } else {
    lines.push(`💰 Solo ${price}€`);
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
      await axios.post(
        `${baseUrl}/sendPhoto`,
        { chat_id: chatId, photo: imageUrl, caption: postContent },
        { timeout: 15000 }
      );
    } else if (imageUrl) {
      await axios.post(
        `${baseUrl}/sendPhoto`,
        { chat_id: chatId, photo: imageUrl },
        { timeout: 15000 }
      );
      await axios.post(
        `${baseUrl}/sendMessage`,
        { chat_id: chatId, text: postContent, disable_web_page_preview: true },
        { timeout: 15000 }
      );
    } else {
      await axios.post(
        `${baseUrl}/sendMessage`,
        { chat_id: chatId, text: postContent, disable_web_page_preview: true },
        { timeout: 15000 }
      );
    }

    logger.info({ channel: 'TELEGRAM', chatId }, 'Lowest-deal published to Telegram');
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

export async function runLowestDealCycle(): Promise<PublishResult | undefined> {
  const deal = await selectNextLowestDeal();
  if (!deal) {
    logger.info('No unpublished lowest-price deals available — falling back to regular cycle');
    return undefined;
  }

  const postContent = buildLowestPostContent(deal);
  const imageUrl = deal.product.imageLarge ?? deal.product.imageSmall ?? undefined;

  const activeChannels = getActiveChannels();
  if (activeChannels.length === 0) {
    logger.warn('No channels configured — skipping lowest-deal publish');
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

  const anySucceeded = results.some(r => r.success);
  const allSucceeded = results.every(r => r.success);
  if (anySucceeded) {
    await prisma.deal.update({
      where: { id: deal.id },
      data: { published: true },
    });
    logger.info({ dealId: deal.id, asin: deal.asin }, 'Lowest-price deal marked as published');
  }

  if (!allSucceeded) {
    for (const failure of results.filter(r => !r.success)) {
      void sendErrorAlert({
        errorMessage: `Lowest-deal publish failed on channel ${failure.channel}: ${failure.error ?? 'Unknown error'}`,
        component: 'LowestDealService',
        severity: 'error',
        additionalData: { dealId: deal.id, asin: deal.asin, channel: failure.channel },
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
