#!/usr/bin/env node

import { validateConfig, config } from './config/index.js';
import { scrapeKeepaDeals } from './scrapers/keepa.js';
import { saveASINsToJSON } from './utils/json-builder.js';
import { fetchProductsAndExport } from './fetch-products.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Main execution flow - Keepa deals scraper and Amazon product fetching
 */
async function main() {
  console.log('🎬 Starting Keepa Tracker...\n');
  console.log('═'.repeat(50));

  try {
    // Step 1: Validate configuration
    console.log('\n📋 Step 1: Validating configuration...');
    validateConfig();
    console.log('✅ Configuration validated successfully');

    // Step 2: Scrape Keepa for ASINs
    console.log('\n📋 Step 2: Scraping Keepa deals...');
    const keepaProducts = await scrapeKeepaDeals();

    if (keepaProducts.length === 0) {
      console.log('⚠️  No products found on Keepa');
      return;
    }

    console.log(`✅ Scraped ${keepaProducts.length} products from Keepa`);

    // Step 3: Display summary by category
    console.log('\n📊 Products by Category:');
    const productsByCategory = {};
    for (const product of keepaProducts) {
      if (!productsByCategory[product.category]) {
        productsByCategory[product.category] = [];
      }
      productsByCategory[product.category].push(product);
    }

    for (const [category, products] of Object.entries(productsByCategory)) {
      console.log(`  ${category}: ${products.length} products`);
    }

    // Step 4: Save complete product data to JSON file (including prices and discounts)
    console.log('\n📋 Step 4: Saving product data with pricing to file...');
    await saveASINsToJSON(keepaProducts, config.output.filePath);

    // Summary
    console.log('\n' + '═'.repeat(50));
    console.log('🎉 Keepa scraping completed successfully!');
    console.log(`📊 Total products: ${keepaProducts.length}`);
    console.log(`📁 Output file: ${config.output.filePath}`);
    console.log('═'.repeat(50));

    // Step 5: Automatically fetch products from Amazon
    console.log('\n📋 Step 5: Automatically fetching product details from Amazon...\n');
    await fetchProductsAndExport();
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Execute main function
main();
