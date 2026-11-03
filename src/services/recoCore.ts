import { Gst2aRecoResult, ManualNoteType } from '../types';
import { readExcelFile, getRawSheetRows } from './excelEngine';
import { asDate, formatDateIso } from './periodManager';

const STORAGE_MANUAL_NOTES_KEY = 'gst_suite_manual_notes';

export function loadManualNotes(): ManualNoteType[] {
  try {
    const raw = localStorage.getItem(STORAGE_MANUAL_NOTES_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveManualNotes(notes: ManualNoteType[]) {
  try {
    localStorage.setItem(STORAGE_MANUAL_NOTES_KEY, JSON.stringify(notes));
  } catch (e) {
    console.error('Failed to save manual notes to localStorage', e);
  }
}

export function mergeManualNotes(base: ManualNoteType[], incoming: ManualNoteType[]): ManualNoteType[] {
  const map = new Map<string, ManualNoteType>();
  for (const n of base) {
    const k = `${n.GSTIN.toUpperCase()}|${n['Note No'].replace(/\s+/g, '').toUpperCase()}`;
    map.set(k, n);
  }
  for (const n of incoming) {
    const k = `${n.GSTIN.toUpperCase()}|${n['Note No'].replace(/\s+/g, '').toUpperCase()}`;
    map.set(k, n);
  }
  return Array.from(map.values());
}

function normalizeHeader(str: any): string {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function toNum(v: any): number {
  if (v === null || v === undefined || v === '') return 0;
  const cleaned = String(v).replace(/,/g, '').replace(/₹/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function cleanDocNumber(inv: any): string {
  return String(inv || '').replace(/\s+/g, '').toUpperCase();
}

export function detectSheet(columns: string[]): { source: 'GSTR-2A' | 'BOOKS-PURCHASE' | null; sheetType: 'B2B' | 'B2BA' | 'CDNR' | 'CDNRA' | 'B2BUR' | null } {
  const n = new Set(columns.map(normalizeHeader));
  if (n.has("original invoice no") && n.has("invoice no revised")) {
    return { source: "GSTR-2A", sheetType: "B2BA" };
  }
  if (n.has("orig note no")) {
    return { source: "GSTR-2A", sheetType: "CDNRA" };
  }
  if (n.has("note no") && (n.has("supplier gstin") || n.has("gstin of supplier"))) {
    return { source: "GSTR-2A", sheetType: "CDNR" };
  }
  if ((n.has("supplier gstin") || n.has("gstin")) && (n.has("invoice no") || n.has("invoice number"))) {
    return { source: "GSTR-2A", sheetType: "B2B" };
  }
  if (n.has("gstin of supplier") && n.has("note refund voucher number")) {
    return { source: "BOOKS-PURCHASE", sheetType: "CDNR" };
  }
  if (n.has("gstin of supplier") && n.has("invoice number")) {
    return { source: "BOOKS-PURCHASE", sheetType: "B2B" };
  }
  if (n.has("invoice number") && n.has("supply type")) {
    return { source: "BOOKS-PURCHASE", sheetType: "B2BUR" };
  }
  return { source: null, sheetType: null };
}

export function parseReturnMonth(val: any): { year: number; month: number } | null {
  if (!val) return null;
  const text = String(val).trim();
  const m1 = text.match(/^([A-Za-z]{3})[A-Za-z]*[-\s]?(\d{2}|\d{4})$/);
  const months: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
  };
  if (m1 && months[m1[1].toLowerCase()]) {
    let year = parseInt(m1[2], 10);
    year = year < 100 ? year + 2000 : year;
    return { year, month: months[m1[1].toLowerCase()] };
  }
  const m2 = text.match(/^(\d{2})(\d{4})$/); // MMYYYY
  if (m2) {
    const mo = parseInt(m2[1], 10);
    const yr = parseInt(m2[2], 10);
    if (mo >= 1 && mo <= 12 && yr >= 2000 && yr <= 2100) {
      return { year: yr, month: mo };
    }
  }
  return null;
}

export interface StandardRow {
  source: string;
  sheet: string;
  type: string;
  gstin: string;
  party: string;
  invoiceNo: string;
  originalInvoiceNo: string;
  invoiceDate: string; // YYYY-MM-DD
  docType: string;     // INV, CN, DN, REVIEW
  docSource: string;
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  totalTax: number;
  itcEligibility: string;
  itcClass: string;
  reason: string;
  period: string;
}

export async function parseWorkbookSheets(file: File, targetSource: 'GSTR-2A' | 'BOOKS-PURCHASE'): Promise<StandardRow[]> {
  const wb = await readExcelFile(file);
  const rows: StandardRow[] = [];

  for (const sheetName of wb.SheetNames) {
    const table = getRawSheetRows(wb, sheetName);
    if (table.length < 2) continue;

    // Find header row
    let headerIdx = -1;
    let detected: { source: any; sheetType: any } = { source: null, sheetType: null };

    for (let i = 0; i < Math.min(10, table.length); i++) {
      const line = table[i];
      if (!Array.isArray(line)) continue;
      const headers = line.map(String);
      const res = detectSheet(headers);
      if (res.source === targetSource) {
        headerIdx = i;
        detected = res;
        break;
      }
    }

    if (headerIdx === -1 || !detected.source || !detected.sheetType) {
      continue;
    }

    const headers = table[headerIdx].map(normalizeHeader);
    const getColVal = (row: any[], ...candidateNames: string[]) => {
      for (const name of candidateNames) {
        const norm = normalizeHeader(name);
        const idx = headers.findIndex(h => h.includes(norm) || norm.includes(h));
        if (idx !== -1 && row[idx] !== undefined) return row[idx];
      }
      return '';
    };

    for (let r = headerIdx + 1; r < table.length; r++) {
      const row = table[r];
      if (!row || !Array.isArray(row) || row.length === 0) continue;

      let inv = '', orig = '', party = '', gstin = '', dt = '', docRaw = '', period = '';
      let taxable = 0, igst = 0, cgst = 0, sgst = 0, cess = 0, itcElig = '', reason = '';

      if (detected.source === 'GSTR-2A') {
        inv = String(getColVal(row, "Invoice no", "Note no", "Invoice no revised", "Note no revised") || '').trim();
        orig = String(getColVal(row, "Original invoice no", "Orig note no") || '').trim();
        party = String(getColVal(row, "Supplier name", "Party name") || '').trim();
        gstin = String(getColVal(row, "Supplier GSTIN", "GSTIN") || '').trim().toUpperCase();
        dt = String(getColVal(row, "Invoice date", "Note date", "Invoice date revised", "Note date revised") || '');
        docRaw = String(getColVal(row, "Invoice type", "Note type") || '').toLowerCase();
        period = String(getColVal(row, "Return period") || '').trim();

        taxable = toNum(getColVal(row, "Taxable value", "Taxable"));
        igst = toNum(getColVal(row, "IGST"));
        cgst = toNum(getColVal(row, "CGST"));
        sgst = toNum(getColVal(row, "SGST", "SGST UTGST"));
        cess = toNum(getColVal(row, "Cess"));
        itcElig = "Eligible (portal)";
      } else {
        // BOOKS-PURCHASE
        if (detected.sheetType === 'CDNR') {
          inv = String(getColVal(row, "Note Refund Voucher Number", "Note Number", "Voucher Number") || '').trim();
          orig = String(getColVal(row, "Invoice Advance Payment Voucher Number", "Original Invoice Number") || '').trim();
          party = String(getColVal(row, "Supplier Name", "Party Name") || '').trim();
          gstin = String(getColVal(row, "GSTIN of Supplier", "Supplier GSTIN") || '').trim().toUpperCase();
          dt = String(getColVal(row, "Note Refund Voucher date", "Note Date", "Voucher Date") || '');
          docRaw = String(getColVal(row, "Document Type") || '').toLowerCase();
          taxable = toNum(getColVal(row, "Taxable Value", "Taxable"));
          reason = String(getColVal(row, "Reason For Issuing document") || '');
        } else {
          inv = String(getColVal(row, "Invoice Number", "Invoice No") || '').trim();
          party = String(getColVal(row, "Supplier Name", "Party Name") || '').trim();
          gstin = String(getColVal(row, "GSTIN of Supplier", "Supplier GSTIN") || '').trim().toUpperCase();
          dt = String(getColVal(row, "Invoice date", "Date") || '');
          taxable = toNum(getColVal(row, "Taxable Value", "Taxable"));
        }
        igst = toNum(getColVal(row, "Integrated Tax Paid", "IGST"));
        cgst = toNum(getColVal(row, "Central Tax Paid", "CGST"));
        sgst = toNum(getColVal(row, "State UT Tax Paid", "SGST"));
        cess = toNum(getColVal(row, "Cess Paid", "Cess"));
        itcElig = String(getColVal(row, "Eligibility For ITC") || '');
      }

      if (!inv || inv.toLowerCase() === 'nan' || inv === 'Total') continue;

      let docType = 'INV';
      if (docRaw.includes('credit') || docRaw === 'c') docType = 'CN';
      else if (docRaw.includes('debit') || docRaw === 'd') docType = 'DN';
      else if (detected.source === 'BOOKS-PURCHASE' && detected.sheetType === 'CDNR') {
        const prefix = inv.match(/^([A-Za-z]+)/)?.[0]?.toUpperCase() || '';
        if (['CN', 'C', 'CIDL', 'HT'].includes(prefix)) docType = 'CN';
        else if (prefix === 'DN') docType = 'DN';
        else docType = 'REVIEW';
      }

      let itcClass = '';
      if (detected.source === 'BOOKS-PURCHASE') {
        if (itcElig === 'Inputs') itcClass = 'Goods';
        else if (itcElig === 'Input services') itcClass = 'Services';
        else if (itcElig === 'Capital goods') itcClass = 'Capital goods';
        else if (itcElig === 'Ineligible') itcClass = 'Ineligible';
      }

      // Format date to ISO
      let dateIso = '';
      if (dt) {
        const d = asDate(dt);
        dateIso = formatDateIso(d);
      }

      rows.push({
        source: detected.source,
        sheet: sheetName,
        type: detected.sheetType,
        gstin,
        party,
        invoiceNo: inv,
        originalInvoiceNo: orig,
        invoiceDate: dateIso,
        docType,
        docSource: detected.source === 'GSTR-2A' ? 'Portal note type' : 'Invoice (books)',
        taxable,
        igst,
        cgst,
        sgst,
        cess,
        totalTax: igst + cgst + sgst + cess,
        itcEligibility: itcElig,
        itcClass,
        reason,
        period,
      });
    }
  }

  return rows;
}

export function runGst2aReconciliation(
  portalRows: StandardRow[],
  booksRows: StandardRow[],
  gstin: string,
  options: {
    startDate: string;
    endDate: string;
    basis: 'both' | 'invoice' | 'return';
    manualTypes: ManualNoteType[];
    tolerance?: number;
  }
): Gst2aRecoResult {
  const tolerance = options.tolerance ?? 1.0;
  const start = asDate(options.startDate);
  start.setHours(0, 0, 0, 0);
  const end = asDate(options.endDate);
  end.setHours(23, 59, 59, 999);
  const startMo = start.getFullYear() * 12 + start.getMonth() + 1;
  const endMo = end.getFullYear() * 12 + end.getMonth() + 1;

  // Filter Portal rows
  const pFiltered = portalRows.filter(r => {
    const invD = r.invoiceDate ? asDate(r.invoiceDate) : null;
    const inInv = invD ? (invD >= start && invD <= end) : false;
    if (options.basis === 'invoice' || !r.period) return inInv;

    const pm = parseReturnMonth(r.period);
    const inRet = pm ? ((pm.year * 12 + pm.month) >= startMo && (pm.year * 12 + pm.month) <= endMo) : false;
    if (options.basis === 'return') return inRet;
    return inInv || inRet; // both
  });

  // Filter Books rows (books always uses invoice date)
  const bFiltered = booksRows.filter(r => {
    const invD = r.invoiceDate ? asDate(r.invoiceDate) : null;
    return invD ? (invD >= start && invD <= end) : false;
  });

  // Apply manual note types to books CDNR
  const manualMap = new Map<string, 'CN' | 'DN'>();
  for (const m of options.manualTypes) {
    manualMap.set(`${m.GSTIN.toUpperCase()}|${cleanDocNumber(m['Note No'])}`, m.Type);
  }

  // Also build portal CDNR lookup for Books CDNR
  const portalCdnMap = new Map<string, string>();
  for (const pr of portalRows.filter(x => x.type === 'CDNR')) {
    portalCdnMap.set(`${pr.gstin.toUpperCase()}|${cleanDocNumber(pr.invoiceNo)}`, pr.docType);
  }

  for (const br of bFiltered) {
    if (br.type === 'CDNR') {
      const k = `${br.gstin.toUpperCase()}|${cleanDocNumber(br.invoiceNo)}`;
      if (manualMap.has(k)) {
        br.docType = manualMap.get(k)!;
        br.docSource = 'User confirmed';
      } else if (portalCdnMap.has(k)) {
        br.docType = portalCdnMap.get(k)!;
        br.docSource = 'Portal note type (matched)';
      }
    }
  }

  // Group and Reconcile B2B
  const pB2b = pFiltered.filter(r => r.type === 'B2B');
  const bB2b = bFiltered.filter(r => r.type === 'B2B');
  const b2bReco = reconcileSets(pB2b, bB2b, tolerance, true);

  // Group and Reconcile CDNR
  const pCdn = pFiltered.filter(r => r.type === 'CDNR');
  const bCdn = bFiltered.filter(r => r.type === 'CDNR');
  const cdnReco = suggestPairs(reconcileSets(pCdn, bCdn, tolerance, false));

  // CDN Review items (books notes with REVIEW type or unmatched notes needing confirmation)
  const cdnReview: Array<Record<string, any>> = [];
  for (const r of cdnReco) {
    if (r['Status'] === 'Only in Books' || r['Doc_BK'] === 'REVIEW') {
      cdnReview.push({
        'GSTIN': r['GSTIN'],
        'Party': r['Party'],
        'Note No': r['Invoice No'],
        'Invoice Date': r['Date_BK'],
        'Taxable': r['Taxable_BK'],
        'Total Tax': r['Total Tax_BK'],
        'Type (CN / DN)': (r['Doc_BK'] === 'CN' || r['Doc_BK'] === 'DN') ? r['Doc_BK'] : 'CN',
        'Source': r['DocSrc_BK'] || 'Unmatched'
      });
    }
  }

  // GSTR-9 ITC Summary (from all books rows, annual)
  const gstr9Itc = buildGstr9Summary(booksRows, pB2b.reduce((s, r) => s + r.totalTax, 0));

  // Dashboard table
  const dashboard = buildGst2aDashboard(b2bReco, cdnReco);

  return {
    dashboard,
    b2bReco,
    cdnReco,
    gstr9Itc,
    cdnReview,
  };
}

function reconcileSets(portal: StandardRow[], books: StandardRow[], tolerance: number, matchDocType: boolean): Array<Record<string, any>> {
  // Group portal by Key
  const pMap = new Map<string, any>();
  for (const r of portal) {
    const k = matchDocType
      ? `${r.gstin.toUpperCase()}|${r.docType}|${cleanDocNumber(r.invoiceNo)}`
      : `${r.gstin.toUpperCase()}|${cleanDocNumber(r.invoiceNo)}`;

    if (!pMap.has(k)) {
      pMap.set(k, {
        GSTIN: r.gstin,
        Party_2A: r.party,
        Invoice_2A: r.invoiceNo,
        Date_2A: r.invoiceDate,
        Doc_2A: r.docType,
        Orig_2A: r.originalInvoiceNo,
        Taxable_2A: 0,
        IGST_2A: 0,
        CGST_2A: 0,
        SGST_2A: 0,
        Cess_2A: 0,
        'Total Tax_2A': 0,
      });
    }
    const item = pMap.get(k);
    item.Taxable_2A += r.taxable;
    item.IGST_2A += r.igst;
    item.CGST_2A += r.cgst;
    item.SGST_2A += r.sgst;
    item.Cess_2A += r.cess;
    item['Total Tax_2A'] += r.totalTax;
  }

  // Group books by Key
  const bMap = new Map<string, any>();
  for (const r of books) {
    const k = matchDocType
      ? `${r.gstin.toUpperCase()}|${r.docType}|${cleanDocNumber(r.invoiceNo)}`
      : `${r.gstin.toUpperCase()}|${cleanDocNumber(r.invoiceNo)}`;

    if (!bMap.has(k)) {
      bMap.set(k, {
        GSTIN: r.gstin,
        Party_BK: r.party,
        Invoice_BK: r.invoiceNo,
        Date_BK: r.invoiceDate,
        Doc_BK: r.docType,
        Orig_BK: r.originalInvoiceNo,
        DocSrc_BK: r.docSource,
        Taxable_BK: 0,
        IGST_BK: 0,
        CGST_BK: 0,
        SGST_BK: 0,
        Cess_BK: 0,
        'Total Tax_BK': 0,
        ITC_Class: r.itcClass || '',
      });
    }
    const item = bMap.get(k);
    item.Taxable_BK += r.taxable;
    item.IGST_BK += r.igst;
    item.CGST_BK += r.cgst;
    item.SGST_BK += r.sgst;
    item.Cess_BK += r.cess;
    item['Total Tax_BK'] += r.totalTax;
  }

  const allKeys = new Set([...pMap.keys(), ...bMap.keys()]);
  const rows: Array<Record<string, any>> = [];

  for (const key of allKeys) {
    const p = pMap.get(key);
    const b = bMap.get(key);

    const gstin = p?.GSTIN || b?.GSTIN || '';
    const invoiceNo = p?.Invoice_2A || b?.Invoice_BK || '';
    const party = p?.Party_2A || b?.Party_BK || '';

    if (p && !b) {
      rows.push({
        Status: 'Only in 2A',
        GSTIN: gstin,
        Party: party,
        'Invoice No': invoiceNo,
        Date_2A: p.Date_2A,
        Date_BK: '',
        Taxable_2A: round(p.Taxable_2A),
        Taxable_BK: 0,
        'Taxable Diff (Books-2A)': round(-p.Taxable_2A),
        'Total Tax_2A': round(p['Total Tax_2A']),
        'Total Tax_BK': 0,
        'Tax Diff (Books-2A)': round(-p['Total Tax_2A']),
        Doc_2A: p.Doc_2A,
        Doc_BK: '',
        'Reason Code': 'NOT_IN_BOOKS',
        Action: 'Invoice found in GSTR-2A/2B but missing from Books. Verify purchase register before claiming ITC.',
        'Name Check': '',
        'Possible Pair': ''
      });
    } else if (!p && b) {
      rows.push({
        Status: 'Only in Books',
        GSTIN: gstin,
        Party: party,
        'Invoice No': invoiceNo,
        Date_2A: '',
        Date_BK: b.Date_BK,
        Taxable_2A: 0,
        Taxable_BK: round(b.Taxable_BK),
        'Taxable Diff (Books-2A)': round(b.Taxable_BK),
        'Total Tax_2A': 0,
        'Total Tax_BK': round(b['Total Tax_BK']),
        'Tax Diff (Books-2A)': round(b['Total Tax_BK']),
        Doc_2A: '',
        Doc_BK: b.Doc_BK,
        DocSrc_BK: b.DocSrc_BK,
        'Reason Code': 'NOT_IN_2A',
        Action: 'Invoice in Books but not found in GSTR-2A/2B. Follow up with supplier to file GSTR-1 or check timing.',
        'Name Check': '',
        'Possible Pair': ''
      });
    } else if (p && b) {
      const codes: string[] = [];
      const diffTaxable = round(b.Taxable_BK - p.Taxable_2A);
      const diffIgst = round(b.IGST_BK - p.IGST_2A);
      const diffCgst = round(b.CGST_BK - p.CGST_2A);
      const diffSgst = round(b.SGST_BK - p.SGST_2A);
      const diffTax = round(b['Total Tax_BK'] - p['Total Tax_2A']);

      if (Math.abs(diffTaxable) > tolerance) codes.push('TAXABLE_DIFF');
      if (Math.abs(diffIgst) > tolerance) codes.push('IGST_DIFF');
      if (Math.abs(diffCgst) > tolerance) codes.push('CGST_DIFF');
      if (Math.abs(diffSgst) > tolerance) codes.push('SGST_DIFF');

      if (p.Date_2A && b.Date_BK && p.Date_2A !== b.Date_BK) {
        codes.push('DATE_DIFF');
      }
      if (!matchDocType && p.Doc_2A !== b.Doc_BK) {
        codes.push('DOC_TYPE_DIFF');
      }

      let nameNote = '';
      if (p.Party_2A && b.Party_BK && p.Party_2A.toLowerCase() !== b.Party_BK.toLowerCase()) {
        nameNote = 'Name differs (check master)';
      }

      const isMatch = codes.length === 0;

      rows.push({
        Status: isMatch ? 'Matched' : 'Mismatch',
        GSTIN: gstin,
        Party: party,
        'Invoice No': invoiceNo,
        Date_2A: p.Date_2A,
        Date_BK: b.Date_BK,
        Taxable_2A: round(p.Taxable_2A),
        Taxable_BK: round(b.Taxable_BK),
        'Taxable Diff (Books-2A)': diffTaxable,
        'Total Tax_2A': round(p['Total Tax_2A']),
        'Total Tax_BK': round(b['Total Tax_BK']),
        'Tax Diff (Books-2A)': diffTax,
        Doc_2A: p.Doc_2A,
        Doc_BK: b.Doc_BK,
        'Reason Code': codes.join(', '),
        Action: isMatch ? '' : 'Discrepancy in taxable value, tax, or document date. Verify supplier invoice.',
        'Name Check': nameNote,
        'Possible Pair': ''
      });
    }
  }

  return rows;
}

function suggestPairs(result: Array<Record<string, any>>, tolerance = 1.0): Array<Record<string, any>> {
  const only2a = result.filter(r => r.Status === 'Only in 2A');
  const onlyBk = result.filter(r => r.Status === 'Only in Books');
  const used = new Set<any>();

  for (const a of only2a) {
    for (const b of onlyBk) {
      if (used.has(b)) continue;
      if (a.GSTIN === b.GSTIN && Math.abs(b.Taxable_BK - a.Taxable_2A) <= tolerance) {
        a['Possible Pair'] = `Books: ${b['Invoice No']}`;
        b['Possible Pair'] = `2A: ${a['Invoice No']}`;
        a.Action = 'Probable counterpart match found with different invoice number. Cross-verify numbering.';
        b.Action = 'Probable counterpart match found with different invoice number. Cross-verify numbering.';
        used.add(b);
        break;
      }
    }
  }

  return result;
}

function buildGstr9Summary(booksRows: StandardRow[], portalB2bTotalTax: number): Array<Record<string, any>> {
  const b2b = booksRows.filter(r => r.type === 'B2B');
  const cdnr = booksRows.filter(r => r.type === 'CDNR');

  const cats = [
    { key: "Inputs", label: "Goods (inputs)" },
    { key: "Input services", label: "Services" },
    { key: "Capital goods", label: "Capital goods" },
    { key: "Ineligible", label: "Blocked / ineligible" },
  ];

  const rows: Array<Record<string, any>> = [];

  for (const c of cats) {
    const sub = b2b.filter(r => r.itcEligibility === c.key);
    const taxPaid = round(sub.reduce((s, r) => s + r.totalTax, 0));
    const availed = c.key === 'Ineligible' ? 0 : taxPaid;

    rows.push({
      Category: c.label,
      'Books tax paid': taxPaid,
      'ITC availed (gross)': availed,
      Lines: sub.length,
      Note: c.key === 'Ineligible' ? `Tax paid on ineligible lines: ${taxPaid.toLocaleString()} (should be 0 or reversed)` : ''
    });
  }

  const cdnRows: Array<Record<string, any>> = [];
  for (const c of cats.slice(0, 2)) {
    const sub = cdnr.filter(r => r.itcEligibility === c.key);
    const taxPaid = round(sub.reduce((s, r) => s + r.totalTax, 0));
    cdnRows.push({
      Category: `Notes: ${c.label}`,
      'Books tax paid': taxPaid,
      'ITC availed (gross)': taxPaid,
      Lines: sub.length,
      Note: 'Reduction (assumption: CDN reduces availed ITC)'
    });
  }

  const grossEligible = round(rows.slice(0, 3).reduce((s, r) => s + r['ITC availed (gross)'], 0));
  const notesItc = round(cdnRows.reduce((s, r) => s + r['ITC availed (gross)'], 0));
  const netItc = round(grossEligible - notesItc);

  const totals: Array<Record<string, any>> = [
    {
      Category: 'Gross eligible ITC (invoices, excl. blocked)',
      'Books tax paid': '',
      'ITC availed (gross)': grossEligible,
      Lines: '',
      Note: ''
    },
    {
      Category: 'Less: note ITC (CN / DN)',
      'Books tax paid': '',
      'ITC availed (gross)': -notesItc,
      Lines: '',
      Note: 'Assumption: CDN ITC reduces availed ITC. Confirm with CA.'
    },
    {
      Category: 'Net ITC as per Books (YTD)',
      'Books tax paid': '',
      'ITC availed (gross)': netItc,
      Lines: '',
      Note: ''
    },
    {
      Category: 'ITC eligible as per GSTR-2A B2B (reference)',
      'Books tax paid': '',
      'ITC availed (gross)': round(portalB2bTotalTax),
      Lines: '',
      Note: 'Compare with Books gross ITC above'
    }
  ];

  return [...rows, ...cdnRows, ...totals];
}

function buildGst2aDashboard(b2bReco: Array<Record<string, any>>, cdnReco: Array<Record<string, any>>): Array<Record<string, any>> {
  const sections = [
    { name: 'B2B', list: b2bReco },
    { name: 'CDN', list: cdnReco },
  ];

  const statuses = ['Matched', 'Mismatch', 'Only in 2A', 'Only in Books'];
  const dash: Array<Record<string, any>> = [];

  for (const sec of sections) {
    for (const st of statuses) {
      const match = sec.list.filter(r => r.Status === st);
      const cnt = match.length;
      const tax2a = round(match.reduce((s, r) => s + (r.Taxable_2A || 0), 0));
      const taxBk = round(match.reduce((s, r) => s + (r.Taxable_BK || 0), 0));
      const diffTax = round(match.reduce((s, r) => s + (r['Tax Diff (Books-2A)'] || 0), 0));

      dash.push({
        Section: sec.name,
        Status: st,
        Count: cnt,
        'Taxable as per 2A': tax2a,
        'Taxable as per Books': taxBk,
        'Tax Difference': diffTax,
      });
    }
  }

  return dash;
}

function round(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}
