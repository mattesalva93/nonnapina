import dotenv from 'dotenv';

dotenv.config();

export const config = {
  amazon: {
    accessKey: process.env.AMAZON_ACCESS_KEY,
    secretKey: process.env.AMAZON_SECRET_KEY,
    partnerTag: process.env.AMAZON_PARTNER_TAG,
    marketplace: process.env.AMAZON_MARKETPLACE || 'IT',
  },

  keepa: {
    categories: process.env.KEEPA_CATEGORIES?.split(',').map(c => c.trim()) || ['5'],
    maxProductsPerCategory: parseInt(process.env.MAX_PRODUCTS_PER_CATEGORY) || 10,
    scrapingDelayMs: parseInt(process.env.SCRAPING_DELAY_MS) || 2000,
  },

  output: {
    filePath: process.env.OUTPUT_FILE || './output/deals.json',
  },
};

// Validate required config
export function validateConfig() {
  const required = ['AMAZON_ACCESS_KEY', 'AMAZON_SECRET_KEY', 'AMAZON_PARTNER_TAG'];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
