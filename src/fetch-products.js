import fs from 'fs/promises';
import path from 'path';
import { amazonService } from './services/amazon.js';
import { validateConfig } from './config/index.js';

/**
 * Fetch product details from Amazon Creators API using ASINs from JSON file
 */
async function fetchProductDetails() {
  console.log('🚀 Starting Amazon product details fetching...\n');

  try {
    // Validate configuration
    validateConfig();
    console.log('✅ Configuration validated');

    // Read ASIN file
    const asinFilePath = path.join(process.cwd(), 'output', 'asins-test.json');
    console.log(`\n📂 Reading ASINs from: ${asinFilePath}`);

    const asinData = JSON.parse(await fs.readFile(asinFilePath, 'utf-8'));
    console.log('✅ ASIN file loaded');

    // Extract all ASINs from categories
    const allAsins = [];
    const categoryMap = {}; // Map ASIN -> Category

    for (const [category, asins] of Object.entries(asinData)) {
      console.log(`   📦 ${category}: ${asins.length} products`);
      allAsins.push(...asins);
      asins.forEach(asin => {
        categoryMap[asin] = category;
      });
    }

    console.log(`\n📊 Total ASINs to fetch: ${allAsins.length}`);

    // Fetch product details from Amazon Creators API
    const products = await amazonService.getProductDetails(allAsins);

    if (products.length === 0) {
      console.log('\n⚠️  No products were fetched from Amazon API');
      return;
    }

    // Build formatted JSON with category information
    console.log('\n🔨 Building formatted product data...');
    const formattedProducts = products.map(product => {
      const asin = product.asin;
      const category = categoryMap[asin] || 'Unknown';

      return {
        asin,
        category,
        title: product.title,
        price: product.price,
        currency: product.currency,
        rating: product.rating,
        ratingCount: product.ratingCount,
        image: product.image,
        features: product.features,
        affiliateLink: product.url,
        detailPageURL: product.detailPageURL,
        parentASIN: product.parentASIN,
      };
    });

    // Save to output file
    const outputPath = path.join(process.cwd(), 'output', 'products-details.json');
    await fs.writeFile(outputPath, JSON.stringify(formattedProducts, null, 2));

    console.log(`\n✅ Product details saved to: ${outputPath}`);
    console.log(`📊 Total products saved: ${formattedProducts.length}`);

    // Print summary by category
    console.log('\n📈 Summary by category:');
    const categoryCounts = {};
    formattedProducts.forEach(p => {
      categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
    });
    Object.entries(categoryCounts).forEach(([cat, count]) => {
      console.log(`   ${cat}: ${count} products`);
    });

    console.log('\n🎉 Process completed successfully!');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  fetchProductDetails();
}

export { fetchProductDetails };
