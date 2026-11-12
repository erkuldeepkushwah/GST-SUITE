import { Gstr1RecoResult } from '../types';
import { asDate, tryDate } from './periodManager';
import { readExcelFile, getSheetData, getRawSheetRows } from './excelEngine';

export interface Gstr1PortalFile {
  name: string;
  fp: string;
  returnPeriod: string;
  b2b: any[];
  cdnr: any[];
  b2cs: any[];
  b2cl?: any[];
  hsn: any[];
  netTaxable: number;
  igst: number;
  cgst: number;
  sgst: number;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fyLabelFromDate(d: Date): string {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String(y + 1).slice(-2)}`;
}

export async function parseGstr1JsonFile(file: File): Promise<Gstr1PortalFile> {
  if (!file.name.toLowerCase().endsWith('.json')) {
    throw new Error(`File format error: "${file.name}" is not a JSON file. GSTR-1 Portal returns must be .json files downloaded directly from the GST Portal. (फ़ाइल त्रुटि: GSTR-1 पोर्टल रिटर्न .json फ़ाइल में होना चाहिए)।`);
  }

  let text: string;
  let d: any;
  try {
    text = await file.text();
    d = JSON.parse(text);
  } catch {
    throw new Error(`File corrupted: "${file.name}" is not valid JSON. Please re-download the return from the GST Portal. (फ़ाइल त्रुटि: अमान्य JSON फ़ाइल)।`);
  }

  if (!d || (!d.b2b && !d.cdnr && !d.b2cs && !d.hsn && !d.fp)) {
    throw new Error(`Invalid GSTR-1 file: "${file.name}" does not contain GSTR-1 portal return structures. Please upload official GSTR-1 JSON files. (फ़ाइल त्रुटि: यह मान्य GSTR-1 रिटर्न नहीं है)।`);
  }

  const fp = String(d.fp || '');
  let returnPeriod = fp;
  if (fp.length === 6) {
    const mo = parseInt(fp.slice(0, 2), 10);
    const yr = parseInt(fp.slice(2), 10);
    returnPeriod = `${MONTH_NAMES[mo - 1]}-${yr}`;
  }

  const b2b: any[] = [];
  const cdnr: any[] = [];
  const b2cs: any[] = [];
  const hsn: any[] = [];

  let igst = 0, cgst = 0, sgst = 0, b2bTaxable = 0, cdnTaxable = 0;

  for (const r of d.b2b || []) {
    for (const inv of r.inv || []) {
      const itms = inv.itms || [];
      const txval = itms.reduce((s: number, it: any) => s + (parseFloat(it.itm_det?.txval) || 0), 0);
      const iamt = itms.reduce((s: number, it: any) => s + (parseFloat(it.itm_det?.iamt) || 0), 0);
      const camt = itms.reduce((s: number, it: any) => s + (parseFloat(it.itm_det?.camt) || 0), 0);
      const samt = itms.reduce((s: number, it: any) => s + (parseFloat(it.itm_det?.samt) || 0), 0);

      igst += iamt;
      cgst += camt;
      sgst += samt;
      b2bTaxable += txval;

      b2b.push({
        GSTIN: String(r.ctin || '').toUpperCase(),
        'Invoice No': String(inv.inum || '').trim(),
        Date: inv.idt || '',
        'Invoice Value': parseFloat(inv.val || 0),
        POS: String(inv.pos || ''),
        Rate: itms.map((it: any) => it.itm_det?.rt || 0).join(','),
        Taxable: txval,
        Tax: iamt + camt + samt,
        ReturnPeriod: returnPeriod,
      });
    }
  }

  for (const r of d.cdnr || []) {
    for (const n of r.nt || []) {
      const itms = n.itms || [];
      const txval = itms.reduce((s: number, it: any) => s + (parseFloat(it.itm_det?.txval) || 0), 0);
      const iamt = itms.reduce((s: number, it: any) => s + (parseFloat(it.itm_det?.iamt) || 0), 0);
      const camt = itms.reduce((s: number, it: any) => s + (parseFloat(it.itm_det?.camt) || 0), 0);
      const samt = itms.reduce((s: number, it: any) => s + (parseFloat(it.itm_det?.samt) || 0), 0);

      // A credit note (C) reduces the outward liability, a debit note (D) adds to
      // it. Netting both with a minus sign understated every DN in the return.
      const noteSign = String(n.ntty || '').toUpperCase() === 'D' ? 1 : -1;
      igst += noteSign * iamt;
      cgst += noteSign * camt;
      sgst += noteSign * samt;
      cdnTaxable += noteSign * txval;

      cdnr.push({
        GSTIN: String(r.ctin || '').toUpperCase(),
        'Invoice No': String(n.nt_num || '').trim(),
        Date: n.nt_dt || '',
        'Invoice Value': parseFloat(n.val || 0),
        POS: String(n.pos || ''),
        Type: n.ntty || '',
        Rate: itms.map((it: any) => it.itm_det?.rt || 0).join(','),
        Taxable: txval,
        Tax: iamt + camt + samt,
        ReturnPeriod: returnPeriod,
      });
    }
  }

  for (const x of d.b2cs || []) {
    const txval = parseFloat(x.txval || 0);
    const iamt = parseFloat(x.iamt || 0);
    const camt = parseFloat(x.camt || 0);
    const samt = parseFloat(x.samt || 0);
    igst += iamt;
    cgst += camt;
    sgst += samt;

    b2cs.push({
      POS: String(x.pos || ''),
      Rate: parseFloat(x.rt || 0),
      Type: String(x.typ || ''),
      Taxable: txval,
      Tax: iamt + camt + samt,
    });
  }

  // B2C large (inter-state invoices above the threshold) lives in its own
  // section of the return. It was never read, so the taxable value and tax on
  // the dashboard and the 3B tie-out were short by the whole B2CL turnover.
  const b2cl: any[] = [];
  let b2clTaxable = 0;
  for (const r of d.b2cl || []) {
    for (const inv of r.inv || []) {
      const itms = inv.itms || [];
      const txval = itms.reduce((s: number, it: any) => s + (parseFloat(it.itm_det?.txval) || 0), 0);
      const iamt = itms.reduce((s: number, it: any) => s + (parseFloat(it.itm_det?.iamt) || 0), 0);
      const camt = itms.reduce((s: number, it: any) => s + (parseFloat(it.itm_det?.camt) || 0), 0);
      const samt = itms.reduce((s: number, it: any) => s + (parseFloat(it.itm_det?.samt) || 0), 0);

      igst += iamt;
      cgst += camt;
      sgst += samt;
      b2clTaxable += txval;

      const row = {
        POS: String(inv.pos || r.pos || ''),
        Rate: itms.map((it: any) => it.itm_det?.rt || 0).join(','),
        Type: 'B2CL',
        Taxable: txval,
        Tax: iamt + camt + samt,
        ReturnPeriod: returnPeriod,
      };
      b2cl.push(row);
    }
  }

  // The HSN summary is "hsn": {"data": [...]} in the portal JSON; the older
  // hsn_b2b / hsn_b2c split is kept as a fallback, and a bare array is accepted
  // too. Reading only the old keys left the HSN tab empty for every portal file.
  const hsnSource: any[] = Array.isArray(d.hsn)
    ? d.hsn
    : [
        ...(Array.isArray(d.hsn?.data) ? d.hsn.data : []),
        ...(Array.isArray(d.hsn?.hsn_b2b) ? d.hsn.hsn_b2b : []),
        ...(Array.isArray(d.hsn?.hsn_b2c) ? d.hsn.hsn_b2c : []),
      ];
  for (const h of hsnSource) {
    const txval = parseFloat(h.txval) || 0;
    const tax = (parseFloat(h.iamt) || 0) + (parseFloat(h.camt) || 0) + (parseFloat(h.samt) || 0) + (parseFloat(h.csamt) || 0);
    if (txval === 0 && tax === 0) continue;
    hsn.push({
      HSN: String(h.hsn_sc || '').trim(),
      UQC: String(h.uqc || ''),
      Qty: parseFloat(h.qty) || 0,
      Rate: parseFloat(h.rt) || 0,
      Taxable: txval,
      Tax: tax,
    });
  }

  const b2csTaxable = b2cs.reduce((s, x) => s + (parseFloat(x.Taxable) || 0), 0);
  // b2csTaxable covers the B2C small bucket only; B2CL is added separately.
  const netTaxable = b2bTaxable + b2csTaxable + b2clTaxable + cdnTaxable;

  return {
    name: file.name,
    fp,
    returnPeriod,
    b2b,
    cdnr,
    b2cs,
    b2cl,
    hsn,
    netTaxable: Math.round(netTaxable * 100) / 100,
    igst: Math.round(igst * 100) / 100,
    cgst: Math.round(cgst * 100) / 100,
    sgst: Math.round(sgst * 100) / 100,
  };
}

export async function parseBooksGstr1File(file: File): Promise<{ b2b: any[]; cdnr: any[]; b2cs: any[]; hsn: any[] }> {
  const wb = await readExcelFile(file);

  const b2b: any[] = [];
  const cdnr: any[] = [];
  const b2cs: any[] = [];
  const hsn: any[] = [];

  // The header row of a Tally/ERP GSTR-1 export is not always the fourth row:
  // every template has its own title block. Reading a fixed row 3 turned a good
  // file into "no B2B/CDNR sheets recognized", so the header is now located by
  // its own column names.
  const readTable = (sheetName: string, keywords: string[]): any[] => {
    const raw = getRawSheetRows(wb, sheetName);
    for (let i = 0; i < Math.min(20, raw.length); i++) {
      const line = raw[i];
      if (!Array.isArray(line)) continue;
      const cells = line.map(c => String(c ?? '').trim().toLowerCase());
      // A title row such as "Tally HSN" must not be mistaken for the header:
      // require a real header (several filled cells) that carries every keyword.
      const filled = cells.filter(c => c !== '').length;
      const hit = filled >= 3 && keywords.every(k => cells.some(c => c !== '' && (c === k || c.includes(k))));
      if (hit) return getSheetData(wb, sheetName, i);
    }
    return [];
  };

  // Column names differ between Tally, Busy and ERP exports ("Invoice Number"
  // vs "Invoice No."), so a cell is looked up by a normalised name match instead
  // of one exact spelling.
  const norm = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const pick = (row: any, names: string[]): any => {
    const keys = Object.keys(row);
    for (const n of names) {
      const k = keys.find(k => norm(k) === norm(n));
      if (k !== undefined) return row[k];
    }
    for (const n of names) {
      if (norm(n).length < 4) continue;
      const k = keys.find(k => norm(k).includes(norm(n)));
      if (k !== undefined) return row[k];
    }
    return undefined;
  };
  const num = (v: any) => parseFloat(String(v ?? '').replace(/,/g, '')) || 0;
  const taxFromColumns = (row: any) =>
    num(pick(row, ['Integrated Tax Amount', 'IGST Amount', 'IGST'])) +
    num(pick(row, ['Central Tax Amount', 'CGST Amount', 'CGST'])) +
    num(pick(row, ['State Tax Amount', 'SGST Amount', 'SGST'])) +
    num(pick(row, ['Cess Amount', 'Cess']));

  for (const sheetName of wb.SheetNames) {
    const sNameNorm = sheetName.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (sNameNorm.includes('b2b') && !sNameNorm.includes('hsn')) {
      const data = readTable(sheetName, ['invoice', 'gstin']);
      for (const row of data) {
        const invNo = pick(row, ['Invoice Number', 'Invoice No']);
        const gstin = pick(row, ['GSTIN/UIN of Recipient', 'GSTIN of Recipient', 'Recipient GSTIN', 'GSTIN/UIN']);
        if (!invNo || !gstin) continue;

        const taxable = num(pick(row, ['Taxable Value', 'Taxable Amount']));
        const rate = num(pick(row, ['Rate', 'Tax Rate']));
        // Use the tax columns when the export has them; only fall back to
        // taxable x rate when it does not.
        const taxFromCols = taxFromColumns(row);
        b2b.push({
          GSTIN: String(gstin).trim().toUpperCase(),
          'Invoice No': String(invNo).trim(),
          Date: pick(row, ['Invoice date', 'Invoice Date', 'Date']) || '',
          'Invoice Value': num(pick(row, ['Invoice Value', 'Invoice Amount'])),
          POS: String(pick(row, ['Place Of Supply', 'Place of Supply', 'POS']) || ''),
          Rate: String(rate),
          Taxable: taxable,
          Tax: taxFromCols > 0 ? taxFromCols : (taxable * rate) / 100,
          BooksFile: file.name,
        });
      }
    } else if (sNameNorm.includes('hsn')) {
      const data = readTable(sheetName, ['hsn', 'taxable']);
      for (const row of data) {
        const code = String(pick(row, ['HSN', 'HSN/SAC', 'HSN Code']) || '').trim();
        if (!code) continue;
        hsn.push({
          HSN: code,
          UQC: String(pick(row, ['UQC', 'Unit']) || ''),
          Qty: num(pick(row, ['Total Quantity', 'Quantity', 'Qty'])),
          Rate: num(pick(row, ['Rate'])),
          Taxable: num(pick(row, ['Taxable Value', 'Taxable Amount'])),
          Tax: taxFromColumns(row),
          BooksFile: file.name,
        });
      }
    } else if (sNameNorm.includes('cdnr')) {
      const data = readTable(sheetName, ['note', 'gstin']);
      for (const row of data) {
        const noteNo = pick(row, ['Note Number', 'Note No', 'Note/Voucher Number']);
        const gstin = pick(row, ['GSTIN/UIN of Recipient', 'GSTIN of Recipient', 'Recipient GSTIN', 'GSTIN/UIN']);
        if (!noteNo || !gstin) continue;

        const taxable = num(pick(row, ['Taxable Value', 'Taxable Amount']));
        const rate = num(pick(row, ['Rate', 'Tax Rate']));
        const taxFromCols = taxFromColumns(row);
        cdnr.push({
          GSTIN: String(gstin).trim().toUpperCase(),
          'Invoice No': String(noteNo).trim(),
          Date: pick(row, ['Note Date', 'Note date', 'Date']) || '',
          'Invoice Value': num(pick(row, ['Note Value', 'Note Amount'])),
          POS: String(pick(row, ['Place Of Supply', 'Place of Supply', 'POS']) || ''),
          Type: String(pick(row, ['Note Type', 'Document Type']) || ''),
          Rate: String(rate),
          Taxable: taxable,
          Tax: taxFromCols > 0 ? taxFromCols : (taxable * rate) / 100,
          BooksFile: file.name,
        });
      }
    }
  }

  if (b2b.length === 0 && cdnr.length === 0 && b2cs.length === 0 && hsn.length === 0) {
    throw new Error(`No sales or B2B/CDNR sheets recognized in Books file "${file.name}". Please ensure standard Tally/ERP GSTR-1 sales sheets (e.g. B2B, CDNR) with Invoice Number and Recipient GSTIN are present. (फ़ाइल त्रुटि: मान्य सेल्स / B2B शीट नहीं मिली)।`);
  }

  return { b2b, cdnr, b2cs, hsn };
}

export function runGstr1MultiReconciliation(
  portalFiles: Gstr1PortalFile[],
  booksFiles: { b2b: any[]; cdnr: any[]; b2cs: any[]; hsn: any[] }[],
  startDate: string,
  endDate: string,
  threeBRows: Array<{ 'Return Period': string; Taxable: number; IGST: number; CGST: number; SGST: number }> = [],
  tolerance = 1.0
): Gstr1RecoResult {
  const start = asDate(startDate);
  start.setHours(0, 0, 0, 0);
  const end = asDate(endDate);
  end.setHours(23, 59, 59, 999);
  // Rows with an unreadable/blank date stay in the run rather than silently vanishing.
  const inPeriod = (v: any): boolean => {
    const d = tryDate(v);
    if (!d) return true;
    return d >= start && d <= end;
  };

  // Return-month window, used for B2CS / HSN / month-wise (3B tie-out) rows
  const startMo = start.getFullYear() * 12 + start.getMonth() + 1;
  const endMo = end.getFullYear() * 12 + end.getMonth() + 1;
  const fpInPeriod = (fp: any): boolean => {
    const m = String(fp || '').trim();
    if (!/^\d{6}$/.test(m)) return true; // unknown return period: keep the data visible
    const mon = parseInt(m.slice(0, 2), 10);
    const yr = parseInt(m.slice(2), 10);
    if (mon < 1 || mon > 12) return true;
    const idx = yr * 12 + mon;
    return idx >= startMo && idx <= endMo;
  };

  // Combine Portal files
  const pB2b: any[] = [];
  const pCdnr: any[] = [];
  const pB2cs: any[] = [];
  const pHsn: any[] = [];
  const portalSummaryRows: any[] = [];

  for (const pf of portalFiles) {
    const fpOk = fpInPeriod(pf.fp);
    portalSummaryRows.push({
      File: pf.name,
      'Return Period': pf.returnPeriod,
      'In Period': fpOk ? 'Yes' : 'No',
      'Net Taxable (portal)': pf.netTaxable,
      IGST: pf.igst,
      CGST: pf.cgst,
      SGST: pf.sgst,
    });

    for (const b of pf.b2b) {
      if (inPeriod(b.Date)) {
        pB2b.push(b);
      }
    }
    for (const c of pf.cdnr) {
      if (inPeriod(c.Date)) {
        pCdnr.push(c);
      }
    }
    // B2CS and HSN are rate/summary level: they belong to the file's return month
    if (fpOk) {
      for (const x of pf.b2cs || []) pB2cs.push(x);
      for (const x of pf.b2cl || []) pB2cs.push(x);
      for (const h of pf.hsn || []) pHsn.push(h);
    }
  }

  // Combine Books files
  const bB2b: any[] = [];
  const bCdnr: any[] = [];
  const bHsn: any[] = [];
  for (const bf of booksFiles) {
    for (const h of bf.hsn || []) bHsn.push(h);
    for (const b of bf.b2b) {
      if (inPeriod(b.Date)) {
        bB2b.push(b);
      }
    }
    for (const c of bf.cdnr) {
      if (inPeriod(c.Date)) {
        bCdnr.push(c);
      }
    }
  }

  // Reconcile B2B
  const b2bReco = matchGstr1Section(pB2b, bB2b, tolerance);
  const cdnrReco = matchGstr1Section(pCdnr, bCdnr, tolerance);
  const hsnReco = matchHsnSection(pHsn, bHsn, tolerance);

  // Dashboard table
  const b2bMatched = b2bReco.filter(r => r.Status === 'Matched');
  const b2bMismatch = b2bReco.filter(r => r.Status === 'Mismatch');
  const b2bOnlyPortal = b2bReco.filter(r => r.Status === 'Only in Portal');
  const b2bOnlyBooks = b2bReco.filter(r => r.Status === 'Only in Books');
  const b2bPossibleMismatch = b2bReco.filter(r => r.Status === 'Possible mismatch');

  const dashboard = [
    { Section: 'B2B', Status: 'Matched', Count: b2bMatched.length, 'Taxable (Portal)': sum(b2bMatched, 'Taxable_Portal'), 'Taxable (Books)': sum(b2bMatched, 'Taxable_Books') },
    { Section: 'B2B', Status: 'Possible mismatch', Count: b2bPossibleMismatch.length, 'Taxable (Portal)': sum(b2bPossibleMismatch, 'Taxable_Portal'), 'Taxable (Books)': sum(b2bPossibleMismatch, 'Taxable_Books') },
    { Section: 'B2B', Status: 'Mismatch', Count: b2bMismatch.length, 'Taxable (Portal)': sum(b2bMismatch, 'Taxable_Portal'), 'Taxable (Books)': sum(b2bMismatch, 'Taxable_Books') },
    { Section: 'B2B', Status: 'Only in Portal', Count: b2bOnlyPortal.length, 'Taxable (Portal)': sum(b2bOnlyPortal, 'Taxable_Portal'), 'Taxable (Books)': 0 },
    { Section: 'B2B', Status: 'Only in Books', Count: b2bOnlyBooks.length, 'Taxable (Portal)': 0, 'Taxable (Books)': sum(b2bOnlyBooks, 'Taxable_Books') },
  ];

  // CDNR was reconciled but never reached the dashboard, so notes never showed
  // up in the KPI strip or the overview table.
  for (const st of ['Matched', 'Possible mismatch', 'Mismatch', 'Only in Portal', 'Only in Books']) {
    const list = cdnrReco.filter(r => r.Status === st);
    dashboard.push({
      Section: 'CDNR',
      Status: st,
      Count: list.length,
      'Taxable (Portal)': sum(list, 'Taxable_Portal'),
      'Taxable (Books)': sum(list, 'Taxable_Books'),
    });
  }

  for (const st of ['Matched', 'Possible mismatch', 'Mismatch', 'Only in Portal', 'Only in Books']) {
    const list = hsnReco.filter(r => r.Status === st);
    dashboard.push({
      Section: 'HSN',
      Status: st,
      Count: list.length,
      'Taxable (Portal)': sum(list, 'Taxable (Portal)'),
      'Taxable (Books)': sum(list, 'Taxable (Books)'),
    });
  }

  // Month-wise table
  const monthMap = new Map<string, any>();
  for (const pf of portalFiles) {
    if (!fpInPeriod(pf.fp)) continue;
    if (!monthMap.has(pf.returnPeriod)) {
      monthMap.set(pf.returnPeriod, {
        Month: pf.returnPeriod,
        'Net Taxable': 0,
        IGST: 0,
        CGST: 0,
        SGST: 0,
        'Total Tax': 0,
      });
    }
    const item = monthMap.get(pf.returnPeriod);
    item['Net Taxable'] += pf.netTaxable;
    item.IGST += pf.igst;
    item.CGST += pf.cgst;
    item.SGST += pf.sgst;
    item['Total Tax'] += (pf.igst + pf.cgst + pf.sgst);
  }
  const monthWise = Array.from(monthMap.values());

  // 3B Tie-out table. The 3B grid is typed by hand, so "Apr-2026", "apr 2026",
  // "042026" and "2026-04" all have to land on the same month; an exact string
  // compare showed a full difference for a month that was actually entered.
  const threeBByMonth = new Map<string, { Taxable: number; IGST: number; CGST: number; SGST: number }>();
  for (const r of threeBRows) {
    const k = normalizePeriodLabel(r['Return Period']);
    if (!k) continue;
    const cur = threeBByMonth.get(k) || { Taxable: 0, IGST: 0, CGST: 0, SGST: 0 };
    cur.Taxable += Number(r.Taxable) || 0;
    cur.IGST += Number(r.IGST) || 0;
    cur.CGST += Number(r.CGST) || 0;
    cur.SGST += Number(r.SGST) || 0;
    threeBByMonth.set(k, cur);
  }

  const tieOut: any[] = [];
  for (const m of monthWise) {
    const matching3b = threeBByMonth.get(normalizePeriodLabel(m.Month));

    if (!matching3b) {
      tieOut.push({
        'Return Period': m.Month,
        'Taxable (GSTR-1)': m['Net Taxable'],
        'Taxable (GSTR-3B)': '',
        'Taxable Difference': '',
        'Tax (GSTR-1)': m['Total Tax'],
        'Tax (GSTR-3B)': '',
        'Tax Difference': '',
        Status: 'No 3B data entered',
        Reason: 'No GSTR-3B figures for this month yet',
      });
      continue;
    }

    const diffTaxable = round(m['Net Taxable'] - matching3b.Taxable);
    const diffTax = round(m['Total Tax'] - (matching3b.IGST + matching3b.CGST + matching3b.SGST));

    tieOut.push({
      'Return Period': m.Month,
      'Taxable (GSTR-1)': m['Net Taxable'],
      'Taxable (GSTR-3B)': round(matching3b.Taxable),
      'Taxable Difference': diffTaxable,
      'Tax (GSTR-1)': m['Total Tax'],
      'Tax (GSTR-3B)': round(matching3b.IGST + matching3b.CGST + matching3b.SGST),
      'Tax Difference': diffTax,
      Status: (Math.abs(diffTaxable) <= 1 && Math.abs(diffTax) <= 1) ? 'Tied' : 'Difference',
      Reason:
        Math.abs(diffTaxable) <= 1 && Math.abs(diffTax) <= 1
          ? 'GSTR-1 and GSTR-3B agree within \u20b91'
          : [
              Math.abs(diffTaxable) > 1 ? `Taxable differs from 3B by ${inr(diffTaxable)}` : '',
              Math.abs(diffTax) > 1 ? `Tax differs from 3B by ${inr(diffTax)}` : '',
            ]
              .filter(Boolean)
              .join(' \u00b7 '),
    });
  }

  return {
    dashboard,
    monthWise,
    tieOut,
    portalFiles: portalSummaryRows,
    b2bReco,
    cdnrReco,
    hsnReco,
  };
}

export function normalizePeriodLabel(val: any): string {
  const s = String(val || '').trim();
  if (!s) return '';

  let m = s.match(/^([A-Za-z]{3})[A-Za-z]*[\s\-/.]*(\d{2}|\d{4})$/);
  if (m) {
    const mi = MONTH_NAMES.findIndex(x => x.toLowerCase() === m![1].toLowerCase());
    if (mi !== -1) {
      let y = parseInt(m[2], 10);
      if (y < 100) y += 2000;
      return `${MONTH_NAMES[mi]}-${y}`;
    }
  }

  m = s.match(/^(\d{2})[\s\-/.]*(\d{4})$/); // 042026, 04-2026
  if (m) {
    const mo = parseInt(m[1], 10);
    if (mo >= 1 && mo <= 12) return `${MONTH_NAMES[mo - 1]}-${m[2]}`;
  }

  m = s.match(/^(\d{4})[\s\-/.]*(\d{1,2})$/); // 2026-04
  if (m) {
    const mo = parseInt(m[2], 10);
    if (mo >= 1 && mo <= 12) return `${MONTH_NAMES[mo - 1]}-${m[1]}`;
  }

  return s;
}

function matchGstr1Section(portalRows: any[], booksRows: any[], tolerance = 1.0): any[] {
  const pMap = new Map<string, any>();
  for (const r of portalRows) {
    const k = `${r.GSTIN}|${String(r['Invoice No']).replace(/\s+/g, '').toUpperCase()}`;
    if (!pMap.has(k)) {
      pMap.set(k, { ...r, Taxable: 0, Tax: 0 });
    }
    const item = pMap.get(k);
    item.Taxable += r.Taxable;
    item.Tax += r.Tax;
  }

  const bMap = new Map<string, any>();
  for (const r of booksRows) {
    const k = `${r.GSTIN}|${String(r['Invoice No']).replace(/\s+/g, '').toUpperCase()}`;
    if (!bMap.has(k)) {
      bMap.set(k, { ...r, Taxable: 0, Tax: 0 });
    }
    const item = bMap.get(k);
    item.Taxable += r.Taxable;
    item.Tax += r.Tax;
  }

  const allKeys = new Set([...pMap.keys(), ...bMap.keys()]);
  const results: any[] = [];

  for (const k of allKeys) {
    const p = pMap.get(k);
    const b = bMap.get(k);

    const gstin = p?.GSTIN || b?.GSTIN;
    const invNo = p?.['Invoice No'] || b?.['Invoice No'];

    if (p && !b) {
      results.push({
        Status: 'Only in Portal',
        Reason: 'Not found in Books (sales register)',
        GSTIN: gstin,
        'Invoice No': invNo,
        Date_Portal: p.Date,
        Date_Books: '',
        Taxable_Portal: round(p.Taxable),
        Taxable_Books: 0,
        'Taxable Diff': round(-p.Taxable),
        Tax_Portal: round(p.Tax),
        Tax_Books: 0,
        'Tax Diff': round(-p.Tax),
        Action: 'In GSTR-1, not in Books. Check sales register.',
      });
    } else if (!p && b) {
      results.push({
        Status: 'Only in Books',
        Reason: 'Not found in GSTR-1 (portal)',
        GSTIN: gstin,
        'Invoice No': invNo,
        Date_Portal: '',
        Date_Books: b.Date,
        Taxable_Portal: 0,
        Taxable_Books: round(b.Taxable),
        'Taxable Diff': round(b.Taxable),
        Tax_Portal: 0,
        Tax_Books: round(b.Tax),
        'Tax Diff': round(b.Tax),
        Action: 'In Books, not in GSTR-1. Check portal filing.',
      });
    } else if (p && b) {
      const diffTaxable = round(b.Taxable - p.Taxable);
      const diffTax = round(b.Tax - p.Tax);
      const isMatch = Math.abs(diffTaxable) <= tolerance && Math.abs(diffTax) <= tolerance;

      const reasonParts: string[] = [];
      if (Math.abs(diffTaxable) > tolerance) reasonParts.push(`Taxable value differs by ${inr(diffTaxable)}`);
      if (Math.abs(diffTax) > tolerance) reasonParts.push(`Tax differs by ${inr(diffTax)}`);
      if (isMatch) reasonParts.push('Taxable value and tax agree');
      if (p.Date && b.Date && p.Date !== b.Date) reasonParts.push(`dates ${p.Date} vs ${b.Date}`);

      results.push({
        Status: isMatch ? 'Matched' : 'Mismatch',
        Reason: reasonParts.join(' \u00b7 '),
        GSTIN: gstin,
        'Invoice No': invNo,
        Date_Portal: p.Date,
        Date_Books: b.Date,
        Taxable_Portal: round(p.Taxable),
        Taxable_Books: round(b.Taxable),
        'Taxable Diff': diffTaxable,
        Tax_Portal: round(p.Tax),
        Tax_Books: round(b.Tax),
        'Tax Diff': diffTax,
        Action: isMatch ? '' : 'Amount difference between Portal and Books.',
      });
    }
  }

  return pairGstr1AcrossGstin(results, tolerance);
}

/** First two digits of a GSTIN are the state code. */
const STATE_BY_CODE: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '26': 'Dadra & Nagar Haveli and Daman & Diu', '27': 'Maharashtra', '29': 'Karnataka',
  '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
  '97': 'Other Territory',
};

const stateOfGstin = (gstin: string) => {
  const code = String(gstin || '').slice(0, 2);
  return STATE_BY_CODE[code] || (code ? `state ${code}` : 'no GSTIN');
};

/**
 * The key is GSTIN + invoice no, so the same invoice filed against another
 * state's registration arrives as two half-rows. When invoice no, amount and
 * date agree but the GSTIN does not, the invoice is right and the registration
 * is wrong: report one row marked "Possible mismatch".
 */
function pairGstr1AcrossGstin(results: any[], tolerance: number): any[] {
  const onlyPortal = results.filter(r => r.Status === 'Only in Portal');
  const onlyBooks = results.filter(r => r.Status === 'Only in Books');
  if (!onlyPortal.length || !onlyBooks.length) return results;

  const keyOf = (v: any) => String(v || '').replace(/\s+/g, '').toUpperCase();
  const merged: any[] = [];
  const replaced = new Set<any>();
  const usedBooks = new Set<any>();

  for (const a of onlyPortal) {
    const invA = keyOf(a['Invoice No']);
    if (!invA) continue;

    let best: any = null;
    for (const b of onlyBooks) {
      if (usedBooks.has(b)) continue;
      if (keyOf(b['Invoice No']) !== invA) continue;
      if (String(a.GSTIN || '').toUpperCase() === String(b.GSTIN || '').toUpperCase()) continue;
      if (Math.abs((b.Taxable_Books || 0) - (a.Taxable_Portal || 0)) > tolerance) continue;
      if (Math.abs((b.Tax_Books || 0) - (a.Tax_Portal || 0)) > tolerance) continue;
      const sameDate = a.Date_Portal && b.Date_Books && a.Date_Portal === b.Date_Books;
      if (!best || (sameDate && !(best.Date_Portal && best.Date_Books && best.Date_Portal === best.Date_Books))) {
        best = b;
        if (sameDate) break;
      }
    }

    if (!best) continue;

    usedBooks.add(best);
    replaced.add(a);
    replaced.add(best);

    const gPortal = String(a.GSTIN || '').toUpperCase();
    const gBooks = String(best.GSTIN || '').toUpperCase();
    const dateNote =
      a.Date_Portal && best.Date_Books && a.Date_Portal !== best.Date_Books
        ? ' Date also differs (portal ' + a.Date_Portal + ' vs books ' + best.Date_Books + ').'
        : '';

    merged.push({
      Status: 'Possible mismatch',
      Reason: 'Book entry invoice booked in wrong state GSTIN',
      GSTIN: gBooks,
      'GSTIN (Portal)': gPortal,
      'GSTIN (Books)': gBooks,
      'Invoice No': a['Invoice No'] || best['Invoice No'] || '',
      Date_Portal: a.Date_Portal || '',
      Date_Books: best.Date_Books || '',
      Taxable_Portal: round(a.Taxable_Portal || 0),
      Taxable_Books: round(best.Taxable_Books || 0),
      'Taxable Diff': round((best.Taxable_Books || 0) - (a.Taxable_Portal || 0)),
      Tax_Portal: round(a.Tax_Portal || 0),
      Tax_Books: round(best.Tax_Books || 0),
      'Tax Diff': round((best.Tax_Books || 0) - (a.Tax_Portal || 0)),
      Action:
        'Invoice no, date and amount agree, but the recipient GSTIN differs - the book entry is booked under the wrong state registration. ' +
        'Portal ' + (gPortal || '-') + ' (' + stateOfGstin(gPortal) + ') vs Books ' + (gBooks || '-') + ' (' + stateOfGstin(gBooks) + '). ' +
        'Correct the GSTIN in the sales register before filing.' + dateNote,
    });
  }

  if (!merged.length) return results;

  const out: any[] = [];
  for (const r of results) {
    if (replaced.has(r)) continue;
    out.push(r);
  }
  return [...merged, ...out];
}

/**
 * HSN / SAC summary check: portal HSN lines against the books HSN sheet,
 * grouped by HSN code so rate-wise splits on either side still compare.
 */
function matchHsnSection(portal: any[], books: any[], tolerance: number): Array<Record<string, any>> {
  const keyOf = (r: any) => String(r.HSN || '').trim().toUpperCase() || '(blank)';
  const aggregate = (rows: any[]) => {
    const map = new Map<string, { taxable: number; tax: number; qty: number }>();
    for (const r of rows) {
      const k = keyOf(r);
      const cur = map.get(k) || { taxable: 0, tax: 0, qty: 0 };
      cur.taxable += Number(r.Taxable) || 0;
      cur.tax += Number(r.Tax) || 0;
      cur.qty += Number(r.Qty) || 0;
      map.set(k, cur);
    }
    return map;
  };

  const p = aggregate(portal);
  const b = aggregate(books);
  const keys = Array.from(new Set([...p.keys(), ...b.keys()])).sort();

  const out: Array<Record<string, any>> = [];
  for (const k of keys) {
    const pr = p.get(k);
    const br = b.get(k);
    const pTaxable = round(pr?.taxable || 0);
    const bTaxable = round(br?.taxable || 0);
    const pTax = round(pr?.tax || 0);
    const bTax = round(br?.tax || 0);

    let status = 'Matched';
    if (!pr) status = 'Only in Books';
    else if (!br) status = 'Only in Portal';
    else if (Math.abs(bTaxable - pTaxable) > tolerance || Math.abs(bTax - pTax) > tolerance) status = 'Mismatch';

    const hsnReason =
      status === 'Matched'
        ? 'Taxable value and tax agree for this HSN'
        : status === 'Only in Books'
        ? 'HSN in books, not filed in GSTR-1'
        : status === 'Only in Portal'
        ? 'HSN filed in GSTR-1, not in books'
        : `Taxable differs by ${inr(bTaxable - pTaxable)} and tax by ${inr(bTax - pTax)}`;

    out.push({
      HSN: k,
      Status: status,
      Reason: hsnReason,
      'Qty (Portal)': round(pr?.qty || 0),
      'Qty (Books)': round(br?.qty || 0),
      'Taxable (Portal)': pTaxable,
      'Taxable (Books)': bTaxable,
      'Taxable Diff': round(bTaxable - pTaxable),
      'Tax (Portal)': pTax,
      'Tax (Books)': bTax,
      'Tax Diff': round(bTax - pTax),
      Action:
        status === 'Matched'
          ? ''
          : status === 'Only in Books'
          ? 'HSN in books but not filed in GSTR-1.'
          : status === 'Only in Portal'
          ? 'HSN filed in GSTR-1 but missing in books.'
          : 'Taxable value or tax differs for this HSN.',
    });
  }
  return out;
}

function sum(arr: any[], col: string): number {
  return round(arr.reduce((s, x) => s + (x[col] || 0), 0));
}

function round(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/** Rupee amount for the Reason column. */
function inr(num: number): string {
  return `\u20b9${round(num).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
