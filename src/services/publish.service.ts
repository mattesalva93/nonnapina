import { config } from '../config/index.js';
import { formatPrice } from '../utils/format.js';
import { createComponentLogger } from '../utils/logger.js';
import { amazonService } from './amazon.js';
import {
  areAllChannelsReady,
  dispatchToChannels,
  getActiveChannels,
  markDealPublished,
  recordPublications,
} from './channels/channel.registry.js';
import type { ChannelResult } from './channels/channel.types.js';
import { prisma, updateDealPrice } from './product.service.js';
import { computeDealScore } from './scoring.js';

export type { ChannelName } from './channels/channel.types.js';
export { computeDealScore } from './scoring.js';

const logger = createComponentLogger('PublishService');

// ─── Deal selection ───────────────────────────────────────────────────────────

const TOP_POOL_SIZE = 5;

export async function selectNextDeal(excludeAsins: Set<string> = new Set()) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const candidates = await prisma.deal.findMany({
    where: {
      published: false,
      rating: { not: null },
      reviewCount: { not: null, gt: 0 },
      discount: { not: null, gt: 0 },
      price: { not: null },
      affiliateWeb: { not: null },
      fetchedAt: { gte: startOfDay, lt: endOfDay },
      ...(excludeAsins.size > 0 && { asin: { notIn: [...excludeAsins] } }),
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

// ─── Price guard via Amazon API ───────────────────────────────────────────────

const MAX_PRICE_CHECK_ATTEMPTS = 5;

async function verifyDealPrice(asin: string): Promise<number | undefined> {
  try {
    const linkOptions = { storefront: config.amazon.storefrontId };
    const products = await amazonService.getProductDetails([asin], linkOptions);
    return products[0]?.price;
  } catch (err) {
    logger.warn({ asin, err: (err as Error).message }, 'Amazon API price check failed');
    return undefined;
  }
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

  const excludeAsins = new Set<string>();
  let selectedDeal: Awaited<ReturnType<typeof selectNextDeal>> | undefined;
  let verifiedPrice: number | undefined;

  // Price guard loop: select deal, verify price, skip if increased
  for (let attempt = 0; attempt < MAX_PRICE_CHECK_ATTEMPTS; attempt++) {
    const deal = await selectNextDeal(excludeAsins);
    if (!deal) {
      logger.info('No unpublished deals available — skipping publish cycle');
      return undefined;
    }

    const newPrice = await verifyDealPrice(deal.asin);

    if (newPrice === undefined) {
      // API call failed — publish with existing data
      logger.info({ asin: deal.asin }, 'Price check unavailable — publishing with existing data');
      selectedDeal = deal;
      break;
    }

    const oldPrice = deal.currentPrice ?? deal.price;
    if (oldPrice !== undefined && oldPrice !== null && newPrice > oldPrice) {
      // Price increased — update DB and skip deal
      logger.warn(
        { asin: deal.asin, oldPrice, newPrice, attempt },
        'Deal price increased — skipping'
      );
      await updateDealPrice(deal.id, newPrice);
      excludeAsins.add(deal.asin);
      continue;
    }

    // Price OK (same or decreased) — update DB if changed and proceed
    if (newPrice !== oldPrice) {
      await updateDealPrice(deal.id, newPrice);
      deal.currentPrice = newPrice;
    }
    verifiedPrice = newPrice;
    selectedDeal = deal;
    break;
  }

  if (!selectedDeal) {
    logger.warn('All candidate deals failed price check — skipping publish cycle');
    return undefined;
  }

  const postContent = buildPostContent(selectedDeal);
  const imageUrl = selectedDeal.product.imageLarge ?? selectedDeal.product.imageSmall ?? undefined;

  const activeChannels = getActiveChannels();
  if (activeChannels.length === 0) {
    logger.warn('No channels configured — skipping publish');
    return undefined;
  }

  const results = await dispatchToChannels(activeChannels, { postContent, imageUrl });

  await recordPublications(selectedDeal.id, postContent, results);
  const { allSucceeded } = await markDealPublished(
    selectedDeal.id,
    selectedDeal.asin,
    results,
    'PublishService'
  );

  return {
    dealId: selectedDeal.id,
    asin: selectedDeal.asin,
    postContent,
    channels: results,
    allSucceeded,
  };
}
