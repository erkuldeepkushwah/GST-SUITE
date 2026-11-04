import { Gstr1RecoResult } from '../types';
import { asDate, tryDate } from './periodManager';
import { readExcelFile, getSheetData } from './excelEngine';

export interface Gstr1PortalFile {
  name: string;
  fp: string;
  returnPeriod: string;
  b2b: any[];
  cdnr: any[];
  b2cs: any[];
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

      igst -= iamt;
      cgst -= camt;
      sgst -= samt;
      cdnTaxable += txval;

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

  const hsnList = [...(d.hsn?.hsn_b2b || []), ...(d.hsn?.hsn_b2c || [])];
  for (const h of hsnList) {
    hsn.push({
      HSN: String(h.hsn_sc || '').trim(),
      UQC: String(h.uqc || ''),
      Qty: parseFloat(h.qty || 0),
      Rate: parseFloat(h.rt || 0),
      Taxable: parseFloat(h.txval || 0),
      Tax: (parseFloat(h.iamt) || 0) + (parseFloat(h.camt) || 0) + (parseFloat(h.samt) || 0),
    });
  }

  const netTaxable = b2bTaxable - cdnTaxable + b2cs.reduce((s, x) => s + (parseFloat(x.Taxable) || 0), 0);

  return {
    name: file.name,
    fp,
    returnPeriod,
    b2b,
    cdnr,
    b2cs,
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

  for (const sheetName of wb.SheetNames) {
    const sNameNorm = sheetName.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (sNameNorm.includes('b2b') && !sNameNorm.includes('hsn')) {
      const data = getSheetData(wb, sheetName, 3);
      for (const row of data) {
        if (!row['Invoice Number'] || !row['GSTIN/UIN of Recipient']) continue;
        b2b.push({
          GSTIN: String(row['GSTIN/UIN of Recipient'] || '').trim().toUpperCase(),
          'Invoice No': String(row['Invoice Number'] || '').trim(),
          Date: row['Invoice date'] || '',
          'Invoice Value': parseFloat(row['Invoice Value'] || 0),
          POS: String(row['Place Of Supply'] || ''),
          Rate: String(row['Rate'] || ''),
          Taxable: parseFloat(row['Taxable Value'] || 0),
          Tax: (parseFloat(row['Taxable Value'] || 0) * (parseFloat(row['Rate'] || 0) / 100)) || 0,
          BooksFile: file.name,
        });
      }
    } else if (sNameNorm.includes('cdnr')) {
      const data = getSheetData(wb, sheetName, 3);
      for (const row of data) {
        if (!row['Note Number'] || !row['GSTIN/UIN of Recipient']) continue;
        cdnr.push({
          GSTIN: String(row['GSTIN/UIN of Recipient'] || '').trim().toUpperCase(),
          'Invoice No': String(row['Note Number'] || '').trim(),
          Date: row['Note Date'] || '',
          'Invoice Value': parseFloat(row['Note Value'] || 0),
          POS: String(row['Place Of Supply'] || ''),
          Type: String(row['Note Type'] || ''),
          Rate: String(row['Rate'] || ''),
          Taxable: parseFloat(row['Taxable Value'] || 0),
          Tax: (parseFloat(row['Taxable Value'] || 0) * (parseFloat(row['Rate'] || 0) / 100)) || 0,
          BooksFile: file.name,
        });
      }
    }
  }

  if (b2b.length === 0 && cdnr.length === 0 && b2cs.length === 0) {
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

  // Combine Portal files
  const pB2b: any[] = [];
  const pCdnr: any[] = [];
  const portalSummaryRows: any[] = [];

  for (const pf of portalFiles) {
    portalSummaryRows.push({
      File: pf.name,
      'Return Period': pf.returnPeriod,
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
  }

  // Combine Books files
  const bB2b: any[] = [];
  const bCdnr: any[] = [];
  for (const bf of booksFiles) {
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

  // Dashboard table
  const b2bMatched = b2bReco.filter(r => r.Status === 'Matched');
  const b2bMismatch = b2bReco.filter(r => r.Status === 'Mismatch');
  const b2bOnlyPortal = b2bReco.filter(r => r.Status === 'Only in Portal');
  const b2bOnlyBooks = b2bReco.filter(r => r.Status === 'Only in Books');

  const dashboard = [
    { Section: 'B2B', Status: 'Matched', Count: b2bMatched.length, 'Taxable (Portal)': sum(b2bMatched, 'Taxable_Portal'), 'Taxable (Books)': sum(b2bMatched, 'Taxable_Books') },
    { Section: 'B2B', Status: 'Mismatch', Count: b2bMismatch.length, 'Taxable (Portal)': sum(b2bMismatch, 'Taxable_Portal'), 'Taxable (Books)': sum(b2bMismatch, 'Taxable_Books') },
    { Section: 'B2B', Status: 'Only in Portal', Count: b2bOnlyPortal.length, 'Taxable (Portal)': sum(b2bOnlyPortal, 'Taxable_Portal'), 'Taxable (Books)': 0 },
    { Section: 'B2B', Status: 'Only in Books', Count: b2bOnlyBooks.length, 'Taxable (Portal)': 0, 'Taxable (Books)': sum(b2bOnlyBooks, 'Taxable_Books') },
  ];

  // Month-wise table
  const monthMap = new Map<string, any>();
  for (const pf of portalFiles) {
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

  // 3B Tie-out table
  const tieOut: any[] = [];
  for (const m of monthWise) {
    const matching3b = threeBRows.find(r => r['Return Period'] === m.Month) || {
      'Return Period': m.Month,
      Taxable: 0,
      IGST: 0,
      CGST: 0,
      SGST: 0,
    };

    const diffTaxable = round(m['Net Taxable'] - matching3b.Taxable);
    const diffTax = round(m['Total Tax'] - (matching3b.IGST + matching3b.CGST + matching3b.SGST));

    tieOut.push({
      'Return Period': m.Month,
      'Taxable (GSTR-1)': m['Net Taxable'],
      'Taxable (GSTR-3B)': matching3b.Taxable,
      'Taxable Difference': diffTaxable,
      'Tax (GSTR-1)': m['Total Tax'],
      'Tax (GSTR-3B)': round(matching3b.IGST + matching3b.CGST + matching3b.SGST),
      'Tax Difference': diffTax,
      Status: (Math.abs(diffTaxable) <= 1 && Math.abs(diffTax) <= 1) ? 'Tied' : 'Difference',
    });
  }

  return {
    dashboard,
    monthWise,
    tieOut,
    portalFiles: portalSummaryRows,
    b2bReco,
    cdnrReco,
  };
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

      results.push({
        Status: isMatch ? 'Matched' : 'Mismatch',
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

  return results;
}

function sum(arr: any[], col: string): number {
  return round(arr.reduce((s, x) => s + (x[col] || 0), 0));
}

function round(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}
