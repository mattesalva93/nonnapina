#!/usr/bin/env node

import { config, validateConfig } from './config/index.js';
import { fetchProductsAndExport } from './fetch-products.js';
import { scrapeKeepaDeals } from './scrapers/keepa.js';
import { saveASINsToJSON } from './utils/json-builder.js';

async function main(): Promise<void> {
  console.log('🎬 Starting Keepa Tracker...\n');
  console.log('═'.repeat(50));

  try {
    console.log('\n📋 Step 1: Validating configuration...');
    validateConfig();
    console.log('✅ Configuration validated successfully');

    console.log('\n📋 Step 2: Scraping Keepa deals...');
    const keepaProducts = await scrapeKeepaDeals();

    if (keepaProducts.length === 0) {
      console.log('⚠️  No products found on Keepa');
      return;
    }

    console.log(`✅ Scraped ${keepaProducts.length} products from Keepa`);

    console.log('\n📊 Products by Category:');
    const productsByCategory = new Map<string, typeof keepaProducts>();
    for (const product of keepaProducts) {
      const existing = productsByCategory.get(product.category) ?? [];
      existing.push(product);
      productsByCategory.set(product.category, existing);
    }

    for (const [category, products] of productsByCategory) {
      console.log(`  ${category}: ${products.length} products`);
    }

    console.log('\n📋 Step 4: Saving product data with pricing to file...');
    await saveASINsToJSON(keepaProducts, config.output.filePath);

    console.log('\n' + '═'.repeat(50));
    console.log('🎉 Keepa scraping completed successfully!');
    console.log(`📊 Total products: ${keepaProducts.length}`);
    console.log(`📁 Output file: ${config.output.filePath}`);
    console.log('═'.repeat(50));

    console.log('\n📋 Step 5: Automatically fetching product details from Amazon...\n');
    await fetchProductsAndExport();
  } catch (error) {
    console.error('\n❌ Fatal error:', (error as Error).message);
    console.error((error as Error).stack);
    process.exit(1);
  }
}

main();
