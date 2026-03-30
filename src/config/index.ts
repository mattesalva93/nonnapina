import 'dotenv/config';
import { z } from 'zod';

const nodeEnvSchema = z.enum(['development', 'production', 'test']).default('development');

const configSchema = z.object({
  server: z.object({
    port: z.number().int().positive().default(3000),
    nodeEnv: nodeEnvSchema,
    apiSecret: z.string().default(''),
  }),
  database: z.object({
    url: z.string().min(1, 'DATABASE_URL is required'),
  }),
  amazon: z.object({
    accessKey: z.string().min(1, 'AMAZON_ACCESS_KEY is required'),
    secretKey: z.string().min(1, 'AMAZON_SECRET_KEY is required'),
    partnerTag: z.string().min(1, 'AMAZON_PARTNER_TAG is required'),
    marketplace: z.string().default('IT'),
    storefrontId: z.string().optional(),
  }),
  keepa: z.object({
    categories: z.array(z.string()).default(['5']),
    maxProductsPerCategory: z.number().int().positive().default(10),
    scrapingDelayMs: z.number().int().positive().default(2000),
  }),
  telegram: z.object({
    botToken: z.string().default(''),
    chatId: z.string().default(''),
  }),
  whatsapp: z.object({
    channelId: z.string().default(''),
    sessionDataPath: z.string().default('./.wwebjs_auth'),
  }),
  email: z.object({
    smtpHost: z.string().default(''),
    smtpPort: z.number().int().positive().default(587),
    smtpSecure: z.boolean().default(false),
    smtpUser: z.string().default(''),
    smtpPass: z.string().default(''),
    alertFrom: z.string().default(''),
    alertTo: z.string().default(''),
    alertCc: z.array(z.string()).default([]),
  }),
});

// Allow DATABASE_URL to be empty in test environment
const testConfigSchema = configSchema.extend({
  database: z.object({
    url: z.string().default(''),
  }),
  amazon: z.object({
    accessKey: z.string().default(''),
    secretKey: z.string().default(''),
    partnerTag: z.string().default(''),
    marketplace: z.string().default('IT'),
    storefrontId: z.string().optional(),
  }),
});

export type AppConfig = z.infer<typeof configSchema>;

function buildRawConfig() {
  return {
    server: {
      port: parseInt(process.env.PORT ?? '3000'),
      nodeEnv: (process.env.NODE_ENV ?? 'development') as 'development' | 'production' | 'test',
      apiSecret: process.env.API_SECRET ?? '',
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
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
      chatId: process.env.TELEGRAM_CHAT_ID ?? '',
    },
    whatsapp: {
      channelId: process.env.WHATSAPP_CHANNEL_ID ?? '',
      sessionDataPath: process.env.WHATSAPP_SESSION_PATH ?? './.wwebjs_auth',
    },
    email: {
      smtpHost: process.env.SMTP_HOST ?? '',
      smtpPort: parseInt(process.env.SMTP_PORT ?? '587'),
      smtpSecure: process.env.SMTP_SECURE === 'true',
      smtpUser: process.env.SMTP_USER ?? '',
      smtpPass: process.env.SMTP_PASS ?? '',
      alertFrom: process.env.ALERT_EMAIL_FROM ?? '',
      alertTo: process.env.ALERT_EMAIL_TO ?? '',
      alertCc:
        process.env.ALERT_EMAIL_CC?.split(',')
          .map(e => e.trim())
          .filter(Boolean) ?? [],
    },
  };
}

function parseConfig(): AppConfig {
  const raw = buildRawConfig();
  const isTest = raw.server.nodeEnv === 'test';
  const schema = isTest ? testConfigSchema : configSchema;
  return schema.parse(raw);
}

export const config: AppConfig = parseConfig();
