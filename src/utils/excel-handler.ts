import ExcelJS from 'exceljs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { EnrichedProduct } from '../types/index.js';

type CompareResult = 'identical' | 'price-only' | 'different';

interface ExcelStats {
  exists: boolean;
  path: string;
  rows?: number;
  message: string;
  totalRows?: number;
  dataRows?: number;
  headers?: number;
  sheets?: number;
  latestSheet?: string;
  error?: string;
}

class ExcelHandler {
  private readonly filePath: string;
  private readonly sheetName: string;
  private readonly headers: string[];
  private readonly headerStyle: {
    fill: ExcelJS.Fill;
    font: Partial<ExcelJS.Font>;
    alignment: Partial<ExcelJS.Alignment>;
    border: Partial<ExcelJS.Borders>;
  };

  constructor(filePath = './output/tracker_outcome.xlsx') {
    this.filePath = filePath;
    this.sheetName = 'Prodotti';

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

    this.headerStyle = {
      fill: {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFF00' },
      } as ExcelJS.Fill,
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

  private async fileExists(): Promise<boolean> {
    try {
      await fs.access(this.filePath);
      return true;
    } catch {
      return false;
    }
  }

  private applyHeaderStyle(ws: ExcelJS.Worksheet): void {
    const headerRow = ws.getRow(1);
    headerRow.eachCell(cell => {
      cell.fill = this.headerStyle.fill;
      cell.font = this.headerStyle.font;
      cell.alignment = this.headerStyle.alignment;
      cell.border = this.headerStyle.border;
    });
    ws.columns.forEach(col => {
      col.width = 32;
    });
  }

  private async createNewFile(sheetName?: string): Promise<ExcelJS.Worksheet> {
    if (!sheetName) {
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, '0');
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const yyyy = now.getFullYear();
      sheetName = `${dd}-${mm}-${yyyy}`;
    }

    console.log(`📝 Creating new Excel file: ${this.filePath}`);
    console.log(`📄 First sheet: ${sheetName}`);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(sheetName);

    ws.addRow(this.headers);
    ws.addRow([]);
    this.applyHeaderStyle(ws);

    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    await wb.xlsx.writeFile(this.filePath);
    console.log(`✅ Excel file created with sheet: "${sheetName}"`);

    return ws;
  }

  private formatProductRow(product: EnrichedProduct): (string | number)[] {
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

    let discountAmount: string | number = '';
    if (product.keepaAvgPrice && product.keepaCurrentPrice) {
      discountAmount = (product.keepaAvgPrice - product.keepaCurrentPrice).toFixed(2);
    }

    return [
      dateString,
      product.category ?? '',
      product.asin ?? '',
      product.title ?? '',
      product.keepaAvgPrice ?? product.originalPrice ?? '',
      product.price ?? product.keepaCurrentPrice ?? '',
      (discountAmount || product.discountAmount) ?? '',
      product.keepaDiscount ?? product.discountPercentage ?? '',
      product.currency ?? '',
      product.availability?.message ?? '',
      product.availability?.type ?? '',
      product.rating ?? product.keepaRating ?? '',
      product.ratingCount ?? product.keepaReviewCount ?? '',
      product.features ? product.features.join('; ') : '',
      product.image?.small ?? '',
      product.image?.large ?? '',
      product.affiliateLinks?.web ?? '',
      product.affiliateLinks?.storefront ?? '',
      product.parentASIN ?? '',
      product.marketplace ?? '',
    ];
  }

  private getOrCreateSheet(wb: ExcelJS.Workbook, sheetName: string): ExcelJS.Worksheet {
    let ws = wb.getWorksheet(sheetName) as ExcelJS.Worksheet | undefined;

    if (!ws) {
      ws = wb.addWorksheet(sheetName);
      ws.addRow(this.headers);
      ws.addRow([]);
      this.applyHeaderStyle(ws);
    }

    return ws;
  }

  compareProductRows(row1: (string | number)[], row2: (string | number)[]): CompareResult {
    if (row1[2] !== row2[2]) {
      return 'different';
    }

    let allIdentical = true;
    let onlyPriceDifferent = true;
    const priceIndices = [4, 5, 6, 7];

    for (let i = 0; i < row1.length; i++) {
      if (i === 0) continue;

      const val1 = row1[i] == null ? '' : String(row1[i]);
      const val2 = row2[i] == null ? '' : String(row2[i]);

      if (val1 !== val2) {
        allIdentical = false;
        if (!priceIndices.includes(i)) {
          onlyPriceDifferent = false;
        }
      }
    }

    if (allIdentical) return 'identical';
    if (onlyPriceDifferent) return 'price-only';
    return 'different';
  }

  private readExistingRows(
    ws: ExcelJS.Worksheet
  ): { rowIndex: number; data: (string | number)[] }[] {
    const existingRows: { rowIndex: number; data: (string | number)[] }[] = [];
    const rowCount = ws.rowCount;
    const colCount = ws.columnCount;

    if (rowCount < 3) return existingRows;

    for (let rowIndex = 3; rowIndex <= rowCount; rowIndex++) {
      const excelRow = ws.getRow(rowIndex);
      const row: (string | number)[] = [];
      let hasData = false;

      for (let colIndex = 1; colIndex <= colCount; colIndex++) {
        const value = excelRow.getCell(colIndex).value;
        const val = value != null ? (value as string | number) : '';
        row.push(val);
        if (val !== '') hasData = true;
      }

      if (hasData) existingRows.push({ rowIndex, data: row });
    }

    return existingRows;
  }

  async appendProducts(products: EnrichedProduct[]): Promise<void> {
    console.log(`\n💾 Writing ${products.length} products to Excel...\n`);

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
      await this.createNewFile(todaySheetName);
    }

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(this.filePath);

    const existingSheets = wb.worksheets.map(s => s.name);
    console.log(`📄 Existing sheets: ${existingSheets.join(', ')}`);

    const todaySheetExists = existingSheets.includes(todaySheetName);
    let ws: ExcelJS.Worksheet;
    let targetSheetName: string;

    if (todaySheetExists) {
      ws = wb.getWorksheet(todaySheetName) as ExcelJS.Worksheet;
      targetSheetName = todaySheetName;
      console.log(`📅 Found sheet for today (${todayDateString}), appending to: ${todaySheetName}`);
    } else {
      console.log(`📅 No sheet found for today (${todayDateString})`);
      console.log(`📄 Creating new sheet: ${todaySheetName}`);
      ws = this.getOrCreateSheet(wb, todaySheetName);
      targetSheetName = todaySheetName;
    }

    const existingRows = this.readExistingRows(ws);
    console.log(`📊 Found ${existingRows.length} existing rows in sheet`);

    const productRows = products.map(p => this.formatProductRow(p));

    let updatedCount = 0;
    let addedCount = 0;
    const rowsToAdd: (string | number)[][] = [];

    for (const newRow of productRows) {
      const asin = newRow[2];
      const title = String(newRow[3]);

      const existingRow = existingRows.find(er => er.data[2] === asin);

      if (existingRow) {
        const excelRow = ws.getRow(existingRow.rowIndex);
        for (let colIndex = 0; colIndex < newRow.length; colIndex++) {
          excelRow.getCell(colIndex + 1).value = newRow[colIndex];
        }
        excelRow.commit();
        updatedCount++;
        console.log(`   🔄 Updated (same ASIN): ${asin} - ${title.substring(0, 50)}...`);
      } else {
        rowsToAdd.push(newRow);
        addedCount++;
        console.log(`   ➕ Added (new): ${asin} - ${title.substring(0, 50)}...`);
      }
    }

    if (rowsToAdd.length > 0) {
      const lastRow = ws.rowCount;
      const startRow = lastRow >= 2 ? lastRow + 2 : 3;

      for (let i = 0; i < rowsToAdd.length; i++) {
        const rowIndex = startRow + i;
        const excelRow = ws.getRow(rowIndex);
        for (let j = 0; j < rowsToAdd[i].length; j++) {
          excelRow.getCell(j + 1).value = rowsToAdd[i][j];
        }
        excelRow.commit();
      }
    }

    await wb.xlsx.writeFile(this.filePath);

    console.log(`\n✅ Excel update completed:`);
    console.log(`   🔄 Updated (same ASIN): ${updatedCount}`);
    console.log(`   ➕ Added (new): ${addedCount}`);
    console.log(`📝 Sheet: "${targetSheetName}"`);
    console.log(`📁 File: ${this.filePath}`);
  }

  async getStats(): Promise<ExcelStats> {
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
      const totalRows = lastSheet.rowCount;
      const dataRows = Math.max(0, totalRows - 2);

      return {
        exists: true,
        path: this.filePath,
        totalRows,
        dataRows,
        headers: this.headers.length,
        sheets: worksheets.length,
        latestSheet: lastSheet.name,
        message: `File exists with ${dataRows} data rows in sheet "${lastSheet.name}" (${worksheets.length} total sheets)`,
      };
    } catch (error) {
      return {
        exists: true,
        path: this.filePath,
        error: (error as Error).message,
        message: 'Error reading file stats',
      };
    }
  }
}

export const excelHandler = new ExcelHandler();
