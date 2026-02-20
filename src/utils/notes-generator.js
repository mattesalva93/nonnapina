import XLSX from 'xlsx';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Notes Generator - Create a single text file for Mac Notes app
 * Generates a formatted text file with all products from Excel data for social media posts
 * Saves to Desktop for easy access
 */
class NotesGenerator {
  constructor(excelFilePath = './output/tracker_outcome.xlsx') {
    this.excelFilePath = excelFilePath;
    // Save to Desktop for easy user access
    this.outputDir = path.join(os.homedir(), 'Desktop');
  }

  /**
   * Get today's date in DD/MM/YYYY format
   */
  getTodayDate() {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  /**
   * Convert date from DD/MM/YYYY to sheet name format DD-MM-YYYY
   */
  dateToSheetName(dateString) {
    const parts = dateString.split('/');
    if (parts.length === 3) {
      return `${parts[0]}-${parts[1]}-${parts[2]}`;
    }
    return null;
  }

  /**
   * Parse a row from Excel into a product object
   */
  parseExcelRow(row, headers) {
    const product = {};

    // Map headers to product properties
    const headerMap = {
      'Data Fetch': 'dataFetch',
      Categoria: 'categoria',
      ASIN: 'asin',
      Titolo: 'titolo',
      'Prezzo Originale': 'prezzoOriginale',
      'Prezzo Scontato': 'prezzoScontato',
      'Importo Risparmiato (€)': 'importoRisparmiato',
      'Percentuale Sconto (%)': 'percentualeSconto',
      Valuta: 'valuta',
      Disponibilità: 'disponibilita',
      'Tipo Disponibilità': 'tipoDisponibilita',
      Rating: 'rating',
      'Numero Review': 'numeroReview',
      Features: 'features',
      'Immagine (Small)': 'immagineSmall',
      'Immagine (Large)': 'immagineLarge',
      'Link Web': 'linkWeb',
      'Link App iOS': 'linkAppIOS',
      'Link App Android': 'linkAppAndroid',
      'Link Storefront': 'linkStorefront',
      'Smart Link URL': 'smartLinkURL',
      'Parent ASIN': 'parentASIN',
      Marketplace: 'marketplace',
    };

    headers.forEach((header, index) => {
      const key = headerMap[header];
      if (key && row[index] !== undefined && row[index] !== null) {
        product[key] = row[index];
      }
    });

    return product;
  }

  /**
   * Extract date from "Data Fetch" cell (format: "DD/MM/YYYY HH:MM")
   */
  extractDateFromFetch(dataFetchString) {
    if (!dataFetchString || typeof dataFetchString !== 'string') {
      return null;
    }
    const datePart = dataFetchString.split(' ')[0];
    return datePart; // Returns DD/MM/YYYY
  }

  /**
   * Read products from Excel for a specific date
   */
  async readProductsForDate(targetDate) {
    try {
      // Read Excel file
      const wb = XLSX.readFile(this.excelFilePath);
      const sheetName = this.dateToSheetName(targetDate);

      if (!sheetName) {
        throw new Error(`Invalid date format: ${targetDate}`);
      }

      // Check if sheet exists
      if (!wb.Sheets[sheetName]) {
        throw new Error(`Sheet "${sheetName}" not found in Excel file`);
      }

      const ws = wb.Sheets[sheetName];

      // Convert sheet to array of arrays
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

      if (data.length < 3) {
        // No data rows (only headers and empty row)
        return [];
      }

      // First row is headers
      const headers = data[0];

      // Skip row 2 (empty), start from row 3 (index 2)
      const products = [];
      for (let i = 2; i < data.length; i++) {
        const row = data[i];

        // Skip empty rows
        if (!row || row.length === 0 || !row[0]) {
          continue;
        }

        const product = this.parseExcelRow(row, headers);

        // Verify this product matches the target date
        const productDate = this.extractDateFromFetch(product.dataFetch);
        if (productDate === targetDate) {
          products.push(product);
        }
      }

      return products;
    } catch (error) {
      throw new Error(`Error reading products from Excel: ${error.message}`);
    }
  }

  /**
   * Format product data into text for Mac Notes
   */
  formatProductForNote(product) {
    const lines = [];

    // Image URL
    if (product.immagineLarge) {
      lines.push(`🖼️ IMMAGINE: ${product.immagineLarge}`);
      lines.push('');
    }

    // Title
    if (product.titolo) {
      lines.push(`💬 ${product.titolo}`);
    }

    // Price information
    if (product.prezzoScontato && product.prezzoOriginale && product.percentualeSconto) {
      const prezzoScontato = this.formatPrice(product.prezzoScontato);
      const prezzoOriginale = this.formatPrice(product.prezzoOriginale);
      const sconto = this.formatDiscount(product.percentualeSconto);
      lines.push(`💰 A soli ${prezzoScontato}€ invece di ${prezzoOriginale}€ (-${sconto}%)`);
    } else if (product.prezzoScontato) {
      const prezzoScontato = this.formatPrice(product.prezzoScontato);
      lines.push(`💰 A soli ${prezzoScontato}€`);
    }

    // Empty line
    lines.push('');

    // Smart Link
    if (product.smartLinkURL) {
      lines.push(`🔗 ${product.smartLinkURL}`);
    }

    // Reviews and Rating
    if (product.numeroReview && product.rating) {
      const rating = this.formatRating(product.rating);
      lines.push(`⭐ ${product.numeroReview} Recensioni: ${rating} / 5.0`);
    }

    // Availability
    lines.push(`🚚 Venduto e spedito da Amazon`);

    return lines.join('\n');
  }

  /**
   * Format price (remove decimals if .00, otherwise keep 2 decimals)
   */
  formatPrice(price) {
    const num = parseFloat(price);
    if (isNaN(num)) return price;

    // If it's a whole number, don't show decimals
    if (num === Math.floor(num)) {
      return num.toFixed(0);
    }

    return num.toFixed(2).replace('.', ',');
  }

  /**
   * Format discount percentage
   */
  formatDiscount(discount) {
    const num = parseFloat(discount);
    if (isNaN(num)) return discount;

    return Math.round(num);
  }

  /**
   * Format rating
   */
  formatRating(rating) {
    const num = parseFloat(rating);
    if (isNaN(num)) return rating;

    return num.toFixed(1);
  }

  /**
   * Generate single text note file with all products for a specific date
   */
  async generateNotesForDate(targetDate) {
    console.log(`\n📝 Generating text note file for date: ${targetDate}`);

    try {
      // Read products for target date
      const products = await this.readProductsForDate(targetDate);

      if (products.length === 0) {
        console.log(`⚠️  No products found for date: ${targetDate}`);
        return { success: false, count: 0, message: 'No products found' };
      }

      console.log(`✅ Found ${products.length} products for date: ${targetDate}`);

      // Desktop should already exist, but ensure it does
      await fs.mkdir(this.outputDir, { recursive: true });

      // Generate filename: nonnapina_DD-MM-YYYY.txt
      const dateFormatted = this.dateToSheetName(targetDate);
      const fileName = `nonnapina_${dateFormatted}.txt`;
      const filePath = path.join(this.outputDir, fileName);

      console.log(`📁 Output directory: ${this.outputDir}`);
      console.log(`📄 Generating file: ${fileName}`);

      // Group products by category (maintaining order)
      const productsByCategory = new Map();
      for (const product of products) {
        const category = product.categoria || 'Senza Categoria';
        if (!productsByCategory.has(category)) {
          productsByCategory.set(category, []);
        }
        productsByCategory.get(category).push(product);
      }

      console.log(`📋 Products grouped in ${productsByCategory.size} categories`);

      // Build text content with all products grouped by category
      const contentParts = [];
      let isFirstCategory = true;

      for (const [category, categoryProducts] of productsByCategory) {
        // Add spacing before category (except for the first one)
        if (!isFirstCategory) {
          contentParts.push('\n\n');
        }
        isFirstCategory = false;

        // Add category header in uppercase
        contentParts.push(`━━━━━ ${category.toUpperCase()} ━━━━━`);
        contentParts.push('');

        // Add all products in this category
        for (let i = 0; i < categoryProducts.length; i++) {
          const product = categoryProducts[i];
          const productContent = this.formatProductForNote(product);
          contentParts.push(productContent);

          // Add separator between products in the same category (except after the last one)
          if (i < categoryProducts.length - 1) {
            contentParts.push('\n' + '─'.repeat(50) + '\n');
          }
        }
      }

      const finalContent = contentParts.join('\n');

      // Write text file
      await fs.writeFile(filePath, finalContent, 'utf-8');

      console.log(
        `\n✅ Successfully generated text note file with ${products.length} products in ${productsByCategory.size} categories`
      );
      console.log(`📁 File saved to Desktop: ${fileName}`);

      // Try to open the file automatically with TextEdit (macOS only)
      try {
        console.log(`\n🚀 Opening file with TextEdit...`);
        await execAsync(`open -a TextEdit "${filePath}"`);
        console.log(`✅ File opened successfully`);
      } catch (error) {
        console.log(`ℹ️  File created but could not be opened automatically: ${error.message}`);
        console.log(`   Please open the file manually from your Desktop`);
      }

      return {
        success: true,
        count: products.length,
        total: products.length,
        categories: productsByCategory.size,
        outputPath: filePath,
        fileName: fileName,
        message: `Generated note file with ${products.length} products in ${productsByCategory.size} categories`,
      };
    } catch (error) {
      console.error(`❌ Error generating notes: ${error.message}`);
      return {
        success: false,
        count: 0,
        error: error.message,
        message: `Failed to generate notes: ${error.message}`,
      };
    }
  }

  /**
   * Generate text note file using configured date or today's date
   */
  async generateNotes(configuredDate = '') {
    // Use configured date or today's date
    const targetDate =
      configuredDate && configuredDate.trim() !== '' ? configuredDate : this.getTodayDate();

    console.log(`\n${'═'.repeat(60)}`);
    console.log('📝 Mac Notes File Generator');
    console.log(`${'═'.repeat(60)}`);
    console.log(`📅 Target date: ${targetDate}${configuredDate ? ' (from config)' : ' (today)'}`);

    return await this.generateNotesForDate(targetDate);
  }
}

export const notesGenerator = new NotesGenerator();
