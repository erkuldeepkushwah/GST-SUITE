import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FIRM_NAME, FIRM_TAGLINE } from './branding';

export interface PdfOptions {
  title?: string;
  gstin?: string;
  period?: string;
  landscape?: boolean;
}

function cellText(value: any): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') {
    return value.toLocaleString('en-IN', {
      minimumFractionDigits: value % 1 !== 0 ? 2 : 0,
      maximumFractionDigits: 2,
    });
  }
  return String(value);
}

/** Builds the PDF document; kept separate from downloadPdf so it can be tested. */
export function buildPdf(data: Array<Record<string, any>>, options: PdfOptions = {}): jsPDF {
  const rows = Array.isArray(data) ? data.filter(Boolean) : [];
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of rows.slice(0, 100)) {
    for (const key of Object.keys(row || {})) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }

  const doc = new jsPDF({ orientation: options.landscape === false ? 'portrait' : 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(13);
  doc.setTextColor(31, 58, 95);
  doc.text(options.title || 'Report', 40, 42);

  doc.setFontSize(8);
  doc.setTextColor(90, 100, 115);
  const subtitleParts = [FIRM_NAME];
  if (options.gstin) subtitleParts.push(`GSTIN: ${options.gstin}`);
  if (options.period) subtitleParts.push(`Period: ${options.period}`);
  subtitleParts.push(`Generated: ${new Date().toLocaleString('en-IN')}`);
  doc.text(subtitleParts.join('   |   '), 40, 58);

  doc.setFontSize(7);
  doc.text(FIRM_TAGLINE, 40, 70);

  autoTable(doc, {
    head: [columns],
    body: rows.map((row) => columns.map((col) => cellText(row[col]))),
    startY: 80,
    margin: { left: 30, right: 30 },
    styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak', textColor: [38, 39, 48] },
    headStyles: { fillColor: [31, 58, 95], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [244, 246, 249] },
    didDrawPage: () => {
      const pageNo = doc.getNumberOfPages();
      doc.setFontSize(7);
      doc.setTextColor(120, 128, 140);
      doc.text(
        `${FIRM_NAME} - ${options.title || 'Report'}   |   Page ${pageNo}`,
        pageWidth - 30,
        doc.internal.pageSize.getHeight() - 20,
        { align: 'right' }
      );
    },
  });

  return doc;
}

export function downloadPdf(data: Array<Record<string, any>>, fileName: string, options: PdfOptions = {}) {
  const doc = buildPdf(data, options);
  doc.save(fileName.replace(/[\\/:*?"<>|]/g, '_'));
}
