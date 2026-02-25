import XLSX from 'xlsx';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const execAsync = promisify(exec);

// Get current file's directory (for ES modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Notes Generator - Create an HTML page with product deals
 * Generates a formatted HTML page with all products from Excel data for social media posts
 * Saves to Desktop for easy access
 */
class NotesGenerator {
  constructor(excelFilePath = './output/tracker_outcome.xlsx') {
    this.excelFilePath = excelFilePath;
    // Save to Desktop for easy user access
    this.outputDir = path.join(os.homedir(), 'Desktop');
    // Template path
    this.templatePath = path.join(__dirname, '../templates/product-page-template.html');
    // Logo path (relative to the HTML file that will be on Desktop)
    this.logoPath = path.join(__dirname, '../../assets/AppIcon.iconset/icon_512x512@2x.png');
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
   * Format product data into HTML for display
   */
  formatProductForNote(product) {
    const parts = [];

    // Start product container
    parts.push('<div class="product">');

    // Image section - render image first, then link below
    if (product.immagineLarge) {
      parts.push('  <div class="image-section">');
      parts.push(
        `    <img src="${this.escapeHtml(product.immagineLarge)}" alt="${this.escapeHtml(product.titolo || 'Prodotto')}" class="product-image">`
      );
      parts.push(
        `    <a href="${this.escapeHtml(product.immagineLarge)}" target="_blank" class="image-link">🖼️ Link Immagine</a>`
      );
      parts.push('  </div>');
    }

    // Copyable content section
    parts.push('  <div class="copyable-content">');
    parts.push('    <div class="text-content">');

    const textLines = [];

    // Title
    if (product.titolo) {
      textLines.push(`💬 ${product.titolo}`);
      textLines.push(''); // Empty line after title
    }

    // Price information
    if (product.prezzoScontato && product.prezzoOriginale && product.percentualeSconto) {
      const prezzoScontato = this.formatPrice(product.prezzoScontato);
      const prezzoOriginale = this.formatPrice(product.prezzoOriginale);
      const sconto = this.formatDiscount(product.percentualeSconto);
      textLines.push(`💰 A soli ${prezzoScontato}€ invece di ${prezzoOriginale}€ (-${sconto}%)`);
    } else if (product.prezzoScontato) {
      const prezzoScontato = this.formatPrice(product.prezzoScontato);
      textLines.push(`💰 A soli ${prezzoScontato}€`);
    }

    textLines.push(''); // Empty line

    // Smart Link
    if (product.smartLinkURL) {
      textLines.push(`🔗 ${product.smartLinkURL}`);
      textLines.push(''); // Empty line after link
    }

    // Reviews and Rating
    if (product.numeroReview && product.rating) {
      const rating = this.formatRating(product.rating);
      textLines.push(`⭐ ${product.numeroReview} Recensioni: ${rating} / 5.0`);
    }

    // Availability
    textLines.push(`🚚 Venduto e spedito da Amazon`);

    // Store text content in data attribute for copying
    const textContent = textLines.join('\n');
    parts.push(`      <pre>${this.escapeHtml(textContent)}</pre>`);
    parts.push(
      `      <textarea class="hidden-copy-text">${this.escapeHtml(textContent)}</textarea>`
    );
    parts.push('    </div>');

    // Copy button
    parts.push(
      '    <button class="copy-btn" onclick="copyToClipboard(this)" title="Copia negli appunti">'
    );
    parts.push('      <span class="copy-icon">📋</span>');
    parts.push('      <span class="copy-text">Copia</span>');
    parts.push('    </button>');

    parts.push('  </div>');

    // Copy status badge (not copied)
    parts.push('  <div class="copy-status-badge new">🆕 Nuova</div>');

    parts.push('</div>');

    return parts.join('\n');
  }

  /**
   * Escape HTML special characters
   */
  escapeHtml(text) {
    if (!text) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.toString().replace(/[&<>"']/g, m => map[m]);
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
   * Read HTML template and replace placeholders
   */
  async generateHTMLTemplate(title, categoryIndex, content) {
    try {
      // Read template file
      let template = await fs.readFile(this.templatePath, 'utf-8');

      // Replace placeholders
      template = template.replace(/{{PAGE_TITLE}}/g, this.escapeHtml(title));
      template = template.replace(/{{LOGO_PATH}}/g, this.logoPath);
      template = template.replace(/{{CATEGORY_INDEX}}/g, categoryIndex);
      template = template.replace(/{{PRODUCTS_CONTENT}}/g, content);

      return template;
    } catch (error) {
      console.error(`❌ Error reading HTML template: ${error.message}`);
      throw new Error(`Failed to load HTML template: ${error.message}`);
    }
  }

  /**
   * Generate category index HTML with anchor links
   */
  generateCategoryIndex(productsByCategory) {
    if (!productsByCategory || productsByCategory.size === 0) return '';

    const parts = [];
    parts.push('<div class="category-index" id="category-index">');
    parts.push('  <h2>📑 Indice Categorie</h2>');
    parts.push('  <ul>');

    for (const [category, products] of productsByCategory) {
      const categoryId = this.generateCategoryId(category);
      const count = products.length;
      parts.push(
        `    <li><a href="#${categoryId}">${this.escapeHtml(category)} (${count})</a></li>`
      );
    }

    parts.push('  </ul>');
    parts.push('</div>');

    return parts.join('\n');
  }

  /**
   * Generate a URL-safe ID from category name
   */
  generateCategoryId(category) {
    return (
      'cat-' +
      category
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    );
  }

  /**
   * Generate HTML page with all products for a specific date
   */
  async generateNotesForDate(targetDate) {
    console.log(`\n📝 Generating HTML page for date: ${targetDate}`);

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

      // Generate filename: nonnapina_DD-MM-YYYY.html
      const dateFormatted = this.dateToSheetName(targetDate);
      const fileName = `nonnapina_${dateFormatted}.html`;
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

      // Generate category index
      const categoryIndex = this.generateCategoryIndex(productsByCategory);

      // Build HTML content with all products grouped by category
      const contentParts = [];

      for (const [category, categoryProducts] of productsByCategory) {
        const categoryId = this.generateCategoryId(category);
        // Add category header with ID for anchor linking
        contentParts.push(
          `<div class="category-header" id="${categoryId}">━━━━━ ${this.escapeHtml(category.toUpperCase())} ━━━━━</div>`
        );

        // Add all products in this category
        for (let i = 0; i < categoryProducts.length; i++) {
          const product = categoryProducts[i];
          const productContent = this.formatProductForNote(product);
          contentParts.push(productContent);

          // Add separator between products in the same category (except after the last one)
          if (i < categoryProducts.length - 1) {
            contentParts.push('<hr class="product-separator">');
          }
        }
      }

      const htmlContent = contentParts.join('\n');
      const title = `I consigli di Nonna Pina - ${dateFormatted}`;
      const fullHTML = await this.generateHTMLTemplate(title, categoryIndex, htmlContent);

      // Write HTML file
      await fs.writeFile(filePath, fullHTML, 'utf-8');

      console.log(
        `\n✅ Successfully generated HTML page with ${products.length} products in ${productsByCategory.size} categories`
      );
      console.log(`📁 File saved to Desktop: ${fileName}`);

      // Try to open the file automatically with default browser
      try {
        console.log(`\n🚀 Opening file with default browser...`);
        await execAsync(`open "${filePath}"`);
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
        message: `Generated HTML page with ${products.length} products in ${productsByCategory.size} categories`,
      };
    } catch (error) {
      console.error(`❌ Error generating HTML page: ${error.message}`);
      return {
        success: false,
        count: 0,
        error: error.message,
        message: `Failed to generate HTML page: ${error.message}`,
      };
    }
  }

  /**
   * Generate HTML page using configured date or today's date
   */
  async generateNotes(configuredDate = '') {
    // Use configured date or today's date
    const targetDate =
      configuredDate && configuredDate.trim() !== '' ? configuredDate : this.getTodayDate();

    console.log(`\n${'═'.repeat(60)}`);
    console.log('📝 HTML Page Generator for Amazon Deals');
    console.log(`${'═'.repeat(60)}`);
    console.log(`📅 Target date: ${targetDate}${configuredDate ? ' (from config)' : ' (today)'}`);

    return await this.generateNotesForDate(targetDate);
  }
}

export const notesGenerator = new NotesGenerator();
