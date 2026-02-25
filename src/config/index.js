import dotenv from 'dotenv';

dotenv.config();

export const config = {
  amazon: {
    accessKey: process.env.AMAZON_ACCESS_KEY,
    secretKey: process.env.AMAZON_SECRET_KEY,
    partnerTag: process.env.AMAZON_PARTNER_TAG,
    marketplace: process.env.AMAZON_MARKETPLACE || 'IT',
    storefrontId: process.env.AMAZON_STOREFRONT_ID || null,
  },

  keepa: {
    categories: process.env.KEEPA_CATEGORIES?.split(',').map(c => c.trim()) || ['5'],
    maxProductsPerCategory: parseInt(process.env.MAX_PRODUCTS_PER_CATEGORY) || 10,
    scrapingDelayMs: parseInt(process.env.SCRAPING_DELAY_MS) || 2000,
  },

  output: {
    filePath: process.env.OUTPUT_FILE || './output/deals.json',
    productsFilePath: process.env.PRODUCTS_OUTPUT_FILE || './output/products-complete.json',
  },

  linkGeneration: {
    // If true, generates iOS/Android deep links for app
    includeDeepLinks: process.env.INCLUDE_DEEP_LINKS !== 'false',
    // If true, generates storefront links (requires AMAZON_STOREFRONT_ID)
    includeStorefrontLinks: process.env.INCLUDE_STOREFRONT_LINKS === 'true',
  },

  notes: {
    // Date for posts in format DD/MM/YYYY (empty string uses today's date)
    dateForPosts: process.env.DATE_FOR_POSTS || '',
    // Number of top-rated products to feature
    topReviewCount: parseInt(process.env.TOP_REVIEW_COUNT) || 5,
    // Minimum number of reviews required
    minReviews: parseInt(process.env.MIN_REVIEWS) || 10,
    // Number of best deals to feature with image collage
    topDealsCount: parseInt(process.env.TOP_DEALS_COUNT) || 5,
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
