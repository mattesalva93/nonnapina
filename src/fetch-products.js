#!/usr/bin/env node

import { validateConfig, config } from './config/index.js';
import { amazonService } from './services/amazon.js';
import { loadFromJSON, saveToJSON } from './utils/json-builder.js';
import { excelHandler } from './utils/excel-handler.js';
import { notesGenerator } from './utils/notes-generator.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Fetch products from Amazon Creators API and generate complete JSON with affiliate links
 * Can be called from main script or run standalone
 */
export async function fetchProductsAndExport() {
  console.log('🎬 Starting Amazon Products Fetcher...\n');
  console.log('═'.repeat(60));

  try {
    // Step 1: Validate configuration
    console.log('\n📋 Step 1: Validating configuration...');
    validateConfig();
    console.log('✅ Configuration validated successfully');

    // Step 2: Load products with pricing from Keepa
    console.log('\n📋 Step 2: Loading products with Keepa data...');
    const keepaProducts = await loadFromJSON(config.output.filePath);

    if (!keepaProducts || !Array.isArray(keepaProducts) || keepaProducts.length === 0) {
      console.log('⚠️  No products found. Run the main script first to scrape Keepa.');
      return;
    }

    // Create mapping of ASIN to Keepa data (for enrichment later)
    const keepaDataByAsin = {};
    const productsByCategory = {};
    const allAsins = [];

    for (const product of keepaProducts) {
      allAsins.push(product.asin);
      keepaDataByAsin[product.asin] = {
        category: product.category,
        discount: product.discount,
        avgPrice: product.avgPrice,
        currentPrice: product.currentPrice,
        rating: product.rating,
        reviewCount: product.reviewCount,
      };

      if (!productsByCategory[product.category]) {
        productsByCategory[product.category] = [];
      }
      productsByCategory[product.category].push(product.asin);
    }

    // Display summary
    console.log('\n📊 Products by Category:');
    for (const [category, asins] of Object.entries(productsByCategory)) {
      console.log(`  📁 ${category}: ${asins.length} products`);
    }

    console.log(`\n📊 Total products to fetch: ${allAsins.length}`);

    // Step 3: Prepare link generation options
    console.log('\n📋 Step 3: Preparing link generation options...');
    const linkOptions = {
      storefront: config.amazon.storefrontId || null,
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

    // Step 4: Fetch product details from Amazon
    console.log('\n📋 Step 4: Fetching product details from Amazon Creators API...');
    const products = await amazonService.getProductDetails(allAsins, linkOptions);

    if (products.length === 0) {
      console.log('⚠️  No products fetched from Amazon');
      return;
    }

    console.log(`✅ Fetched ${products.length} products successfully`);

    // Step 5: Enrich products with Keepa data (category, pricing, discount)
    console.log('\n📋 Step 5: Enriching with Keepa data (category, pricing, discounts)...');
    const productsWithCategory = products.map(product => {
      const keepaData = keepaDataByAsin[product.asin] || {};

      return {
        ...product,
        category: keepaData.category || 'Unknown',
        keepaDiscount: keepaData.discount,
        keepaAvgPrice: keepaData.avgPrice,
        keepaCurrentPrice: keepaData.currentPrice,
        keepaRating: keepaData.rating,
        keepaReviewCount: keepaData.reviewCount,
      };
    });

    // Step 6: Save complete JSON file
    console.log('\n📋 Step 6: Saving complete product data to file...');
    await saveToJSON(productsWithCategory, config.output.productsFilePath);

    // Step 6.5: Export to Excel with smart date-based sheet management
    console.log('\n📋 Step 6.5: Exporting to Excel tracker file...');
    const excelStats = await excelHandler.getStats();
    console.log(`   Excel file status: ${excelStats.message}`);
    await excelHandler.appendProducts(productsWithCategory);

    // Step 6.6: Generate HTML page for social media posts
    console.log('\n📋 Step 6.6: Generating HTML page...');
    const notesResult = await notesGenerator.generateNotes(config.notes.dateForPosts);
    if (notesResult.success) {
      console.log(`   ✅ ${notesResult.message}`);
    } else {
      console.log(`   ⚠️  ${notesResult.message}`);
    }

    // Step 7: Generate summary report
    console.log('\n📋 Step 7: Generating summary report...');
    const summary = {
      totalProducts: productsWithCategory.length,
      productsWithPrice: productsWithCategory.filter(p => p.price !== null).length,
      productsWithRating: productsWithCategory.filter(p => p.rating !== null).length,
      averageRating: productsWithCategory.filter(p => p.rating !== null)
        ? (
            productsWithCategory
              .filter(p => p.rating !== null)
              .reduce((sum, p) => sum + p.rating, 0) /
            productsWithCategory.filter(p => p.rating !== null).length
          ).toFixed(2)
        : 'N/A',
      categoryBreakdown: {},
      linkTypes: {
        linkAffiliato: '✅ All products (universal deep link)',
        storefront: config.amazon.storefrontId ? '✅ All products' : '❌ Not configured',
      },
    };

    // Calculate category breakdown
    for (const [category, requestedAsins] of Object.entries(productsByCategory)) {
      const categoryProducts = productsWithCategory.filter(p => p.category === category);
      summary.categoryBreakdown[category] = {
        requested: requestedAsins.length,
        fetched: categoryProducts.length,
        success: ((categoryProducts.length / requestedAsins.length) * 100).toFixed(0) + '%',
      };
    }

    console.log('\n📊 Summary Report:');
    console.log('═'.repeat(60));
    console.log(`  Total Products: ${summary.totalProducts}`);
    console.log(`  Products with Price: ${summary.productsWithPrice}/${summary.totalProducts}`);
    console.log(`  Products with Rating: ${summary.productsWithRating}/${summary.totalProducts}`);
    console.log(`  Average Rating: ${summary.averageRating}/5`);

    console.log('\n📁 Category Breakdown:');
    for (const [category, stats] of Object.entries(summary.categoryBreakdown)) {
      console.log(`  ${category}: ${stats.fetched}/${stats.requested} (${stats.success})`);
    }

    console.log('\n🔗 Link Types Available:');
    for (const [linkType, status] of Object.entries(summary.linkTypes)) {
      console.log(`  ${linkType}: ${status}`);
    }

    console.log('\n📋 Output Structure:');
    console.log(`  Each product contains:`);
    console.log(`  - Basic Info: asin, title, price, currency, availability`);
    console.log(`  - Ratings: rating, ratingCount`);
    console.log(`  - Media: image (small & large URLs)`);
    console.log(`  - Features: itemInfo features array`);
    console.log(
      `  - Affiliate Links: linkAffiliato (universal deep link), storefront (if configured)`
    );
    console.log(`  - Raw Data: Complete API response for custom filtering`);
    console.log(`  - Metadata: category, fetchedAt, marketplace`);

    console.log('\n' + '═'.repeat(60));
    console.log('🎉 Product fetching completed successfully!');
    console.log(`📊 Total: ${summary.totalProducts} products`);
    console.log(`📁 JSON output file: ${config.output.productsFilePath}`);
    console.log(`📊 Excel tracker file: ./output/tracker_outcome.xlsx`);
    if (notesResult.success) {
      console.log(
        `📝 HTML page: ${notesResult.fileName} (saved on Desktop - ${notesResult.count} products)`
      );
    }
    console.log('═'.repeat(60) + '\n');
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Execute if run as standalone script
if (import.meta.url === `file://${process.argv[1]}`) {
  fetchProductsAndExport();
}
