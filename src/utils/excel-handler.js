import ExcelJS from 'exceljs';
import fs from 'fs/promises';
import path from 'path';

/**
 * Excel Handler - Manage tracker_outcome Excel file
 * Uses ExcelJS instead of xlsx for security (no known vulnerabilities)
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
      'Link Affiliato',
      'Link Storefront',
      'Parent ASIN',
      'Marketplace',
    ];

    // Header style definition
    this.headerStyle = {
      fill: {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFF00' }, // Yellow
      },
      font: {
        bold: true,
        color: { argb: 'FF000000' },
      },
      alignment: {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      },
      border: {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      },
    };
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
   * Apply header styling to a worksheet's first row
   */
  applyHeaderStyle(ws) {
    const headerRow = ws.getRow(1);
    headerRow.eachCell(cell => {
      cell.fill = this.headerStyle.fill;
      cell.font = this.headerStyle.font;
      cell.alignment = this.headerStyle.alignment;
      cell.border = this.headerStyle.border;
    });

    // Set column widths
    ws.columns.forEach(col => {
      col.width = 32;
    });
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
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(sheetName);

    // Add header row (row 1)
    ws.addRow(this.headers);

    // Add empty row (row 2) - space between headers and data
    ws.addRow([]);

    // Apply header styling
    this.applyHeaderStyle(ws);

    // Ensure directory exists
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    await wb.xlsx.writeFile(this.filePath);
    console.log(
      `✅ Excel file created with sheet: "${sheetName}" (first data row starts at row 3)`
    );

    return ws;
  }

  /**
   * Get last row index (last row with data) - returns 0-based index for compatibility
   */
  async getLastRowIndex() {
    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(this.filePath);
      const ws = wb.getWorksheet(this.sheetName);

      if (!ws) return 2; // After row 1 (headers), row 2 (empty)

      return ws.rowCount - 1; // Convert to 0-based
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
      product.affiliateLinks?.storefront || '',
      product.parentASIN || '',
      product.marketplace || '',
    ];
  }

  /**
   * Get last fetch date from sheet
   */
  getLastFetchDate(ws) {
    try {
      const rowCount = ws.rowCount;

      // Start from last row, go backwards (skipping headers row 1 and empty row 2)
      for (let row = rowCount; row >= 3; row--) {
        const cellValue = ws.getRow(row).getCell(1).value;

        if (cellValue && String(cellValue).trim() !== '') {
          // Extract date part (DD/MM/YYYY) from "DD/MM/YYYY HH:MM"
          const datePart = String(cellValue).split(' ')[0];
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
    let ws = wb.getWorksheet(sheetName);

    if (!ws) {
      // Create new sheet with headers
      ws = wb.addWorksheet(sheetName);

      // Add header row (row 1)
      ws.addRow(this.headers);

      // Add empty row (row 2)
      ws.addRow([]);

      // Apply header styling
      this.applyHeaderStyle(ws);
    }

    return ws;
  }

  /**
   * Compare two product rows
   * Returns: 'identical' | 'price-only' | 'different'
   */
  compareProductRows(row1, row2) {
    // ASIN is at index 2
    if (row1[2] !== row2[2]) {
      return 'different'; // Different products
    }

    // Check if all fields are identical
    let allIdentical = true;
    let onlyPriceDifferent = true;

    // Price-related fields indices
    const priceIndices = [4, 5, 6, 7]; // Prezzo Originale, Prezzo Scontato, Importo Risparmiato, Percentuale Sconto

    for (let i = 0; i < row1.length; i++) {
      // Skip date field (index 0) for comparison
      if (i === 0) continue;

      const val1 = row1[i] === null || row1[i] === undefined ? '' : String(row1[i]);
      const val2 = row2[i] === null || row2[i] === undefined ? '' : String(row2[i]);

      if (val1 !== val2) {
        allIdentical = false;
        // If difference is NOT in price fields, it's a different product variant
        if (!priceIndices.includes(i)) {
          onlyPriceDifferent = false;
        }
      }
    }

    if (allIdentical) {
      return 'identical';
    } else if (onlyPriceDifferent) {
      return 'price-only';
    } else {
      return 'different';
    }
  }

  /**
   * Read all existing product rows from sheet
   * Returns array of { rowIndex (1-based), data (array of values) }
   */
  readExistingRows(ws) {
    const existingRows = [];
    const rowCount = ws.rowCount;
    const colCount = ws.columnCount;

    if (rowCount < 3) {
      return existingRows;
    }

    // Start from row 3 (1-based) - skip header and empty row
    for (let rowIndex = 3; rowIndex <= rowCount; rowIndex++) {
      const excelRow = ws.getRow(rowIndex);
      const row = [];
      let hasData = false;

      for (let colIndex = 1; colIndex <= colCount; colIndex++) {
        const value = excelRow.getCell(colIndex).value;
        const val = value !== null && value !== undefined ? value : '';
        row.push(val);
        if (val !== '') {
          hasData = true;
        }
      }

      if (hasData) {
        existingRows.push({ rowIndex, data: row });
      }
    }

    return existingRows;
  }

  /**
   * Append products to Excel file with date-based sheet management
   * - Skip if row is identical
   * - Update if only price fields changed
   * - Add new row for all other cases
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
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(this.filePath);

    // Check existing sheets for today's data
    let targetSheetName = todaySheetName;
    let ws = null;

    // Get all sheet names
    const existingSheets = wb.worksheets.map(s => s.name);
    console.log(`📄 Existing sheets: ${existingSheets.join(', ')}`);

    // Try to find a sheet with today's date
    let todaySheetExists = existingSheets.includes(todaySheetName);

    if (todaySheetExists) {
      // Use today's sheet
      ws = wb.getWorksheet(todaySheetName);
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

    // Read existing rows from sheet
    const existingRows = this.readExistingRows(ws);
    console.log(`📊 Found ${existingRows.length} existing rows in sheet`);

    // Format all product rows
    const productRows = products.map(p => this.formatProductRow(p));

    // Process each product row
    let updatedCount = 0;
    let addedCount = 0;
    const rowsToAdd = [];

    for (const newRow of productRows) {
      const asin = newRow[2]; // ASIN is at index 2
      const title = newRow[3]; // Title is at index 3 (for logging)

      // Find existing row with same ASIN (more reliable than title matching)
      const existingRow = existingRows.find(er => er.data[2] === asin);

      if (existingRow) {
        // Replace existing row with new data (ExcelJS uses 1-based row/col)
        const excelRow = ws.getRow(existingRow.rowIndex);
        for (let colIndex = 0; colIndex < newRow.length; colIndex++) {
          excelRow.getCell(colIndex + 1).value = newRow[colIndex];
        }
        excelRow.commit();
        updatedCount++;
        console.log(`   🔄 Updated (same ASIN): ${asin} - ${title.substring(0, 50)}...`);
      } else {
        // New product - add to list
        rowsToAdd.push(newRow);
        addedCount++;
        console.log(`   ➕ Added (new): ${asin} - ${title.substring(0, 50)}...`);
      }
    }

    // Append new rows if any
    if (rowsToAdd.length > 0) {
      // Get last row in target sheet
      let lastRow = ws.rowCount;

      // Start appending with blank row separator
      let startRow = lastRow >= 2 ? lastRow + 2 : 3; // +2 to skip blank row

      // Append to sheet
      for (let i = 0; i < rowsToAdd.length; i++) {
        const rowIndex = startRow + i;
        const excelRow = ws.getRow(rowIndex);
        for (let j = 0; j < rowsToAdd[i].length; j++) {
          excelRow.getCell(j + 1).value = rowsToAdd[i][j];
        }
        excelRow.commit();
      }
    }

    // Write back
    await wb.xlsx.writeFile(this.filePath);

    console.log(`\n✅ Excel update completed:`);
    console.log(`   🔄 Updated (same ASIN): ${updatedCount}`);
    console.log(`   ➕ Added (new): ${addedCount}`);
    console.log(`📝 Sheet: "${targetSheetName}"`);
    console.log(`📁 File: ${this.filePath}`);
  }

  /**
   * Get file stats (uses latest sheet in the workbook)
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
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(this.filePath);

      // Use the last sheet in the workbook (most recent date-based sheet)
      const worksheets = wb.worksheets;
      if (worksheets.length === 0) {
        return {
          exists: true,
          path: this.filePath,
          rows: 0,
          message: 'No sheets found in workbook',
        };
      }

      const lastSheet = worksheets[worksheets.length - 1];
      const lastSheetName = lastSheet.name;

      const totalRows = lastSheet.rowCount;
      const dataRows = Math.max(0, totalRows - 2); // Minus header + empty row

      return {
        exists: true,
        path: this.filePath,
        totalRows: totalRows,
        dataRows: dataRows,
        headers: this.headers.length,
        sheets: worksheets.length,
        latestSheet: lastSheetName,
        message: `File exists with ${dataRows} data rows in sheet "${lastSheetName}" (${worksheets.length} total sheets)`,
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
