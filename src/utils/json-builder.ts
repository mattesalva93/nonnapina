import fs from 'node:fs/promises';
import path from 'node:path';

export async function saveToJSON(products: unknown[], filePath: string): Promise<boolean> {
  try {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(products, null, 2), 'utf-8');
    console.log(`\n💾 Saved ${products.length} products to ${filePath}`);
    return true;
  } catch (error) {
    console.error('❌ Error saving JSON:', (error as Error).message);
    return false;
  }
}

export async function loadFromJSON<T = unknown>(filePath: string): Promise<T[]> {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data) as T[];
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      console.log(`ℹ️  File not found: ${filePath} (will be created)`);
      return [];
    }
    console.error(`⚠️  Error reading ${filePath}: ${nodeError.message}`);
    console.error('   The file may be corrupted. Returning empty array.');
    return [];
  }
}

export async function saveASINsToJSON(
  data: unknown[] | Record<string, unknown[]>,
  filePath: string
): Promise<boolean> {
  try {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');

    if (Array.isArray(data)) {
      console.log(`\n💾 Saved ${data.length} products to ${filePath}`);
    } else {
      const count = Object.values(data).reduce(
        (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 1),
        0
      );
      console.log(
        `\n💾 Saved ${count} ASINs organized by ${Object.keys(data).length} categories to ${filePath}`
      );
    }
    return true;
  } catch (error) {
    console.error('❌ Error saving JSON:', (error as Error).message);
    return false;
  }
}
