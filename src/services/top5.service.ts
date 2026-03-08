import axios from 'axios';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { generateTop5Image, type Top5ImageDeal } from './image.service.js';
import { prisma } from './product.service.js';
import { sendBufferToWhatsAppChannel, sendToWhatsAppChannel } from './whatsapp.service.js';

// ─── Top 5 scoring formula ───────────────────────────────────────────────────
// Combines the weighted confidence score with discount percentage.
// Both components are normalized to 0–1 and then combined with:
//   W_DISCOUNT    = 0.6  (discount is the dominant factor)
//   W_CONFIDENCE  = 0.4  (rating with review-count confidence adds context)
//
// normalizedDiscount   = clamp(discount, 0..100) / 100
// confidence           = 1 - e^(-reviewCount / K)              K = 30
// normalizedConfidence = rating * confidence / 5
//
// Examples:
//   discount=60%, rating=4.5, reviews=200 → 0.6×0.60 + 0.4×(4.5×1.00/5) = 0.72
//   discount=40%, rating=4.9, reviews=500 → 0.6×0.40 + 0.4×(4.9×1.00/5) = 0.63
//   discount=70%, rating=3.8, reviews=50  → 0.6×0.70 + 0.4×(3.8×0.81/5) = 0.67

const W_DISCOUNT = 0.6;
const W_CONFIDENCE = 0.4;
const MAX_RATING = 5;
const CONFIDENCE_K = 30;
const TOP_5_COUNT = 5;

export function computeTop5Score(discount: number, rating: number, reviewCount: number): number {
  const normalizedDiscount = Math.min(Math.max(discount, 0), 100) / 100;
  const confidence = 1 - Math.exp(-reviewCount / CONFIDENCE_K);
  const normalizedConfidence = (rating * confidence) / MAX_RATING;
  return W_DISCOUNT * normalizedDiscount + W_CONFIDENCE * normalizedConfidence;
}

// ─── Deal selection ───────────────────────────────────────────────────────────

export async function selectTop5Deals() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const candidates = await prisma.deal.findMany({
    where: {
      rating: { not: null },
      reviewCount: { not: null, gt: 0 },
      discount: { not: null, gt: 0 },
      price: { not: null },
      affiliateWeb: { not: null },
      fetchedAt: { gte: startOfDay, lt: endOfDay },
    },
    include: { product: true },
  });

  if (candidates.length === 0) return [];

  const scored = candidates
    .map(deal => ({
      deal,
      score: computeTop5Score(deal.discount!, deal.rating!, deal.reviewCount!),
    }))
    .sort((a, b) => b.score - a.score);

  const top5 = scored.slice(0, TOP_5_COUNT);

  logger.info(
    {
      count: top5.length,
      deals: top5.map(d => ({
        asin: d.deal.asin,
        discount: d.deal.discount,
        rating: d.deal.rating,
        reviews: d.deal.reviewCount,
        score: d.score.toFixed(3),
      })),
    },
    'Selected top 5 deals of the day'
  );

  return top5.map(d => d.deal);
}

// ─── Post template builder ───────────────────────────────────────────────────

function formatPrice(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

export function buildTop5PostContent(
  deals: Array<{
    product: { title: string };
    price: number | null;
    currentPrice: number | null;
    avgPrice: number | null;
    discount: number | null;
    affiliateWeb: string | null;
    reviewCount: number | null;
    rating: number | null;
  }>
): string {
  const lines: string[] = [];

  lines.push('🏆 TOP 5 OFFERTE DEL GIORNO 🏆');
  lines.push('');

  deals.forEach((deal, index) => {
    const num = index + 1;
    const title = deal.product.title;
    const dealPrice = deal.currentPrice ?? deal.price;
    const price = dealPrice != null ? formatPrice(dealPrice) : '–';
    const originalPrice = deal.avgPrice != null ? formatPrice(deal.avgPrice) : undefined;
    const discount = deal.discount != null ? deal.discount : undefined;
    const link = deal.affiliateWeb ?? '';
    const reviews = deal.reviewCount ?? 0;
    const rating = deal.rating != null ? deal.rating.toFixed(1) : '–';

    lines.push(`${num}. 💬 ${title}`);

    if (originalPrice && discount) {
      lines.push(`   💰 ${price}€ invece di ${originalPrice}€ (-${discount}%)`);
    } else {
      lines.push(`   💰 ${price}€`);
    }

    lines.push(`   ⭐ ${reviews} Recensioni: ${rating} / 5.0`);
    lines.push(`   🔗 ${link}`);
    lines.push('');
  });

  lines.push('🚚 Venduto e spedito da Amazon');

  return lines.join('\n');
}

// ─── Channel dispatchers ─────────────────────────────────────────────────────

type ChannelName = 'WHATSAPP' | 'TELEGRAM';

interface ChannelResult {
  channel: ChannelName;
  success: boolean;
  error?: string;
}

const TELEGRAM_CAPTION_LIMIT = 1024;

async function publishTop5ToTelegram(
  postContent: string,
  imageBuffer: Buffer | undefined
): Promise<ChannelResult> {
  const { botToken, chatId } = config.telegram;
  if (!botToken || !chatId) {
    return { channel: 'TELEGRAM', success: false, error: 'Telegram not configured' };
  }

  const baseUrl = `https://api.telegram.org/bot${botToken}`;

  try {
    if (imageBuffer) {
      const form = new FormData();
      form.set('chat_id', chatId);
      form.set('photo', new Blob([new Uint8Array(imageBuffer)], { type: 'image/png' }), 'top5.png');
      if (postContent.length <= TELEGRAM_CAPTION_LIMIT) {
        form.set('caption', postContent);
      }

      // Use native fetch for multipart/form-data file upload
      const response = await fetch(`${baseUrl}/sendPhoto`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        const body = (await response.json()) as { description?: string };
        throw new Error(body.description ?? `HTTP ${response.status}`);
      }

      // Send text separately if caption was too long
      if (postContent.length > TELEGRAM_CAPTION_LIMIT) {
        await axios.post(
          `${baseUrl}/sendMessage`,
          { chat_id: chatId, text: postContent, disable_web_page_preview: true },
          { timeout: 15_000 }
        );
      }
    } else {
      await axios.post(
        `${baseUrl}/sendMessage`,
        { chat_id: chatId, text: postContent, disable_web_page_preview: true },
        { timeout: 15_000 }
      );
    }

    logger.info({ channel: 'TELEGRAM' }, 'Top 5 published to Telegram');
    return { channel: 'TELEGRAM', success: true };
  } catch (err) {
    const msg = axios.isAxiosError(err)
      ? (err.response?.data?.description ?? err.message)
      : (err as Error).message;
    logger.error({ channel: 'TELEGRAM', error: msg }, 'Top 5 Telegram publish failed');
    return { channel: 'TELEGRAM', success: false, error: String(msg) };
  }
}

async function publishTop5ToWhatsApp(
  postContent: string,
  imageBuffer: Buffer | undefined
): Promise<ChannelResult> {
  const result = imageBuffer
    ? await sendBufferToWhatsAppChannel(postContent, imageBuffer)
    : await sendToWhatsAppChannel(postContent, undefined);

  if (!result.success) {
    logger.error({ channel: 'WHATSAPP', error: result.error }, 'Top 5 WhatsApp publish failed');
  }
  return { channel: 'WHATSAPP', success: result.success, error: result.error };
}

// ─── Orchestration ────────────────────────────────────────────────────────────

interface ChannelDef {
  name: ChannelName;
  send: () => Promise<ChannelResult>;
}

export interface Top5PublishResult {
  dealCount: number;
  deals: Array<{ asin: string; discount: number | null; score: number }>;
  postContent: string;
  channels: ChannelResult[];
  allSucceeded: boolean;
}

export async function runTop5PublishCycle(): Promise<Top5PublishResult | undefined> {
  const deals = await selectTop5Deals();
  if (deals.length === 0) {
    logger.info('No eligible deals found for top 5 — skipping');
    return undefined;
  }

  const postContent = buildTop5PostContent(deals);

  // Generate composite image (graceful degradation: text-only if it fails)
  let imageBuffer: Buffer | undefined;
  try {
    const imageDealData: Top5ImageDeal[] = deals.map(d => ({
      imageUrl: d.product.imageLarge ?? d.product.imageSmall ?? undefined,
      discount: d.discount ?? 0,
    }));
    imageBuffer = await generateTop5Image(imageDealData);
  } catch (err) {
    logger.error(
      { error: (err as Error).message },
      'Top 5 image generation failed — sending text only'
    );
  }

  // Build active channels list
  const activeChannels: ChannelDef[] = [];

  if (config.telegram.botToken && config.telegram.chatId) {
    activeChannels.push({
      name: 'TELEGRAM',
      send: () => publishTop5ToTelegram(postContent, imageBuffer),
    });
  }

  if (config.whatsapp.channelId) {
    activeChannels.push({
      name: 'WHATSAPP',
      send: () => publishTop5ToWhatsApp(postContent, imageBuffer),
    });
  }

  if (activeChannels.length === 0) {
    logger.warn('No channels configured — skipping top 5 publish');
    return undefined;
  }

  // Dispatch to all channels sequentially
  const results: ChannelResult[] = [];
  for (const channel of activeChannels) {
    try {
      const result = await channel.send();
      results.push(result);
    } catch (err) {
      results.push({
        channel: channel.name,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Record publication attempts for each deal
  for (const deal of deals) {
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
  }

  const allSucceeded = results.every(r => r.success);
  const dealScores = deals.map(d => ({
    asin: d.asin,
    discount: d.discount,
    score: computeTop5Score(d.discount ?? 0, d.rating ?? 0, d.reviewCount ?? 0),
  }));

  logger.info(
    {
      dealCount: deals.length,
      channels: results.map(r => ({ channel: r.channel, success: r.success })),
    },
    'Top 5 publish cycle completed'
  );

  return {
    dealCount: deals.length,
    deals: dealScores,
    postContent,
    channels: results,
    allSucceeded,
  };
}
