import { formatPrice } from '../utils/format.js';
import { createComponentLogger } from '../utils/logger.js';
import {
  dispatchToChannels,
  getActiveChannels,
  markDealPublished,
  recordPublications,
} from './channels/channel.registry.js';
import { prisma } from './product.service.js';
import type { PublishResult } from './publish.service.js';
import { computeDealScore } from './scoring.js';

const logger = createComponentLogger('LowestDealService');

// ─── Headline templates ──────────────────────────────────────────────────────

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

  lines.push(`📢 ${headline}`);
  lines.push('');

  lines.push(`💬 ${deal.product.title}`);
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

  const results = await dispatchToChannels(activeChannels, { postContent, imageUrl });

  await recordPublications(deal.id, postContent, results);
  const { allSucceeded } = await markDealPublished(
    deal.id,
    deal.asin,
    results,
    'LowestDealService'
  );

  return {
    dealId: deal.id,
    asin: deal.asin,
    postContent,
    channels: results,
    allSucceeded,
  };
}
