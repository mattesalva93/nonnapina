import XLSX from 'xlsx';
import fs from 'fs/promises';
import path from 'path';

/**
 * Excel Handler - Manage tracker_outcome Excel file
 */
class ExcelHandler {
  constructor(filePath = './output/tracker_outcome.xlsx') {
    this.filePath = filePath;
    this.sheetName = 'Prodotti';

    // Define column headers in Italian
    this.headers = [
      'Data Fetch',
      'Categoria',
      'ASIN',
      'Titolo',
      'Prezzo Originale',
      'Prezzo Scontato',
      'Importo Risparmiato (€)',
      'Percentuale Sconto (%)',
      'Valuta',
      'Disponibilità',
      'Tipo Disponibilità',
      'Rating',
      'Numero Review',
      'Features',
      'Immagine (Small)',
      'Immagine (Large)',
      'Link Web',
      'Link App iOS',
      'Link App Android',
      'Link Storefront',
      'Smart Link URL',
      'Parent ASIN',
      'Marketplace',
    ];
  }

  /**
   * Check if Excel file exists
   */
  async fileExists() {
    try {
      await fs.access(this.filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create new Excel file with headers
   * @param {string} sheetName - Name of the sheet (default: current date in DD-MM-YYYY format)
   */
  async createNewFile(sheetName = null) {
    // If no sheet name provided, use current date
    if (!sheetName) {
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, '0');
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const yyyy = now.getFullYear();
      sheetName = `${dd}-${mm}-${yyyy}`;
    }

    console.log(`📝 Creating new Excel file: ${this.filePath}`);
    console.log(`📄 First sheet: ${sheetName}`);

    // Create workbook and sheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      this.headers, // Row 1: Headers
      [], // Row 2: Empty (space between headers and data)
    ]);

    // Set column widths (doubled)
    const colWidths = Array(this.headers.length).fill({ wch: 32 });
    ws['!cols'] = colWidths;

    // Apply yellow fill color to header cells (Row 1)
    for (let i = 0; i < this.headers.length; i++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: i });

      // Get or create cell (aoa_to_sheet should have already created it)
      const cellValue = ws[cellAddress]?.v || this.headers[i];

      // Apply styling with indexed yellow color (5) and explicit cell value
      ws[cellAddress] = {
        v: cellValue,
        s: {
          fill: {
            patternType: 'solid',
            fgColor: { indexed: 5 }, // Indexed yellow (works reliably with XLSX)
          },
          font: {
            bold: true,
            color: { rgb: '000000' },
          },
          alignment: {
            horizontal: 'center',
            vertical: 'center',
            wrapText: true,
          },
          border: {
            top: { style: 'thin' },
            bottom: { style: 'thin' },
            left: { style: 'thin' },
            right: { style: 'thin' },
          },
        },
      };
    }

    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    // Ensure directory exists
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    XLSX.writeFile(wb, this.filePath);
    console.log(
      `✅ Excel file created with sheet: "${sheetName}" (first data row starts at row 3)`
    );

    return ws;
  }

  /**
   * Get last row index (last row with data)
   */
  async getLastRowIndex() {
    try {
      const wb = XLSX.readFile(this.filePath);
      const ws = wb.Sheets[this.sheetName];

      if (!ws) return 2; // After row 1 (headers), row 2 (empty)

      // Find last used row
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      return range.e.r; // Last used row
    } catch (error) {
      console.error('Error reading Excel file:', error.message);
      return 2; // Default to row 2
    }
  }

  /**
   * Format product data for Excel row
   */
  formatProductRow(product) {
    // Format date with time (DD/MM/YYYY HH:MM)
    let dateString = '';
    if (product.fetchedAt) {
      const date = new Date(product.fetchedAt);
      const dd = String(date.getDate()).padStart(2, '0');
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const yyyy = date.getFullYear();
      const hh = String(date.getHours()).padStart(2, '0');
      const min = String(date.getMinutes()).padStart(2, '0');
      dateString = `${dd}/${mm}/${yyyy} ${hh}:${min}`;
    }

    // Calculate discount amount from Keepa data if available
    let discountAmount = '';
    if (product.keepaAvgPrice && product.keepaCurrentPrice) {
      discountAmount = (product.keepaAvgPrice - product.keepaCurrentPrice).toFixed(2);
    }

    return [
      dateString,
      product.category || '',
      product.asin || '',
      product.title || '',
      product.keepaAvgPrice || product.originalPrice || '',
      product.price || product.keepaCurrentPrice || '',
      discountAmount || product.discountAmount || '',
      product.keepaDiscount || product.discountPercentage || '',
      product.currency || '',
      product.availability?.message || '',
      product.availability?.type || '',
      product.rating || product.keepaRating || '',
      product.ratingCount || product.keepaReviewCount || '',
      product.features ? product.features.join('; ') : '',
      product.image?.small || '',
      product.image?.large || '',
      product.affiliateLinks?.web || '',
      product.affiliateLinks?.mobileAppIOS || '',
      product.affiliateLinks?.mobileAppAndroid || '',
      product.affiliateLinks?.storefront || '',
      product.affiliateLinks?.smartLink?.url || '',
      product.parentASIN || '',
      product.marketplace || '',
    ];
  }

  /**
   * Get last fetch date from sheet
   */
  getLastFetchDate(ws) {
    try {
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

      // Start from row 3 (skipping headers and empty row)
      for (let row = range.e.r; row >= 2; row--) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: 0 });
        const cellValue = ws[cellAddress]?.v;

        if (cellValue && cellValue.trim() !== '') {
          // Extract date part (DD/MM/YYYY) from "DD/MM/YYYY HH:MM"
          const datePart = cellValue.split(' ')[0];
          return datePart;
        }
      }
    } catch (error) {
      console.error('Error getting last fetch date:', error.message);
    }
    return null;
  }

  /**
   * Get sheet name from date (DD/MM/YYYY format)
   */
  getSheetNameFromDate(dateString) {
    if (!dateString) return null;
    // Format: DD/MM/YYYY -> "20-02-2026" (for sheet name compatibility)
    const parts = dateString.split('/');
    if (parts.length === 3) {
      return `${parts[0]}-${parts[1]}-${parts[2]}`;
    }
    return null;
  }

  /**
   * Get or create sheet with headers
   */
  getOrCreateSheet(wb, sheetName) {
    let ws = wb.Sheets[sheetName];

    if (!ws) {
      // Create new sheet with headers
      ws = XLSX.utils.aoa_to_sheet([
        this.headers, // Row 1: Headers
        [], // Row 2: Empty (space between headers and data)
      ]);

      // Set column widths
      const colWidths = Array(this.headers.length).fill({ wch: 32 });
      ws['!cols'] = colWidths;

      // Apply yellow fill to headers
      for (let i = 0; i < this.headers.length; i++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: i });
        ws[cellAddress] = {
          v: this.headers[i],
          s: {
            fill: {
              patternType: 'solid',
              fgColor: { indexed: 5 },
            },
            font: {
              bold: true,
              color: { rgb: '000000' },
            },
            alignment: {
              horizontal: 'center',
              vertical: 'center',
              wrapText: true,
            },
            border: {
              top: { style: 'thin' },
              bottom: { style: 'thin' },
              left: { style: 'thin' },
              right: { style: 'thin' },
            },
          },
        };
      }

      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }

    return ws;
  }

  /**
   * Append products to Excel file with date-based sheet management
   */
  async appendProducts(products) {
    console.log(`\n💾 Writing ${products.length} products to Excel...\n`);

    // Get extraction date from first product
    if (!products || products.length === 0) {
      console.log('❌ No products to append');
      return;
    }

    const firstProduct = products[0];
    const extractionDate = new Date(firstProduct.fetchedAt);
    const dd = String(extractionDate.getDate()).padStart(2, '0');
    const mm = String(extractionDate.getMonth() + 1).padStart(2, '0');
    const yyyy = extractionDate.getFullYear();
    const todayDateString = `${dd}/${mm}/${yyyy}`;
    const todaySheetName = `${dd}-${mm}-${yyyy}`;

    const exists = await this.fileExists();

    if (!exists) {
      // Create new file with today's sheet
      await this.createNewFile(todaySheetName);
    }

    // Read existing file
    const wb = XLSX.readFile(this.filePath);

    // Check existing sheets for today's data
    let targetSheetName = todaySheetName;
    let ws = null;

    // Get all sheet names
    const existingSheets = wb.SheetNames;
    console.log(`📄 Existing sheets: ${existingSheets.join(', ')}`);

    // Try to find a sheet with today's date
    let todaySheetExists = existingSheets.includes(todaySheetName);

    if (todaySheetExists) {
      // Use today's sheet
      ws = wb.Sheets[todaySheetName];
      targetSheetName = todaySheetName;
      console.log(`📅 Found sheet for today (${todayDateString}), appending to: ${todaySheetName}`);
    } else {
      // Create new sheet for today
      console.log(`📅 No sheet found for today (${todayDateString})`);
      console.log(`📄 Creating new sheet: ${todaySheetName}`);
      ws = this.getOrCreateSheet(wb, todaySheetName);
      targetSheetName = todaySheetName;
    }

    // Ensure we have the target sheet
    if (!ws) {
      ws = this.getOrCreateSheet(wb, targetSheetName);
    }

    // Get last row in target sheet
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    let lastRow = range.e.r;

    // Start appending with blank row separator
    let startRow = lastRow >= 2 ? lastRow + 2 : 3; // +2 to skip blank row

    // Format all product rows
    const productRows = products.map(p => this.formatProductRow(p));

    // Append to sheet
    for (let i = 0; i < productRows.length; i++) {
      const rowIndex = startRow + i;
      for (let j = 0; j < productRows[i].length; j++) {
        const cellAddress = XLSX.utils.encode_cell({ r: rowIndex - 1, c: j });
        if (!ws[cellAddress]) ws[cellAddress] = {};
        ws[cellAddress].v = productRows[i][j];
      }
    }

    // Update range
    const newRange = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    newRange.e.r = Math.max(newRange.e.r, startRow + productRows.length - 2);
    ws['!ref'] = XLSX.utils.encode_range(newRange);

    // Write back
    XLSX.writeFile(wb, this.filePath);

    console.log(`✅ Successfully added ${productRows.length} products`);
    console.log(`📝 Sheet: "${targetSheetName}"`);
    console.log(`📁 File: ${this.filePath}`);
    console.log(`📊 Data rows in sheet: ${productRows.length}`);
  }

  /**
   * Get file stats
   */
  async getStats() {
    const exists = await this.fileExists();

    if (!exists) {
      return {
        exists: false,
        path: this.filePath,
        rows: 0,
        message: 'File does not exist yet',
      };
    }

    try {
      const wb = XLSX.readFile(this.filePath);
      const ws = wb.Sheets[this.sheetName];

      if (!ws) {
        return {
          exists: false,
          path: this.filePath,
          rows: 0,
          message: `Sheet "${this.sheetName}" not found`,
        };
      }

      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      const totalRows = range.e.r; // 0-indexed, so row 1 = headers, rows start at 0
      const dataRows = Math.max(0, totalRows); // Minus header

      return {
        exists: true,
        path: this.filePath,
        totalRows: totalRows + 1,
        dataRows: dataRows,
        headers: this.headers.length,
        message: `File exists with ${dataRows} data rows`,
      };
    } catch (error) {
      return {
        exists: true,
        path: this.filePath,
        error: error.message,
        message: 'Error reading file stats',
      };
    }
  }
}

export const excelHandler = new ExcelHandler();
