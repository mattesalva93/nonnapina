import XLSX from 'xlsx';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { config } from '../config/index.js';
import ImageGenerator from './image-generator.js';

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
    // Image generator for creating collages
    this.imageGenerator = new ImageGenerator();
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
   * Truncate product titles intelligently to fit within Telegram's character limit
   * Longer titles are truncated more aggressively than shorter ones
   * @param {Array} products - Array of products with titles
   * @param {number} charsToRemove - Number of characters to remove in total
   * @returns {Array} Products with truncated titles
   */
  truncateTitlesEquitably(products, charsToRemove) {
    // Create a working copy with title lengths
    const titleData = products
      .map((product, index) => ({
        index,
        originalTitle: product.titolo || '',
        currentTitle: product.titolo || '',
        originalLength: (product.titolo || '').length,
      }))
      .filter(item => item.originalLength > 0);

    if (titleData.length === 0) {
      return products;
    }

    let charsRemoved = 0;
    const ellipsis = '...';
    const minTitleLength = 30; // Minimum characters to keep in a title

    // Iteratively truncate titles, starting with the longest ones
    while (charsRemoved < charsToRemove) {
      // Find titles that can still be truncated
      const truncatableTitles = titleData.filter(
        item => item.currentTitle.length > minTitleLength && !item.currentTitle.endsWith(ellipsis)
      );

      if (truncatableTitles.length === 0) {
        // Can't truncate anymore, break
        console.warn(
          `⚠️  Could only remove ${charsRemoved} of ${charsToRemove} characters (all titles at minimum length)`
        );
        break;
      }

      // Sort by current length (longest first)
      truncatableTitles.sort((a, b) => b.currentTitle.length - a.currentTitle.length);

      // Calculate how many chars to remove from each title in this iteration
      // We remove more from longer titles
      const remainingToRemove = charsToRemove - charsRemoved;
      const totalLength = truncatableTitles.reduce(
        (sum, item) => sum + item.currentTitle.length,
        0
      );

      for (const titleItem of truncatableTitles) {
        if (charsRemoved >= charsToRemove) break;

        // Calculate proportional removal: longer titles lose more characters
        const proportion = titleItem.currentTitle.length / totalLength;
        const charsToRemoveFromThis = Math.max(1, Math.ceil(remainingToRemove * proportion * 0.2)); // Remove 20% per iteration

        const maxRemovable = titleItem.currentTitle.length - minTitleLength;
        const actualRemoval = Math.min(
          charsToRemoveFromThis,
          maxRemovable,
          remainingToRemove - charsRemoved
        );

        if (actualRemoval > 0) {
          // Truncate and add ellipsis
          const newLength = titleItem.currentTitle.length - actualRemoval;
          titleItem.currentTitle = titleItem.originalTitle.substring(0, newLength) + ellipsis;
          charsRemoved += actualRemoval + ellipsis.length; // Account for ellipsis length too
        }
      }
    }

    // Create updated products array
    const updatedProducts = products.map((product, index) => {
      const titleItem = titleData.find(item => item.index === index);
      if (titleItem && titleItem.currentTitle !== titleItem.originalTitle) {
        return { ...product, titolo: titleItem.currentTitle };
      }
      return product;
    });

    return updatedProducts;
  }

  /**
   * Format Top 5 Deals special post with collage image
   * Automatically truncates titles if content exceeds Telegram's 4096 character limit
   * @param {Array} topDeals - Array of top 5 deal products
   * @param {string} collageImagePath - Path to the collage image
   * @returns {string} HTML content for the special post
   */
  formatTopDealsPost(topDeals, collageImagePath) {
    const TELEGRAM_MAX_LENGTH = 4096;
    const parts = [];

    parts.push('<div class="product top-deals-post">');

    // Collage image section
    if (collageImagePath) {
      parts.push('  <div class="image-section">');
      parts.push(
        `    <img src="${this.escapeHtml(collageImagePath)}" alt="Top 5 Deals" class="product-image top-deals-collage">`
      );
      parts.push('  </div>');
    }

    // Copyable content section with all top deals
    parts.push('  <div class="copyable-content">');
    parts.push('    <div class="text-content">');

    // Generate text content with a helper function for reusability
    const generateTextContent = products => {
      const textLines = [];
      textLines.push('🏆 TOP 5 DEALS - MIGLIORI SCONTI! 🏆');
      textLines.push('');

      // Add each product
      products.forEach((product, index) => {
        if (product.titolo) {
          textLines.push(`💬 ${product.titolo}`);
        }

        // Price information
        if (product.prezzoScontato && product.prezzoOriginale && product.percentualeSconto) {
          const prezzoScontato = this.formatPrice(product.prezzoScontato);
          const prezzoOriginale = this.formatPrice(product.prezzoOriginale);
          const sconto = this.formatDiscount(product.percentualeSconto);
          textLines.push(
            `💰 A soli ${prezzoScontato}€ invece di ${prezzoOriginale}€ (-${sconto}%)`
          );
        } else if (product.prezzoScontato) {
          const prezzoScontato = this.formatPrice(product.prezzoScontato);
          textLines.push(`💰 A soli ${prezzoScontato}€`);
        }

        if (product.smartLinkURL) {
          textLines.push(`🔗 ${product.smartLinkURL}`);
        }

        textLines.push(''); // Empty line between products
      });

      return textLines.join('\n');
    };

    // Generate initial text content
    let textContent = generateTextContent(topDeals);
    let processedDeals = topDeals;

    // Check if content exceeds Telegram limit
    if (textContent.length > TELEGRAM_MAX_LENGTH) {
      const charsToRemove = textContent.length - TELEGRAM_MAX_LENGTH + 50; // Extra buffer
      console.log(
        `⚠️  Telegram post exceeds ${TELEGRAM_MAX_LENGTH} chars (${textContent.length} chars). Truncating titles...`
      );

      // Truncate titles equitably
      processedDeals = this.truncateTitlesEquitably(topDeals, charsToRemove);

      // Regenerate text content with truncated titles
      textContent = generateTextContent(processedDeals);

      console.log(`✅ Post truncated to ${textContent.length} chars (within Telegram limit)`);
    } else {
      console.log(`✅ Post length: ${textContent.length} chars (within Telegram limit)`);
    }

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

    // Copy status badge
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
   * Extract top-rated products based on rating and review count
   * @param {Array} products - All products
   * @param {number} topCount - Number of top products to extract
   * @param {number} minReviews - Minimum number of reviews required
   * @returns {Array} Top-rated products
   */
  extractTopReviewProducts(products, topCount, minReviews) {
    // Filter products with minimum reviews and valid rating
    const eligibleProducts = products.filter(product => {
      const reviewCount = parseInt(product.numeroReview) || 0;
      const rating = parseFloat(product.rating) || 0;
      return reviewCount >= minReviews && rating > 0;
    });

    // Sort by rating (descending), then by review count (descending)
    eligibleProducts.sort((a, b) => {
      const ratingA = parseFloat(a.rating) || 0;
      const ratingB = parseFloat(b.rating) || 0;

      if (ratingB !== ratingA) {
        return ratingB - ratingA; // Higher rating first
      }

      // If same rating, sort by number of reviews
      const reviewsA = parseInt(a.numeroReview) || 0;
      const reviewsB = parseInt(b.numeroReview) || 0;
      return reviewsB - reviewsA; // More reviews first
    });

    // Return top N products
    return eligibleProducts.slice(0, topCount);
  }

  /**
   * Extract top deals based on discount percentage
   * @param {Array} products - All products
   * @param {number} topCount - Number of top deals to extract
   * @returns {Array} Top deals by discount percentage
   */
  extractTopDeals(products, topCount) {
    // Filter products with valid discount percentage
    const eligibleProducts = products.filter(product => {
      const discount = parseFloat(product.percentualeSconto) || 0;
      return discount > 0;
    });

    // Sort by discount percentage (descending)
    eligibleProducts.sort((a, b) => {
      const discountA = parseFloat(a.percentualeSconto) || 0;
      const discountB = parseFloat(b.percentualeSconto) || 0;
      return discountB - discountA; // Higher discount first
    });

    // Return top N products
    return eligibleProducts.slice(0, topCount);
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

      // Extract top-rated products for special category
      const topReviewCount = config.notes.topReviewCount;
      const minReviews = config.notes.minReviews;
      const topProducts = this.extractTopReviewProducts(products, topReviewCount, minReviews);

      if (topProducts.length > 0) {
        console.log(
          `⭐ Extracted ${topProducts.length} top-rated products (min ${minReviews} reviews)`
        );
      }

      // Extract top deals by discount percentage
      const topDealsCount = config.notes.topDealsCount;
      const topDeals = this.extractTopDeals(products, topDealsCount);

      if (topDeals.length > 0) {
        console.log(`💰 Extracted ${topDeals.length} top deals by discount percentage`);

        // Generate collage image for top deals
        if (topDeals.length === topDealsCount) {
          try {
            await this.imageGenerator.createTopDealsCollage(topDeals);
            console.log('✅ Top deals collage created successfully');
          } catch (error) {
            console.error('❌ Failed to create top deals collage:', error.message);
          }
        } else {
          console.warn(
            `⚠️  Not enough products for collage (found ${topDeals.length}, need ${topDealsCount})`
          );
        }
      }

      // Create a Set of top deals ASINs for easy lookup (only top deals, not top reviews)
      // Products in Top Review Scores will still appear in their original category
      const topDealsAsins = new Set(topDeals.map(p => p.asin));

      // Group products by category (excluding only top deals)
      const regularProductsByCategory = new Map();
      for (const product of products) {
        // Skip products that are in top deals (but keep top review products in their categories)
        if (topDealsAsins.has(product.asin)) {
          continue;
        }

        const category = product.categoria || 'Senza Categoria';
        if (!regularProductsByCategory.has(category)) {
          regularProductsByCategory.set(category, []);
        }
        regularProductsByCategory.get(category).push(product);
      }

      // Build final productsByCategory map with special categories first
      const productsByCategory = new Map();

      // 1. Add Top 5 Deals category first (if there are any top deals)
      if (topDeals.length > 0) {
        productsByCategory.set('Top 5 Deals', topDeals);
      }

      // 2. Add Top Review Scores category second (if there are any top products)
      if (topProducts.length > 0) {
        productsByCategory.set('Top Review Scores', topProducts);
      }

      // 3. Add all other categories
      for (const [category, categoryProducts] of regularProductsByCategory) {
        productsByCategory.set(category, categoryProducts);
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

        // Special handling for Top 5 Deals category
        if (category === 'Top 5 Deals') {
          // Open products grid container
          contentParts.push('<div class="products-grid">');

          // Generate special post with collage image (use absolute path for browser)
          const collageFileName = 'top-5-deals.png';
          const collageAbsolutePath = path.resolve(this.imageGenerator.outputDir, collageFileName);
          const topDealsPost = this.formatTopDealsPost(categoryProducts, collageAbsolutePath);
          contentParts.push(topDealsPost);

          // Close products grid container
          contentParts.push('</div>');
        } else {
          // Regular category handling
          // Open products grid container
          contentParts.push('<div class="products-grid">');

          // Add all products in this category
          for (const product of categoryProducts) {
            const productContent = this.formatProductForNote(product);
            contentParts.push(productContent);
          }

          // Close products grid container
          contentParts.push('</div>');
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
