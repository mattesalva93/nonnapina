import { formatPrice } from '../utils/format.js';
import { createComponentLogger } from '../utils/logger.js';
import {
  areAllChannelsReady,
  dispatchToChannels,
  getActiveChannels,
  markDealPublished,
  recordPublications,
} from './channels/channel.registry.js';
import type { ChannelResult } from './channels/channel.types.js';
import { prisma } from './product.service.js';
import { computeDealScore } from './scoring.js';

export type { ChannelName } from './channels/channel.types.js';
export { computeDealScore } from './scoring.js';

const logger = createComponentLogger('PublishService');

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
    'Selected next deal for publishing (random from top pool)'
  );

  return pick.deal;
}

// ─── Post template builder ───────────────────────────────────────────────────

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
  const dealPrice = deal.currentPrice ?? deal.price;
  const price = dealPrice != null ? formatPrice(dealPrice) : '–';
  const originalPrice = deal.avgPrice != null ? formatPrice(deal.avgPrice) : undefined;
  const discount = deal.discount != null ? deal.discount : undefined;
  const link = deal.affiliateWeb ?? '';
  const reviews = deal.reviewCount ?? 0;
  const rating = deal.rating != null ? deal.rating.toFixed(1) : '–';

  const lines: string[] = [];

  lines.push(`💬 ${title}`);
  lines.push('');

  if (originalPrice && discount) {
    lines.push(`💰 Solo ${price}€ invece di ${originalPrice}€ (-${discount}%)`);
    lines.push('📊 Il prezzo pieno è calcolato sulla media degli ultimi 3 mesi');
  } else {
    lines.push(`💰 Solo ${price}€`);
  }
  lines.push('');

  lines.push(`🔗 ${link}`);
  lines.push('');

  lines.push(`⭐ ${reviews} Recensioni: ${rating} / 5.0`);
  lines.push('🚚 Venduto e spedito da Amazon');

  return lines.join('\n');
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
  // All configured channels must be operational before publishing
  const channelCheck = areAllChannelsReady();
  if (!channelCheck.ready) {
    logger.warn({ reason: channelCheck.reason }, 'Channels not ready — skipping publish cycle');
    return undefined;
  }

  const deal = await selectNextDeal();
  if (!deal) {
    logger.info('No unpublished deals available — skipping publish cycle');
    return undefined;
  }

  const postContent = buildPostContent(deal);
  const imageUrl = deal.product.imageLarge ?? deal.product.imageSmall ?? undefined;

  const activeChannels = getActiveChannels();
  if (activeChannels.length === 0) {
    logger.warn('No channels configured — skipping publish');
    return undefined;
  }

  const results = await dispatchToChannels(activeChannels, { postContent, imageUrl });

  await recordPublications(deal.id, postContent, results);
  const { allSucceeded } = await markDealPublished(deal.id, deal.asin, results, 'PublishService');

  return {
    dealId: deal.id,
    asin: deal.asin,
    postContent,
    channels: results,
    allSucceeded,
  };
}
