import fs from 'fs/promises';
import path from 'path';

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
 * Save ASINs organized by category to JSON file
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
