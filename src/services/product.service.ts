import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { EnrichedProduct } from '../types/index.js';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

export { prisma };

export async function startScrapeRun() {
  return prisma.scrapeRun.create({ data: {} });
}

export async function completeScrapeRun(id: string, totalDeals: number) {
  return prisma.scrapeRun.update({
    where: { id },
    data: { status: 'COMPLETED', completedAt: new Date(), totalDeals },
  });
}

export async function failScrapeRun(id: string, errorMessage: string) {
  return prisma.scrapeRun.update({
    where: { id },
    data: { status: 'FAILED', completedAt: new Date(), errorMessage },
  });
}

export async function saveProducts(
  products: EnrichedProduct[],
  scrapeRunId: string
): Promise<void> {
  for (const product of products) {
    await prisma.product.upsert({
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

    await prisma.deal.create({
      data: {
        asin: product.asin,
        scrapeRunId,
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
      },
    });
  }
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
