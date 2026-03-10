import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';
import type { EnrichedProduct } from '../types/index.js';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('ProductService');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

export { prisma };

export async function startScrapeRun() {
  const run = await prisma.scrapeRun.create({ data: {} });
  logger.info({ scrapeRunId: run.id }, 'Scrape run created');
  return run;
}

export async function completeScrapeRun(id: string, totalDeals: number) {
  logger.info({ scrapeRunId: id, totalDeals }, 'Completing scrape run');
  return prisma.scrapeRun.update({
    where: { id },
    data: { status: 'COMPLETED', completedAt: new Date(), totalDeals },
  });
}

export async function failScrapeRun(id: string, errorMessage: string) {
  logger.error({ scrapeRunId: id, errorMessage }, 'Marking scrape run as FAILED');
  return prisma.scrapeRun.update({
    where: { id },
    data: { status: 'FAILED', completedAt: new Date(), errorMessage },
  });
}

export async function saveProducts(
  products: EnrichedProduct[],
  scrapeRunId: string
): Promise<number> {
  // Pre-fetch all existing deals in a single query (eliminates N findFirst calls)
  const existingDeals = await prisma.deal.findMany({
    where: { asin: { in: products.map(p => p.asin) } },
    orderBy: { fetchedAt: 'desc' },
    distinct: ['asin'],
  });
  const dealsByAsin = new Map(existingDeals.map(d => [d.asin, d]));

  let savedCount = 0;

  await prisma.$transaction(async tx => {
    for (const product of products) {
      await tx.product.upsert({
        where: { asin: product.asin },
        update: {
          parentAsin: product.parentASIN,
          title: product.title,
          marketplace: product.marketplace,
          imageSmall: product.image.small,
          imageLarge: product.image.large,
          features: product.features,
        },
        create: {
          asin: product.asin,
          parentAsin: product.parentASIN,
          title: product.title,
          marketplace: product.marketplace,
          imageSmall: product.image.small,
          imageLarge: product.image.large,
          features: product.features,
        },
      });

      const existingDeal = dealsByAsin.get(product.asin);

      const dealData = {
        category: product.category,
        price: product.price,
        currency: product.currency ?? 'EUR',
        avgPrice: product.keepaAvgPrice,
        currentPrice: product.keepaCurrentPrice,
        discount: product.keepaDiscount,
        rating: product.rating ?? product.keepaRating,
        reviewCount: product.ratingCount ?? product.keepaReviewCount,
        affiliateWeb: product.affiliateLinks.web,
        affiliateStore: product.affiliateLinks.storefront,
        isLowest: product.keepaIsLowest,
      };

      if (existingDeal) {
        const priceChanged =
          existingDeal.price !== (dealData.price ?? null) ||
          existingDeal.avgPrice !== (dealData.avgPrice ?? null) ||
          existingDeal.currentPrice !== (dealData.currentPrice ?? null) ||
          existingDeal.discount !== (dealData.discount ?? null);

        const otherFieldsChanged =
          existingDeal.category !== dealData.category ||
          existingDeal.rating !== (dealData.rating ?? null) ||
          existingDeal.reviewCount !== (dealData.reviewCount ?? null);

        const isLowestChanged = existingDeal.isLowest !== dealData.isLowest;

        if (!priceChanged && !otherFieldsChanged && !isLowestChanged) {
          logger.debug({ asin: product.asin }, 'Deal unchanged at save time, skipping');
          continue;
        }

        await tx.deal.update({
          where: { id: existingDeal.id },
          data: {
            ...dealData,
            scrapeRunId,
            fetchedAt: new Date(),
            ...(priceChanged && { published: false }),
          },
        });
        logger.debug({ asin: product.asin, dealId: existingDeal.id, priceChanged }, 'Deal updated');
      } else {
        await tx.deal.create({
          data: { asin: product.asin, scrapeRunId, ...dealData },
        });
      }
      savedCount++;
    }
  });

  return savedCount;
}

export interface DealDupCheckResult {
  status: 'new' | 'updated' | 'unchanged';
  existingDealId?: string;
}

export async function checkDealDuplicate(
  asin: string,
  keepaData: { avgPrice?: number; currentPrice?: number; discount?: number }
): Promise<DealDupCheckResult> {
  const existingDeal = await prisma.deal.findFirst({
    where: { asin },
    orderBy: { fetchedAt: 'desc' },
  });

  if (!existingDeal) {
    return { status: 'new' };
  }

  const priceFieldsMatch =
    existingDeal.avgPrice === (keepaData.avgPrice ?? null) &&
    existingDeal.currentPrice === (keepaData.currentPrice ?? null) &&
    existingDeal.discount === (keepaData.discount ?? null);

  if (priceFieldsMatch) {
    return { status: 'unchanged', existingDealId: existingDeal.id };
  }

  return { status: 'updated', existingDealId: existingDeal.id };
}

export interface GetDealsFilters {
  category?: string;
  scrapeRunId?: string;
  limit?: number;
  offset?: number;
}

export async function getDeals(filters: GetDealsFilters = {}) {
  const { category, scrapeRunId, limit = 50, offset = 0 } = filters;
  return prisma.deal.findMany({
    where: {
      ...(category && { category }),
      ...(scrapeRunId && { scrapeRunId }),
    },
    include: { product: true },
    orderBy: { fetchedAt: 'desc' },
    take: limit,
    skip: offset,
  });
}

export async function getProducts(filters: { limit?: number; offset?: number } = {}) {
  const { limit = 50, offset = 0 } = filters;
  return prisma.product.findMany({
    orderBy: { updatedAt: 'desc' },
    take: limit,
    skip: offset,
  });
}

export async function markDealsAsLowest(asins: string[]): Promise<number> {
  if (asins.length === 0) return 0;

  const result = await prisma.deal.updateMany({
    where: { asin: { in: asins }, isLowest: false },
    data: { isLowest: true },
  });

  logger.debug({ updatedCount: result.count, asinCount: asins.length }, 'Marked deals as isLowest');
  return result.count;
}

export async function getProductByAsin(asin: string) {
  return prisma.product.findUnique({
    where: { asin },
    include: { deals: { orderBy: { fetchedAt: 'desc' }, take: 10 } },
  });
}

export async function getScrapeRuns(limit = 10) {
  return prisma.scrapeRun.findMany({
    orderBy: { startedAt: 'desc' },
    take: limit,
    include: { _count: { select: { deals: true } } },
  });
}

export async function getScrapeRunById(id: string) {
  return prisma.scrapeRun.findUnique({ where: { id } });
}

export async function getActiveRun() {
  return prisma.scrapeRun.findFirst({ where: { status: 'RUNNING' } });
}
