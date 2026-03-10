import { config } from '../config/index.js';
import { formatPrice } from '../utils/format.js';
import { createComponentLogger } from '../utils/logger.js';
import { dispatchToBufferChannels } from './channels/channel.registry.js';
import type { BufferChannelDef, ChannelResult } from './channels/channel.types.js';
import { publishBufferToTelegram } from './channels/telegram.channel.js';
import { publishBufferToWhatsApp } from './channels/whatsapp.channel.js';
import { sendErrorAlert } from './email.service.js';
import { generateTop5Image, type Top5ImageDeal } from './image.service.js';
import { prisma } from './product.service.js';
import { computeDealScore } from './scoring.js';

const logger = createComponentLogger('Top5Service');

export { computeDealScore as computeTop5Score } from './scoring.js';

const TOP_5_COUNT = 5;

// ─── Deal selection ───────────────────────────────────────────────────────────

export function normalizeTitleForDedup(title: string): string {
  return title
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .toLowerCase()
    .trim();
}

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
      score: computeDealScore(deal.discount!, deal.rating!, deal.reviewCount!),
    }))
    .sort((a, b) => b.score - a.score);

  const byAsin = new Map<string, (typeof scored)[0]>();
  for (const item of scored) {
    if (!byAsin.has(item.deal.asin)) {
      byAsin.set(item.deal.asin, item);
    }
  }
  const uniqueByAsin = [...byAsin.values()].sort((a, b) => b.score - a.score);

  const selected: (typeof scored)[0][] = [];
  const usedParentAsins = new Set<string>();
  const usedTitleBases = new Set<string>();

  for (const item of uniqueByAsin) {
    if (selected.length >= TOP_5_COUNT) break;

    const parentAsin = item.deal.product.parentAsin;
    if (parentAsin && usedParentAsins.has(parentAsin)) continue;

    const titleBase = normalizeTitleForDedup(item.deal.product.title);
    if (usedTitleBases.has(titleBase)) continue;

    selected.push(item);
    if (parentAsin) usedParentAsins.add(parentAsin);
    usedTitleBases.add(titleBase);
  }

  logger.info(
    {
      count: selected.length,
      deals: selected.map(d => ({
        asin: d.deal.asin,
        discount: d.deal.discount,
        rating: d.deal.rating,
        reviews: d.deal.reviewCount,
        score: d.score.toFixed(3),
      })),
    },
    'Selected top 5 deals of the day'
  );

  return selected.map(d => d.deal);
}

// ─── Post template builder ───────────────────────────────────────────────────

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

  deals.forEach(deal => {
    const title = deal.product.title;
    const dealPrice = deal.currentPrice ?? deal.price;
    const price = dealPrice != null ? formatPrice(dealPrice) : '–';
    const originalPrice = deal.avgPrice != null ? formatPrice(deal.avgPrice) : undefined;
    const discount = deal.discount != null ? deal.discount : undefined;
    const link = deal.affiliateWeb ?? '';
    const reviews = deal.reviewCount ?? 0;
    const rating = deal.rating != null ? deal.rating.toFixed(1) : '–';

    lines.push(`💬 ${title}`);

    if (originalPrice && discount) {
      lines.push(`💰 Solo ${price}€ invece di ${originalPrice}€ (-${discount}%)`);
    } else {
      lines.push(`💰 Solo ${price}€`);
    }

    lines.push(`⭐ ${reviews} Recensioni: ${rating} / 5.0`);
    lines.push(`🔗 ${link}`);
    lines.push('');
  });

  lines.push('📊 Il prezzo pieno è calcolato sulla media degli ultimi 3 mesi');
  lines.push('');
  lines.push('🚚 Venduto e spedito da Amazon');

  return lines.join('\n');
}

// ─── Orchestration ────────────────────────────────────────────────────────────

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
    void sendErrorAlert({
      errorMessage: `Top 5 image generation failed: ${(err as Error).message}`,
      errorStack: (err as Error).stack,
      component: 'Top5Service',
      severity: 'warning',
    });
  }

  const activeChannels: BufferChannelDef[] = [];

  if (config.telegram.botToken && config.telegram.chatId) {
    activeChannels.push({
      name: 'TELEGRAM',
      send: () => publishBufferToTelegram(postContent, imageBuffer),
    });
  }

  if (config.whatsapp.channelId) {
    activeChannels.push({
      name: 'WHATSAPP',
      send: () => publishBufferToWhatsApp(postContent, imageBuffer),
    });
  }

  if (activeChannels.length === 0) {
    logger.warn('No channels configured — skipping top 5 publish');
    return undefined;
  }

  const results = await dispatchToBufferChannels(activeChannels);

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
  if (!allSucceeded) {
    for (const failure of results.filter(r => !r.success)) {
      void sendErrorAlert({
        errorMessage: `Top 5 publish failed on channel ${failure.channel}: ${failure.error ?? 'Unknown error'}`,
        component: 'Top5Service',
        severity: 'error',
        additionalData: { channel: failure.channel, dealCount: deals.length },
      });
    }
  }

  const dealScores = deals.map(d => ({
    asin: d.asin,
    discount: d.discount,
    score: computeDealScore(d.discount ?? 0, d.rating ?? 0, d.reviewCount ?? 0),
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
