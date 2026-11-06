import * as XLSX from 'xlsx';
import { FIRM_NAME, FIRM_LOCATION, LOGO_PATH } from './branding';

/**
 * The firm logo is fetched once per page load and reused by every export.
 * A missing or blocked asset must never stop a report from downloading, so any
 * failure simply returns null and the sheets are written without a logo.
 */
let logoDataUrlPromise: Promise<string | null> | null = null;
function loadLogoDataUrl(): Promise<string | null> {
  if (!logoDataUrlPromise) {
    logoDataUrlPromise = (async () => {
      try {
        const res = await fetch(LOGO_PATH);
        if (!res.ok) return null;
        const blob = await res.blob();
        return await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => resolve('');
          reader.readAsDataURL(blob);
        });
      } catch {
        return null;
      }
    })();
  }
  return logoDataUrlPromise;
}

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
/**
 * Writes a multi-sheet report where only the branding and heading rows are locked.
 * Data cells stay unlocked, so the user can filter, sort, edit and pivot the same
 * sheet after downloading it. Protection is applied with a password, but every
 * editing operation that matters for analysis (filter, sort, format, insert and
 * delete rows/columns) is allowed.
 */
export async function exportToExcel(
  sheets: Record<string, any[]>,
  fileName: string,
  meta?: { gstin?: string; period?: string; title?: string; password?: string }
): Promise<void> {
  // Loaded on demand: the export library is only needed when a download is clicked.
  const mod: any = await import('exceljs');
  const ExcelJS = mod?.default ?? mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = FIRM_NAME;
  wb.created = new Date();

  const HEADER_ROWS = 3; // logo + firm name, report line, meta line -> heading lands on row 4
  const usedNames = new Set<string>();

  // Registered once per workbook; every sheet then places the same image.
  const logoDataUrl = await loadLogoDataUrl();
  let logoId: number | null = null;
  if (logoDataUrl) {
    try {
      logoId = wb.addImage({ base64: logoDataUrl, extension: 'png' });
    } catch {
      logoId = null;
    }
  }

  for (const [sheetName, data] of Object.entries(sheets)) {
    let validSheetName = sheetName.slice(0, 31).replace(/[:\\/?*\[\]]/g, '_');
    if (usedNames.has(validSheetName)) {
      let n = 2;
      while (usedNames.has(`${validSheetName.slice(0, 27)} (${n})`)) n++;
      validSheetName = `${validSheetName.slice(0, 27)} (${n})`;
    }
    usedNames.add(validSheetName);

    const ws = wb.addWorksheet(validSheetName, {
      views: [{ state: 'frozen', ySplit: HEADER_ROWS + 1 }],
    });

    const rows: Array<Record<string, any>> = data && data.length ? data : [{ Info: 'No records found for this section.' }];
    const columns: string[] = [];
    for (const r of rows) {
      for (const k of Object.keys(r || {})) if (!columns.includes(k)) columns.push(k);
    }
    if (!columns.length) columns.push('Info');

    // --- fixed branding block (rows 1-3, locked) ---
    // The logo sits in A1 and spans rows 1-3; the text starts in B so the two
    // never overlap. Sheet protection locks the picture (objects="1"), so it
    // cannot be dragged, resized or deleted after the report is shared.
    if (logoId !== null) {
      ws.addImage(logoId, {
        tl: { col: 0, row: 0 },
        ext: { width: 56, height: 56 },
        editAs: 'oneCell',
      });
    }
    ws.getRow(1).height = 30;
    ws.getRow(2).height = 18;
    ws.getRow(3).height = 18;

    const textCol = logoId !== null ? 2 : 1;
    const brand = ws.getRow(1).getCell(textCol);
    brand.value = `${FIRM_NAME} | ${FIRM_LOCATION}`;
    brand.font = { bold: true, size: 12, color: { argb: 'FF1F3A5F' } };

    const reportCell = ws.getRow(2).getCell(textCol);
    reportCell.value = `Report: ${sheetName}`;
    reportCell.font = { bold: true, size: 10, color: { argb: 'FF1F3A5F' } };

    const metaCell = ws.getRow(3).getCell(textCol);
    metaCell.value = `Company GSTIN: ${meta?.gstin || '-'}   |   Period: ${meta?.period || '-'}`;
    metaCell.font = { size: 10, color: { argb: 'FF5B6675' } };

    // --- locked heading row ---
    const headerRow = ws.getRow(HEADER_ROWS + 1);
    columns.forEach((c, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = c;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFD0D7E2' } } };
      cell.protection = { locked: true };
    });
    headerRow.commit();

    // --- data rows: unlocked, so the sheet stays usable ---
    rows.forEach((r, ri) => {
      const row = ws.getRow(HEADER_ROWS + 2 + ri);
      columns.forEach((c, ci) => {
        const v = (r || {})[c];
        const cell = row.getCell(ci + 1);
        cell.value = v === undefined || v === null ? '' : v;
        if (typeof v === 'number') {
          cell.numFmt = Number.isInteger(v) ? '#,##0' : '#,##0.00';
        }
        cell.alignment = { vertical: 'top' };
        cell.protection = { locked: false };
      });
      row.commit();
    });

    // Filter dropdowns on the heading row, covering the data range
    ws.autoFilter = {
      from: { row: HEADER_ROWS + 1, column: 1 },
      to: { row: HEADER_ROWS + 1 + rows.length, column: columns.length },
    };

    columns.forEach((c, i) => {
      let max = Math.max(10, String(c).length + 2);
      for (const r of rows) {
        const v = (r || {})[c];
        if (v !== undefined && v !== null) max = Math.max(max, String(v).length + 2);
      }
      ws.getColumn(i + 1).width = Math.min(max, 45);
    });

    // Keep column A wide enough for the 56px logo once auto-fit has run.
    if (logoId !== null) {
      ws.getColumn(1).width = Math.max(Number(ws.getColumn(1).width) || 0, 10);
    }

    // Sheet protection: the heading rows stay fixed, everything else stays workable.
    // In this library the option flags mean "allow", so every analysis action the
    // user needs - filtering, sorting, formatting, inserting/deleting rows - is on.
    await ws.protect(meta?.password || undefined, {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatCells: true,
      formatColumns: true,
      formatRows: true,
      insertColumns: true,
      insertRows: true,
      insertHyperlinks: true,
      deleteColumns: true,
      deleteRows: true,
      sort: true,
      autoFilter: true,
      pivotTables: true,
      // In exceljs these two are inverted: false writes objects="1", which locks
      // the logo in place. Everything else above stays allowed.
      objects: false,
      scenarios: false,
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.replace(/[\\/:*?"<>|]/g, '_');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
