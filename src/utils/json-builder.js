import fs from 'fs/promises';
import path from 'path';

/**
 * Transform Amazon PA-API response to output JSON format
 * @param {Object} amazonProduct - Product from Amazon PA-API
 * @param {string} category - Category from Keepa scraping
 * @param {string} affiliateLink - Pre-built affiliate link
 * @returns {Object}
 */
export function transformProduct(amazonProduct, category, affiliateLink) {
  const item = amazonProduct;

  return {
    name: item.ItemInfo?.Title?.DisplayValue || 'N/A',
    asin: item.ASIN,
    url: item.DetailPageURL || affiliateLink,
    affiliate_link: affiliateLink,
    img: item.Images?.Primary?.Large?.URL || item.Images?.Primary?.Medium?.URL || null,
    description:
      item.ItemInfo?.Features?.DisplayValues?.join(' ') ||
      item.ItemInfo?.Title?.DisplayValue ||
      'No description available',
    post: '', // Campo custom da compilare manualmente o con AI
    price:
      item.Offers?.Listings?.[0]?.Price?.DisplayAmount ||
      item.Offers?.Listings?.[0]?.Price?.Amount?.toString() ||
      'N/A',
    category: category || 'Unknown',
  };
}

/**
 * Save products to JSON file
 * @param {Array} products - Array of transformed products
 * @param {string} filePath - Output file path
 */
export async function saveToJSON(products, filePath) {
  try {
    // Ensure output directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    // Write JSON file
    await fs.writeFile(filePath, JSON.stringify(products, null, 2), 'utf-8');

    console.log(`\n💾 Saved ${products.length} products to ${filePath}`);
    return true;
  } catch (error) {
    console.error('❌ Error saving JSON:', error.message);
    return false;
  }
}

/**
 * Load existing JSON file
 * @param {string} filePath
 * @returns {Promise<Array>}
 */
export async function loadFromJSON(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // File doesn't exist or invalid JSON
    return [];
  }
}

/**
 * Save ASINs organized by category to JSON file (TEST MODE)
 * @param {Object} asinsByCategory - Object with category names as keys and ASIN arrays as values
 * @param {string} filePath - Output file path
 */
export async function saveASINsToJSON(asinsByCategory, filePath) {
  try {
    // Ensure output directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    // Write JSON file
    await fs.writeFile(filePath, JSON.stringify(asinsByCategory, null, 2), 'utf-8');

    const totalAsins = Object.values(asinsByCategory).reduce((sum, arr) => sum + arr.length, 0);
    console.log(
      `\n💾 Saved ${totalAsins} ASINs organized by ${Object.keys(asinsByCategory).length} categories to ${filePath}`
    );
    return true;
  } catch (error) {
    console.error('❌ Error saving ASINs JSON:', error.message);
    return false;
  }
}
