#!/usr/bin/env node

import { validateConfig, config } from './config/index.js';
import { scrapeKeepaDeals } from './scrapers/keepa.js';
import { saveASINsToJSON } from './utils/json-builder.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Main execution flow - TEST MODE (Keepa only)
 */
async function main() {
  console.log('🎬 Starting Keepa Tracker (TEST MODE - Keepa Only)...\n');
  console.log('═'.repeat(50));

  try {
    // Step 1: Validate configuration
    console.log('\n📋 Step 1: Validating configuration...');
    // validateConfig(); // TODO: Enable when Amazon PA-API credentials are ready
    console.log('✅ Configuration loaded (Amazon credentials validation disabled for testing)');

    // Step 2: Scrape Keepa for ASINs
    console.log('\n📋 Step 2: Scraping Keepa deals...');
    const keepaProducts = await scrapeKeepaDeals();

    if (keepaProducts.length === 0) {
      console.log('⚠️  No products found on Keepa');
      return;
    }

    console.log(`✅ Scraped ${keepaProducts.length} products from Keepa`);

    // Step 3: Format ASINs by category
    console.log('\n📋 Step 3: Organizing ASINs by category...');
    const asinsByCategory = {};

    for (const product of keepaProducts) {
      if (!asinsByCategory[product.category]) {
        asinsByCategory[product.category] = [];
      }
      asinsByCategory[product.category].push(product.asin);
    }

    // Display summary
    console.log('\n📊 ASINs by Category:');
    for (const [category, asins] of Object.entries(asinsByCategory)) {
      console.log(`  ${category}: ${asins.length} products`);
    }

    // Step 4: Save to JSON file
    console.log('\n📋 Step 4: Saving to file...');
    await saveASINsToJSON(asinsByCategory, './output/asins-test.json');

    // Summary
    console.log('\n' + '═'.repeat(50));
    console.log('🎉 Test completed successfully!');
    console.log(`📊 Total products: ${keepaProducts.length}`);
    console.log(`📁 Output file: ./output/asins-test.json`);
    console.log('\n✨ Ready for Amazon PA-API integration when credentials are available');
    console.log('═'.repeat(50) + '\n');
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Execute main function
main();
