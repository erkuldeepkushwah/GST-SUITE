import * as XLSX from 'xlsx';
import { FIRM_NAME, FIRM_TAGLINE, FIRM_LOCATION, REPORT_PASSWORD } from './branding';

export async function readExcelFile(file: File): Promise<XLSX.WorkBook> {
  const buffer = await file.arrayBuffer();
  return XLSX.read(buffer, { type: 'array', cellDates: true });
}

export function getSheetData<T = any>(wb: XLSX.WorkBook, sheetName: string, headerRow = 0): T[] {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<T>(sheet, { range: headerRow, raw: false, dateNF: 'yyyy-mm-dd' });
}

export function getRawSheetRows(wb: XLSX.WorkBook, sheetName: string): any[][] {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: false });
}

/**
 * Exports multiple tabular datasets into a professional multi-sheet Excel (.xlsx) file,
 * adding firm header rows and auto-fit column widths.
 */
export function exportToExcel(
  sheets: Record<string, any[]>,
  fileName: string,
  meta?: { gstin?: string; period?: string; title?: string; password?: string }
) {
  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();

  for (const [sheetName, data] of Object.entries(sheets)) {
    let ws: XLSX.WorkSheet;

    if (!data || data.length === 0) {
      ws = XLSX.utils.aoa_to_sheet([
        [`${FIRM_NAME} - ${FIRM_TAGLINE}`],
        [meta?.title || 'Reconciliation Report', `GSTIN: ${meta?.gstin || '-'}`, `Period: ${meta?.period || '-'}`],
        [`Status: Official Protected Audit Report - password required to edit (${FIRM_NAME})`],
        [],
        ['Info: No records found for this section.']
      ]);
    } else {
      // Build header rows with firm branding and protected audit stamp
      const headerRows: any[][] = [
        [`${FIRM_NAME} | ${FIRM_LOCATION}`],
        [`Report: ${sheetName}`, `Company GSTIN: ${meta?.gstin || '-'}`, `Period: ${meta?.period || '-'}`],
        [`Status: Official Protected Audit Report - password required to edit (${FIRM_NAME})`],
        []
      ];

      // Convert table objects
      const dataSheet = XLSX.utils.json_to_sheet(data);
      const dataRows = XLSX.utils.sheet_to_json(dataSheet, { header: 1 }) as any[][];
      const combined = [...headerRows, ...dataRows];
      ws = XLSX.utils.aoa_to_sheet(combined);
    }

    // Auto-fit column widths from the actual cell contents
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    const colWidths: Array<{ wch: number }> = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      let max = 10;
      for (let r = range.s.r; r <= range.e.r; r++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell && cell.v !== undefined && cell.v !== null) {
          max = Math.max(max, String(cell.v).length + 2);
        }
      }
      colWidths.push({ wch: Math.min(max, 45) });
    }
    ws['!cols'] = colWidths;

    // Apply worksheet security / protection (Excel read-only audit lock)
    ws['!protect'] = {
      password: meta?.password || REPORT_PASSWORD,
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatCells: false,
      formatColumns: false,
      formatRows: false,
      insertColumns: false,
      insertRows: false,
      insertHyperlinks: false,
      deleteColumns: false,
      deleteRows: false,
      sort: false,
      autoFilter: false,
      pivotTables: false
    };

    // Truncate to 31 chars (Excel limit) and keep names unique: two long
    // section names can otherwise collapse to the same name and throw.
    let validSheetName = sheetName.slice(0, 31).replace(/[:\\/?*\[\]]/g, '_');
    if (usedNames.has(validSheetName)) {
      let n = 2;
      while (usedNames.has(`${validSheetName.slice(0, 27)} (${n})`)) n++;
      validSheetName = `${validSheetName.slice(0, 27)} (${n})`;
    }
    usedNames.add(validSheetName);
    XLSX.utils.book_append_sheet(wb, ws, validSheetName);
  }

  XLSX.writeFile(wb, fileName.replace(/[\\/:*?"<>|]/g, '_'));
}

export function downloadCsv(data: any[], fileName: string) {
  const ws = XLSX.utils.json_to_sheet(data);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
