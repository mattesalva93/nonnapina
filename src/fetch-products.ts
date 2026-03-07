#!/usr/bin/env node

import { config, validateConfig } from './config/index.js';
import { amazonService } from './services/amazon.js';
import type { EnrichedProduct, KeepaProduct } from './types/index.js';
import { excelHandler } from './utils/excel-handler.js';
import { loadFromJSON, saveToJSON } from './utils/json-builder.js';
import { notesGenerator } from './utils/notes-generator.js';

export async function fetchProductsAndExport(): Promise<void> {
  console.log('🎬 Starting Amazon Products Fetcher...\n');
  console.log('═'.repeat(60));

  try {
    console.log('\n📋 Step 1: Validating configuration...');
    validateConfig();
    console.log('✅ Configuration validated successfully');

    console.log('\n📋 Step 2: Loading products with Keepa data...');
    const keepaProducts = await loadFromJSON<KeepaProduct>(config.output.filePath);

    if (!keepaProducts || !Array.isArray(keepaProducts) || keepaProducts.length === 0) {
      console.log('⚠️  No products found. Run the main script first to scrape Keepa.');
      return;
    }

    const keepaDataByAsin = new Map<string, KeepaProduct>();
    const productsByCategory = new Map<string, string[]>();
    const allAsins: string[] = [];

    for (const product of keepaProducts) {
      allAsins.push(product.asin);
      keepaDataByAsin.set(product.asin, product);

      const existing = productsByCategory.get(product.category) ?? [];
      existing.push(product.asin);
      productsByCategory.set(product.category, existing);
    }

    console.log('\n📊 Products by Category:');
    for (const [category, asins] of productsByCategory) {
      console.log(`  📁 ${category}: ${asins.length} products`);
    }
    console.log(`\n📊 Total products to fetch: ${allAsins.length}`);

    console.log('\n📋 Step 3: Preparing link generation options...');
    const linkOptions = {
      storefront: config.amazon.storefrontId,
    };

    if (config.amazon.storefrontId) {
      console.log(`  ✅ Storefront ID configured: ${config.amazon.storefrontId}`);
    } else {
      console.log('  ℹ️  No storefront ID configured (optional)');
    }

    console.log('  ✅ Link types to generate:');
    console.log('     - Link Affiliato (universal deep link, apre app se installata)');
    if (config.amazon.storefrontId) {
      console.log('     - Storefront (redirect to your store)');
    }

    console.log('\n📋 Step 4: Fetching product details from Amazon Creators API...');
    const products = await amazonService.getProductDetails(allAsins, linkOptions);

    if (products.length === 0) {
      console.log('⚠️  No products fetched from Amazon');
      return;
    }
    console.log(`✅ Fetched ${products.length} products successfully`);

    console.log('\n📋 Step 5: Enriching with Keepa data (category, pricing, discounts)...');
    const productsWithCategory: EnrichedProduct[] = products.map(product => {
      const keepaData = keepaDataByAsin.get(product.asin);
      return {
        ...product,
        category: keepaData?.category ?? 'Unknown',
        keepaDiscount: keepaData?.discount,
        keepaAvgPrice: keepaData?.avgPrice,
        keepaCurrentPrice: keepaData?.currentPrice,
        keepaRating: keepaData?.rating,
        keepaReviewCount: keepaData?.reviewCount,
      };
    });

    console.log('\n📋 Step 6: Saving complete product data to file...');
    await saveToJSON(productsWithCategory, config.output.productsFilePath);

    console.log('\n📋 Step 6.5: Exporting to Excel tracker file...');
    const excelStats = await excelHandler.getStats();
    console.log(`   Excel file status: ${excelStats.message}`);
    await excelHandler.appendProducts(productsWithCategory);

    console.log('\n📋 Step 6.6: Generating HTML page...');
    const notesResult = await notesGenerator.generateNotes(config.notes.dateForPosts);
    if (notesResult.success) {
      console.log(`   ✅ ${notesResult.message}`);
    } else {
      console.log(`   ⚠️  ${notesResult.message}`);
    }

    console.log('\n📋 Step 7: Generating summary report...');
    const ratedProducts = productsWithCategory.filter(p => p.rating != null);
    const averageRating =
      ratedProducts.length > 0
        ? (
            ratedProducts.reduce((sum, p) => sum + (p.rating ?? 0), 0) / ratedProducts.length
          ).toFixed(2)
        : 'N/A';

    const categoryBreakdown: Record<
      string,
      { requested: number; fetched: number; success: string }
    > = {};
    for (const [category, requestedAsins] of productsByCategory) {
      const categoryProducts = productsWithCategory.filter(p => p.category === category);
      categoryBreakdown[category] = {
        requested: requestedAsins.length,
        fetched: categoryProducts.length,
        success: `${((categoryProducts.length / requestedAsins.length) * 100).toFixed(0)}%`,
      };
    }

    console.log('\n📊 Summary Report:');
    console.log('═'.repeat(60));
    console.log(`  Total Products: ${productsWithCategory.length}`);
    console.log(
      `  Products with Price: ${productsWithCategory.filter(p => p.price != null).length}/${productsWithCategory.length}`
    );
    console.log(`  Products with Rating: ${ratedProducts.length}/${productsWithCategory.length}`);
    console.log(`  Average Rating: ${averageRating}/5`);

    console.log('\n📁 Category Breakdown:');
    for (const [category, stats] of Object.entries(categoryBreakdown)) {
      console.log(`  ${category}: ${stats.fetched}/${stats.requested} (${stats.success})`);
    }

    console.log('\n🔗 Link Types Available:');
    console.log(`  linkAffiliato: ✅ All products (universal deep link)`);
    console.log(
      `  storefront: ${config.amazon.storefrontId ? '✅ All products' : '❌ Not configured'}`
    );

    console.log('\n' + '═'.repeat(60));
    console.log('🎉 Product fetching completed successfully!');
    console.log(`📊 Total: ${productsWithCategory.length} products`);
    console.log(`📁 JSON output file: ${config.output.productsFilePath}`);
    console.log(`📊 Excel tracker file: ./output/tracker_outcome.xlsx`);
    if (notesResult.success) {
      console.log(
        `📝 HTML page: ${notesResult.fileName} (saved on Desktop - ${notesResult.count} products)`
      );
    }
    console.log('═'.repeat(60) + '\n');
  } catch (error) {
    console.error('\n❌ Fatal error:', (error as Error).message);
    console.error((error as Error).stack);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchProductsAndExport();
}
