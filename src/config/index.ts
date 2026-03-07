import 'dotenv/config';
import { z } from 'zod';

const configSchema = z.object({
  server: z.object({
    port: z.number().int().positive().default(3000),
    nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
    cronSchedule: z.string().default('15 8,20 * * *'),
    publishCronSchedule: z.string().default('*/30 * * * *'),
  }),
  database: z.object({
    url: z.string().default(''),
  }),
  amazon: z.object({
    accessKey: z.string().min(1),
    secretKey: z.string().min(1),
    partnerTag: z.string().min(1),
    marketplace: z.string().default('IT'),
    storefrontId: z.string().optional(),
  }),
  keepa: z.object({
    categories: z.array(z.string()).default(['5']),
    maxProductsPerCategory: z.number().int().positive().default(10),
    scrapingDelayMs: z.number().int().positive().default(2000),
  }),
  output: z.object({
    filePath: z.string().default('./output/deals.json'),
    productsFilePath: z.string().default('./output/products-complete.json'),
  }),
  linkGeneration: z.object({
    includeStorefrontLinks: z.boolean().default(false),
  }),
  notes: z.object({
    dateForPosts: z.string().default(''),
    topReviewCount: z.number().int().positive().default(5),
    minReviews: z.number().int().nonnegative().default(10),
    topDealsCount: z.number().int().positive().default(5),
  }),
  telegram: z.object({
    botToken: z.string().default(''),
    chatId: z.string().default(''),
  }),
});

export type AppConfig = z.infer<typeof configSchema>;

const rawConfig = {
  server: {
    port: parseInt(process.env.PORT ?? '3000'),
    nodeEnv: (process.env.NODE_ENV ?? 'development') as 'development' | 'production' | 'test',
    cronSchedule: process.env.SCRAPE_CRON ?? '15 8,20 * * *',
    publishCronSchedule: process.env.PUBLISH_CRON ?? '*/30 * * * *',
  },
  database: {
    url: process.env.DATABASE_URL ?? '',
  },
  amazon: {
    accessKey: process.env.AMAZON_ACCESS_KEY ?? '',
    secretKey: process.env.AMAZON_SECRET_KEY ?? '',
    partnerTag: process.env.AMAZON_PARTNER_TAG ?? '',
    marketplace: process.env.AMAZON_MARKETPLACE ?? 'IT',
    storefrontId: process.env.AMAZON_STOREFRONT_ID,
  },
  keepa: {
    categories: process.env.KEEPA_CATEGORIES?.split(',').map(c => c.trim()) ?? ['5'],
    maxProductsPerCategory: parseInt(process.env.MAX_PRODUCTS_PER_CATEGORY ?? '10'),
    scrapingDelayMs: parseInt(process.env.SCRAPING_DELAY_MS ?? '2000'),
  },
  output: {
    filePath: process.env.OUTPUT_FILE ?? './output/deals.json',
    productsFilePath: process.env.PRODUCTS_OUTPUT_FILE ?? './output/products-complete.json',
  },
  linkGeneration: {
    includeStorefrontLinks: process.env.INCLUDE_STOREFRONT_LINKS === 'true',
  },
  notes: {
    dateForPosts: process.env.DATE_FOR_POSTS ?? '',
    topReviewCount: parseInt(process.env.TOP_REVIEW_COUNT ?? '5'),
    minReviews: parseInt(process.env.MIN_REVIEWS ?? '10'),
    topDealsCount: parseInt(process.env.TOP_DEALS_COUNT ?? '5'),
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
    chatId: process.env.TELEGRAM_CHAT_ID ?? '',
  },
};

export const config: AppConfig = rawConfig;

export function validateConfig(): void {
  const result = z
    .object({
      AMAZON_ACCESS_KEY: z.string().min(1, 'AMAZON_ACCESS_KEY is required'),
      AMAZON_SECRET_KEY: z.string().min(1, 'AMAZON_SECRET_KEY is required'),
      AMAZON_PARTNER_TAG: z.string().min(1, 'AMAZON_PARTNER_TAG is required'),
    })
    .safeParse({
      AMAZON_ACCESS_KEY: process.env.AMAZON_ACCESS_KEY,
      AMAZON_SECRET_KEY: process.env.AMAZON_SECRET_KEY,
      AMAZON_PARTNER_TAG: process.env.AMAZON_PARTNER_TAG,
    });

  if (!result.success) {
    const missing = result.error.issues.map(e => e.path.join('.')).join(', ');
    throw new Error(`Missing required environment variables: ${missing}`);
  }
}
