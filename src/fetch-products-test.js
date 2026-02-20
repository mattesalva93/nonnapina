#!/usr/bin/env node

import { validateConfig, config } from './config/index.js';
import { amazonService } from './services/amazon.js';
import { saveToJSON } from './utils/json-builder.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * TEST VERSION - Use asins-test.json for testing
 */
async function main() {
  console.log('🧪 FETCH-PRODUCTS TEST VERSION\n');
  console.log('═'.repeat(60));

  try {
    // Step 1: Validate configuration
    console.log('\n📋 Step 1: Validating configuration...');
    validateConfig();
    console.log('✅ Configuration validated successfully');
    console.log(`   PARTNER_TAG: ${config.amazon.partnerTag}`);
    console.log(`   STOREFRONT_ID: ${config.amazon.storefrontId}`);
    console.log(`   MARKETPLACE: ${config.amazon.marketplace}`);

    // Step 2: Load test ASINs
    console.log('\n📋 Step 2: Loading test ASINs from asins-test.json...');
    const testData = await fs.readFile('./output/asins-test.json', 'utf-8');
    const asinsByCategory = JSON.parse(testData);

    // Flatten ASIN list
    const allAsins = [];
    for (const [category, asins] of Object.entries(asinsByCategory)) {
      allAsins.push(...asins);
      console.log(`  📁 ${category}: ${asins.length} ASINs`);
    }

    console.log(`\n📊 Total test ASINs: ${allAsins.length}`);

    // Step 3: Prepare link generation options
    console.log('\n📋 Step 3: Preparing link generation options...');
    const linkOptions = {
      storefront: config.amazon.storefrontId || null,
    };

    if (config.amazon.storefrontId) {
      console.log(`  ✅ Storefront ID configured: ${config.amazon.storefrontId}`);
    }

    console.log('  ✅ Link types to generate:');
    console.log('     - Web (standard affiliate link)');
    console.log('     - Mobile App iOS (deep link)');
    console.log('     - Mobile App Android (deep link)');
    console.log('     - Storefront (redirect to your store)');
    console.log('     - Smart Link (device detection)');

    // Step 4: Fetch product details from Amazon
    console.log('\n📋 Step 4: Fetching product details from Amazon Creators API...');
    console.log(`   Processing ${allAsins.length} ASINs in batches...\n`);

    const products = await amazonService.getProductDetails(allAsins, linkOptions);

    if (products.length === 0) {
      console.log('⚠️  No products fetched from Amazon');
      return;
    }

    console.log(`\n✅ Fetched ${products.length} products successfully`);

    // Step 5: Enrich products with category information
    console.log('\n📋 Step 5: Enriching with category information...');
    const productsWithCategory = products.map(product => {
      // Find category for this ASIN
      let category = null;
      for (const [cat, asins] of Object.entries(asinsByCategory)) {
        if (asins.includes(product.asin)) {
          category = cat;
          break;
        }
      }

      return {
        ...product,
        category: category,
      };
    });

    // Step 6: Save complete JSON file
    console.log('\n📋 Step 6: Saving complete product data to file...');
    await saveToJSON(productsWithCategory, config.output.productsFilePath);

    // Step 7: Display sample product
    console.log('\n📋 Step 7: Sample product output:\n');
    if (productsWithCategory.length > 0) {
      const sample = productsWithCategory[0];
      console.log(JSON.stringify(sample, null, 2));
    }

    // Step 8: Generate summary report
    console.log('\n\n📊 TEST SUMMARY REPORT');
    console.log('═'.repeat(60));
    const productsWithPrice = productsWithCategory.filter(p => p.price !== null);
    const productsWithRating = productsWithCategory.filter(p => p.rating !== null);
    const avgRating =
      productsWithRating.length > 0
        ? (
            productsWithRating.reduce((sum, p) => sum + p.rating, 0) / productsWithRating.length
          ).toFixed(2)
        : 'N/A';

    console.log(`Total Products Fetched: ${productsWithCategory.length}/${allAsins.length}`);
    console.log(`Products with Price: ${productsWithPrice.length}`);
    console.log(`Products with Rating: ${productsWithRating.length}`);
    console.log(`Average Rating: ${avgRating}/5`);

    console.log('\n🔗 Link Types Generated (per product):');
    console.log('  ✅ web - Standard affiliate link');
    console.log('  ✅ mobileAppIOS - Deep link for iPhone');
    console.log('  ✅ mobileAppAndroid - Deep link for Android');
    console.log(`  ✅ storefront - Link to your store (${config.amazon.storefrontId})`);
    console.log('  ✅ smartLink - Device detection (with fallbacks)');

    console.log('\n📁 Output Files:');
    console.log(`  ✅ ${config.output.productsFilePath}`);

    console.log('\n' + '═'.repeat(60));
    console.log('✅ TEST COMPLETED SUCCESSFULLY!\n');

    // Show one link example
    if (productsWithCategory.length > 0) {
      const sample = productsWithCategory[0];
      console.log('📌 EXAMPLE LINKS FOR FIRST PRODUCT:');
      console.log(`\nASIN: ${sample.asin}`);
      console.log(`Title: ${sample.title}`);
      console.log(`\n🔗 Generated Links:`);
      console.log(`\n1. Web Link:`);
      console.log(`   ${sample.affiliateLinks.web}`);
      console.log(`\n2. iOS Deep Link:`);
      console.log(`   ${sample.affiliateLinks.mobileAppIOS}`);
      console.log(`\n3. Android Deep Link:`);
      console.log(`   ${sample.affiliateLinks.mobileAppAndroid}`);
      console.log(`\n4. Storefront Link:`);
      console.log(`   ${sample.affiliateLinks.storefront}`);
      console.log(`\n5. Smart Link:`);
      console.log(`   URL: ${sample.affiliateLinks.smartLink.url}`);
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Execute
main();
