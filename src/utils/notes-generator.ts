import ExcelJS from 'exceljs';
import { exec } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { config } from '../config/index.js';
import type { NoteProduct, NotesResult } from '../types/index.js';
import ImageGenerator from './image-generator.js';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TELEGRAM_MAX_LENGTH = 4096;

const HEADER_MAP: Record<string, keyof NoteProduct> = {
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
  'Link Affiliato': 'linkAffiliato',
  'Link Storefront': 'linkStorefront',
  'Parent ASIN': 'parentASIN',
  Marketplace: 'marketplace',
};

class NotesGenerator {
  private readonly excelFilePath: string;
  private readonly outputDir: string;
  private readonly templatePath: string;
  private readonly logoSourcePath: string;
  private readonly imageGenerator: ImageGenerator;

  constructor(excelFilePath = './output/tracker_outcome.xlsx') {
    this.excelFilePath = excelFilePath;
    this.outputDir = path.join(os.homedir(), 'Desktop');
    this.templatePath = path.join(__dirname, '../templates/product-page-template.html');
    this.logoSourcePath = path.join(__dirname, '../../assets/AppIcon.iconset/icon_512x512@2x.png');
    this.imageGenerator = new ImageGenerator();
  }

  private async getLogoDataUri(): Promise<string> {
    try {
      const logoBuffer = await fs.readFile(this.logoSourcePath);
      const base64 = logoBuffer.toString('base64');
      return `data:image/png;base64,${base64}`;
    } catch {
      console.warn(`⚠️  Logo file not found: ${this.logoSourcePath}`);
      return '';
    }
  }

  private getTodayDate(): string {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  private dateToSheetName(dateString: string): string | undefined {
    const parts = dateString.split('/');
    if (parts.length === 3) {
      return `${parts[0]}-${parts[1]}-${parts[2]}`;
    }
    return undefined;
  }

  private parseExcelRow(
    row: (ExcelJS.CellValue | undefined)[],
    headers: ExcelJS.CellValue[]
  ): NoteProduct {
    const product: NoteProduct = {};

    headers.forEach((header, index) => {
      const key = HEADER_MAP[String(header)];
      if (key && row[index] != null) {
        (product as Record<string, unknown>)[key] = row[index];
      }
    });

    return product;
  }

  private extractDateFromFetch(dataFetchString: unknown): string | undefined {
    if (!dataFetchString || typeof dataFetchString !== 'string') return undefined;
    return dataFetchString.split(' ')[0];
  }

  private escapeHtml(text: unknown): string {
    if (!text) return '';
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  }

  private formatPrice(price: unknown): string | number {
    const num = parseFloat(String(price));
    if (isNaN(num)) return String(price ?? '');
    if (num === Math.floor(num)) return num.toFixed(0);
    return num.toFixed(2).replace('.', ',');
  }

  private formatDiscount(discount: unknown): number | string {
    const num = parseFloat(String(discount));
    if (isNaN(num)) return String(discount ?? '');
    return Math.round(num);
  }

  private formatRating(rating: unknown): string | number {
    const num = parseFloat(String(rating));
    if (isNaN(num)) return String(rating ?? '');
    return num.toFixed(1);
  }

  private generateCategoryId(category: string): string {
    return (
      'cat-' +
      category
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    );
  }

  async readProductsForDate(targetDate: string): Promise<NoteProduct[]> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(this.excelFilePath);
    const sheetName = this.dateToSheetName(targetDate);

    if (!sheetName) throw new Error(`Invalid date format: ${targetDate}`);

    const ws = wb.getWorksheet(sheetName);
    if (!ws) throw new Error(`Sheet "${sheetName}" not found in Excel file`);

    const data: (ExcelJS.CellValue | undefined)[][] = [];
    ws.eachRow({ includeEmpty: false }, row => {
      const rowValues: (ExcelJS.CellValue | undefined)[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        while (rowValues.length < colNumber - 1) rowValues.push(undefined);
        rowValues.push(cell.value);
      });
      data.push(rowValues);
    });

    if (data.length < 3) return [];

    const headers = data[0] ?? [];
    const products: NoteProduct[] = [];

    for (let i = 2; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0 || !row[0]) continue;

      const product = this.parseExcelRow(row, headers as ExcelJS.CellValue[]);
      const productDate = this.extractDateFromFetch(product.dataFetch);
      if (productDate === targetDate) products.push(product);
    }

    return products;
  }

  formatProductForNote(product: NoteProduct): string {
    const parts: string[] = [];
    parts.push('<div class="product">');

    if (product.immagineLarge) {
      parts.push('  <div class="image-section">');
      parts.push(
        `    <img src="${this.escapeHtml(product.immagineLarge)}" alt="${this.escapeHtml(product.titolo ?? 'Prodotto')}" class="product-image">`
      );
      parts.push(
        `    <a href="${this.escapeHtml(product.immagineLarge)}" target="_blank" class="image-link">🖼️ Link Immagine</a>`
      );
      parts.push('  </div>');
    }

    parts.push('  <div class="copyable-content">');
    parts.push('    <div class="text-content">');

    const textLines: string[] = [];

    if (product.titolo) {
      textLines.push(`💬 ${product.titolo}`);
      textLines.push('');
    }

    if (product.prezzoScontato && product.prezzoOriginale && product.percentualeSconto) {
      const prezzoScontato = this.formatPrice(product.prezzoScontato);
      const prezzoOriginale = this.formatPrice(product.prezzoOriginale);
      const sconto = this.formatDiscount(product.percentualeSconto);
      textLines.push(`💰 A soli ${prezzoScontato}€ invece di ${prezzoOriginale}€ (-${sconto}%)`);
    } else if (product.prezzoScontato) {
      textLines.push(`💰 A soli ${this.formatPrice(product.prezzoScontato)}€`);
    }

    textLines.push('');

    if (product.linkAffiliato) {
      textLines.push(`🔗 ${product.linkAffiliato}`);
      textLines.push('');
    }

    if (product.numeroReview && product.rating) {
      textLines.push(
        `⭐ ${product.numeroReview} Recensioni: ${this.formatRating(product.rating)} / 5.0`
      );
    }

    textLines.push(`🚚 Venduto e spedito da Amazon`);

    const textContent = textLines.join('\n');
    parts.push(`      <pre>${this.escapeHtml(textContent)}</pre>`);
    parts.push(`      <textarea class="hidden-copy-text">${textContent}</textarea>`);
    parts.push('    </div>');
    parts.push(
      '    <button class="copy-btn" onclick="copyToClipboard(this)" title="Copia negli appunti">'
    );
    parts.push('      <span class="copy-icon">📋</span>');
    parts.push('      <span class="copy-text">Copia</span>');
    parts.push('    </button>');
    parts.push('  </div>');
    parts.push('  <div class="copy-status-badge new">🆕 Nuova</div>');
    parts.push('</div>');

    return parts.join('\n');
  }

  truncateTitlesEquitably(products: NoteProduct[], charsToRemove: number): NoteProduct[] {
    const titleData = products
      .map((product, index) => ({
        index,
        originalTitle: product.titolo ?? '',
        currentTitle: product.titolo ?? '',
        originalLength: (product.titolo ?? '').length,
      }))
      .filter(item => item.originalLength > 0);

    if (titleData.length === 0) return products;

    let charsRemoved = 0;
    const ellipsis = '...';
    const minTitleLength = 30;

    while (charsRemoved < charsToRemove) {
      const truncatableTitles = titleData.filter(
        item => item.currentTitle.length > minTitleLength && !item.currentTitle.endsWith(ellipsis)
      );

      if (truncatableTitles.length === 0) {
        console.warn(
          `⚠️  Could only remove ${charsRemoved} of ${charsToRemove} characters (all titles at minimum length)`
        );
        break;
      }

      truncatableTitles.sort((a, b) => b.currentTitle.length - a.currentTitle.length);

      const remainingToRemove = charsToRemove - charsRemoved;
      const totalLength = truncatableTitles.reduce(
        (sum, item) => sum + item.currentTitle.length,
        0
      );

      for (const titleItem of truncatableTitles) {
        if (charsRemoved >= charsToRemove) break;

        const proportion = titleItem.currentTitle.length / totalLength;
        const charsToRemoveFromThis = Math.max(1, Math.ceil(remainingToRemove * proportion * 0.2));
        const maxRemovable = titleItem.currentTitle.length - minTitleLength;
        const actualRemoval = Math.min(
          charsToRemoveFromThis,
          maxRemovable,
          remainingToRemove - charsRemoved
        );

        if (actualRemoval > 0) {
          const newLength = titleItem.currentTitle.length - actualRemoval;
          titleItem.currentTitle = titleItem.originalTitle.substring(0, newLength) + ellipsis;
          charsRemoved += actualRemoval + ellipsis.length;
        }
      }
    }

    return products.map((product, index) => {
      const titleItem = titleData.find(item => item.index === index);
      if (titleItem && titleItem.currentTitle !== titleItem.originalTitle) {
        return { ...product, titolo: titleItem.currentTitle };
      }
      return product;
    });
  }

  formatTopDealsPost(topDeals: NoteProduct[], collageImagePath: string | undefined): string {
    const parts: string[] = [];

    parts.push('<div class="product top-deals-post">');

    if (collageImagePath) {
      parts.push('  <div class="image-section">');
      parts.push(
        `    <img src="${this.escapeHtml(collageImagePath)}" alt="Top 5 Deals" class="product-image top-deals-collage">`
      );
      parts.push('  </div>');
    }

    parts.push('  <div class="copyable-content">');
    parts.push('    <div class="text-content">');

    const generateTextContent = (products: NoteProduct[]): string => {
      const textLines: string[] = [];
      textLines.push('🏆 TOP 5 DEALS - MIGLIORI SCONTI! 🏆');
      textLines.push('');

      products.forEach(product => {
        if (product.titolo) textLines.push(`💬 ${product.titolo}`);

        if (product.prezzoScontato && product.prezzoOriginale && product.percentualeSconto) {
          const prezzoScontato = this.formatPrice(product.prezzoScontato);
          const prezzoOriginale = this.formatPrice(product.prezzoOriginale);
          const sconto = this.formatDiscount(product.percentualeSconto);
          textLines.push(
            `💰 A soli ${prezzoScontato}€ invece di ${prezzoOriginale}€ (-${sconto}%)`
          );
        } else if (product.prezzoScontato) {
          textLines.push(`💰 A soli ${this.formatPrice(product.prezzoScontato)}€`);
        }

        if (product.linkAffiliato) textLines.push(`🔗 ${product.linkAffiliato}`);
        textLines.push('');
      });

      return textLines.join('\n');
    };

    let textContent = generateTextContent(topDeals);
    let processedDeals = topDeals;

    if (textContent.length > TELEGRAM_MAX_LENGTH) {
      const charsToRemove = textContent.length - TELEGRAM_MAX_LENGTH + 50;
      console.log(
        `⚠️  Telegram post exceeds ${TELEGRAM_MAX_LENGTH} chars (${textContent.length} chars). Truncating titles...`
      );
      processedDeals = this.truncateTitlesEquitably(topDeals, charsToRemove);
      textContent = generateTextContent(processedDeals);
      console.log(`✅ Post truncated to ${textContent.length} chars (within Telegram limit)`);
    } else {
      console.log(`✅ Post length: ${textContent.length} chars (within Telegram limit)`);
    }

    parts.push(`      <pre>${this.escapeHtml(textContent)}</pre>`);
    parts.push(`      <textarea class="hidden-copy-text">${textContent}</textarea>`);
    parts.push('    </div>');
    parts.push(
      '    <button class="copy-btn" onclick="copyToClipboard(this)" title="Copia negli appunti">'
    );
    parts.push('      <span class="copy-icon">📋</span>');
    parts.push('      <span class="copy-text">Copia</span>');
    parts.push('    </button>');
    parts.push('  </div>');
    parts.push('  <div class="copy-status-badge new">🆕 Nuova</div>');
    parts.push('</div>');

    return parts.join('\n');
  }

  private async generateHTMLTemplate(
    title: string,
    categoryIndex: string,
    content: string
  ): Promise<string> {
    let template = await fs.readFile(this.templatePath, 'utf-8');
    const logoDataUri = await this.getLogoDataUri();

    template = template.replace(/{{PAGE_TITLE}}/g, this.escapeHtml(title));
    template = template.replace(/{{LOGO_PATH}}/g, logoDataUri);
    template = template.replace(/{{CATEGORY_INDEX}}/g, categoryIndex);
    template = template.replace(/{{PRODUCTS_CONTENT}}/g, content);

    return template;
  }

  private generateCategoryIndex(productsByCategory: Map<string, NoteProduct[]>): string {
    if (!productsByCategory || productsByCategory.size === 0) return '';

    const parts: string[] = [];
    parts.push('<div class="category-index" id="category-index">');
    parts.push('  <h2>📑 Indice Categorie</h2>');
    parts.push('  <ul>');

    for (const [category, products] of productsByCategory) {
      const categoryId = this.generateCategoryId(category);
      parts.push(
        `    <li><a href="#${categoryId}">${this.escapeHtml(category)} (${products.length})</a></li>`
      );
    }

    parts.push('  </ul>');
    parts.push('</div>');

    return parts.join('\n');
  }

  extractTopReviewProducts(
    products: NoteProduct[],
    topCount: number,
    minReviews: number
  ): NoteProduct[] {
    const eligible = products.filter(product => {
      const reviewCount = parseInt(String(product.numeroReview)) || 0;
      const rating = parseFloat(String(product.rating)) || 0;
      return reviewCount >= minReviews && rating > 0;
    });

    eligible.sort((a, b) => {
      const ratingA = parseFloat(String(a.rating)) || 0;
      const ratingB = parseFloat(String(b.rating)) || 0;
      if (ratingB !== ratingA) return ratingB - ratingA;
      const reviewsA = parseInt(String(a.numeroReview)) || 0;
      const reviewsB = parseInt(String(b.numeroReview)) || 0;
      return reviewsB - reviewsA;
    });

    return eligible.slice(0, topCount);
  }

  extractTopDeals(products: NoteProduct[], topCount: number): NoteProduct[] {
    const eligible = products.filter(product => {
      const discount = parseFloat(String(product.percentualeSconto)) || 0;
      return discount > 0;
    });

    eligible.sort((a, b) => {
      const discountA = parseFloat(String(a.percentualeSconto)) || 0;
      const discountB = parseFloat(String(b.percentualeSconto)) || 0;
      return discountB - discountA;
    });

    return eligible.slice(0, topCount);
  }

  async generateNotesForDate(targetDate: string): Promise<NotesResult & Record<string, unknown>> {
    console.log(`\n📝 Generating HTML page for date: ${targetDate}`);

    try {
      const products = await this.readProductsForDate(targetDate);

      if (products.length === 0) {
        console.log(`⚠️  No products found for date: ${targetDate}`);
        return { success: false, count: 0, message: 'No products found' };
      }

      console.log(`✅ Found ${products.length} products for date: ${targetDate}`);

      await fs.mkdir(this.outputDir, { recursive: true });

      const dateFormatted = this.dateToSheetName(targetDate);
      const fileName = `nonnapina_${dateFormatted}.html`;
      const filePath = path.join(this.outputDir, fileName);

      console.log(`📁 Output directory: ${this.outputDir}`);
      console.log(`📄 Generating file: ${fileName}`);

      const topProducts = this.extractTopReviewProducts(
        products,
        config.notes.topReviewCount,
        config.notes.minReviews
      );

      if (topProducts.length > 0) {
        console.log(
          `⭐ Extracted ${topProducts.length} top-rated products (min ${config.notes.minReviews} reviews)`
        );
      }

      const topDeals = this.extractTopDeals(products, config.notes.topDealsCount);

      if (topDeals.length > 0) {
        console.log(`💰 Extracted ${topDeals.length} top deals by discount percentage`);

        if (topDeals.length >= 3 && topDeals.length <= 5) {
          try {
            await this.imageGenerator.createTopDealsCollage(topDeals);
            console.log('✅ Top deals collage created successfully');
          } catch (error) {
            console.error('❌ Failed to create top deals collage:', (error as Error).message);
          }
        } else if (topDeals.length < 3) {
          console.warn(
            `⚠️  Not enough products for collage (found ${topDeals.length}, need at least 3)`
          );
        }
      }

      const topDealsAsins = new Set(topDeals.map(p => p.asin));
      const regularProductsByCategory = new Map<string, NoteProduct[]>();

      for (const product of products) {
        if (topDealsAsins.has(product.asin)) continue;

        const category = product.categoria ?? 'Senza Categoria';
        if (!regularProductsByCategory.has(category)) {
          regularProductsByCategory.set(category, []);
        }
        regularProductsByCategory.get(category)!.push(product);
      }

      const productsByCategory = new Map<string, NoteProduct[]>();

      if (topDeals.length > 0) productsByCategory.set('Top 5 Deals', topDeals);
      if (topProducts.length > 0) productsByCategory.set('Top Review Scores', topProducts);

      for (const [category, categoryProducts] of regularProductsByCategory) {
        productsByCategory.set(category, categoryProducts);
      }

      console.log(`📋 Products grouped in ${productsByCategory.size} categories`);

      const categoryIndex = this.generateCategoryIndex(productsByCategory);
      const contentParts: string[] = [];

      for (const [category, categoryProducts] of productsByCategory) {
        const categoryId = this.generateCategoryId(category);
        contentParts.push(
          `<div class="category-header" id="${categoryId}">━━━━━ ${this.escapeHtml(category.toUpperCase())} ━━━━━</div>`
        );

        contentParts.push('<div class="products-grid">');

        if (category === 'Top 5 Deals') {
          const collageFileName = 'top-5-deals.jpg';
          const collageAbsolutePath = path.resolve(
            (this.imageGenerator as unknown as { outputDir: string }).outputDir,
            collageFileName
          );
          contentParts.push(this.formatTopDealsPost(categoryProducts, collageAbsolutePath));
        } else {
          for (const product of categoryProducts) {
            contentParts.push(this.formatProductForNote(product));
          }
        }

        contentParts.push('</div>');
      }

      const htmlContent = contentParts.join('\n');
      const title = `I consigli di Nonna Pina - ${dateFormatted}`;
      const fullHTML = await this.generateHTMLTemplate(title, categoryIndex, htmlContent);

      await fs.writeFile(filePath, fullHTML, 'utf-8');

      console.log(
        `\n✅ Successfully generated HTML page with ${products.length} products in ${productsByCategory.size} categories`
      );
      console.log(`📁 File saved to Desktop: ${fileName}`);

      try {
        console.log(`\n🚀 Opening file with default browser...`);
        await execAsync(`open "${filePath}"`);
        console.log(`✅ File opened successfully`);
      } catch (error) {
        console.log(
          `ℹ️  File created but could not be opened automatically: ${(error as Error).message}`
        );
        console.log(`   Please open the file manually from your Desktop`);
      }

      return {
        success: true,
        count: products.length,
        total: products.length,
        categories: productsByCategory.size,
        outputPath: filePath,
        fileName,
        message: `Generated HTML page with ${products.length} products in ${productsByCategory.size} categories`,
      };
    } catch (error) {
      console.error(`❌ Error generating HTML page: ${(error as Error).message}`);
      return {
        success: false,
        count: 0,
        error: (error as Error).message,
        message: `Failed to generate HTML page: ${(error as Error).message}`,
      };
    }
  }

  async generateNotes(configuredDate = ''): Promise<NotesResult & Record<string, unknown>> {
    const targetDate =
      configuredDate && configuredDate.trim() !== '' ? configuredDate : this.getTodayDate();

    console.log(`\n${'═'.repeat(60)}`);
    console.log('📝 HTML Page Generator for Amazon Deals');
    console.log(`${'═'.repeat(60)}`);
    console.log(`📅 Target date: ${targetDate}${configuredDate ? ' (from config)' : ' (today)'}`);

    return this.generateNotesForDate(targetDate);
  }
}

export const notesGenerator = new NotesGenerator();
