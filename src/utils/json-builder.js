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
    if (error.code === 'ENOENT') {
      // File doesn't exist — this is expected on first run
      console.log(`ℹ️  File not found: ${filePath} (will be created)`);
      return [];
    }
    // Invalid JSON or other read error — warn loudly
    console.error(`⚠️  Error reading ${filePath}: ${error.message}`);
    console.error('   The file may be corrupted. Returning empty array.');
    return [];
  }
}

/**
 * Save ASINs / products to JSON file
 * Accepts both an array of products or an object keyed by category.
 * @param {Array|Object} data - Products array or object with category keys and ASIN arrays as values
 * @param {string} filePath - Output file path
 */
export async function saveASINsToJSON(data, filePath) {
  try {
    // Ensure output directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    // Write JSON file
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');

    // Smart count: handle both array and object structures
    let count;
    if (Array.isArray(data)) {
      count = data.length;
      console.log(`\n💾 Saved ${count} products to ${filePath}`);
    } else {
      count = Object.values(data).reduce(
        (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 1),
        0
      );
      console.log(
        `\n💾 Saved ${count} ASINs organized by ${Object.keys(data).length} categories to ${filePath}`
      );
    }
    return true;
  } catch (error) {
    console.error('❌ Error saving JSON:', error.message);
    return false;
  }
}
