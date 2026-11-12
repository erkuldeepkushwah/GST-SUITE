import { Gst2aRecoResult, ManualNoteType } from '../types';
import { readExcelFile, getRawSheetRows } from './excelEngine';
import { asDate, formatDateIso, tryDate } from './periodManager';

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
  const m2 = text.match(/^(\d{2})[-/.\s]?(\d{4})$/); // MMYYYY, 04-2026, 04/2026
  if (m2) {
    const mo = parseInt(m2[1], 10);
    const yr = parseInt(m2[2], 10);
    if (mo >= 1 && mo <= 12 && yr >= 2000 && yr <= 2100) {
      return { year: yr, month: mo };
    }
  }
  const m3 = text.match(/^(\d{4})[-/.\s](\d{1,2})$/); // 2026-04
  if (m3) {
    const yr = parseInt(m3[1], 10);
    const mo = parseInt(m3[2], 10);
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
    // Loose header matching, but never against an empty header: `"anything".includes('')`
    // is true, so a blank trailing column used to swallow the value for whatever
    // column was being looked up. Exact match wins, then a header that starts with
    // the wanted name, and only then a contains check on a long enough header.
    const findCol = (name: string): number => {
      const norm = normalizeHeader(name);
      if (!norm) return -1;
      let idx = headers.findIndex(h => h === norm);
      if (idx !== -1) return idx;
      idx = headers.findIndex(h => h.length >= 3 && h.startsWith(norm));
      if (idx !== -1) return idx;
      return headers.findIndex(h => h.length >= 4 && h.includes(norm));
    };
    const getColVal = (row: any[], ...candidateNames: string[]) => {
      for (const name of candidateNames) {
        const idx = findCol(name);
        if (idx !== -1 && row[idx] !== undefined && row[idx] !== '') return row[idx];
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
        const d = tryDate(dt);
        if (d) dateIso = formatDateIso(d);
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

  if (rows.length === 0) {
    // Check if the uploaded file has the opposite source or is a bank/other file
    let foundOpposite = false;
    let foundBank = false;
    const oppSource = targetSource === 'GSTR-2A' ? 'BOOKS-PURCHASE' : 'GSTR-2A';

    for (const sheetName of wb.SheetNames) {
      const table = getRawSheetRows(wb, sheetName);
      for (let i = 0; i < Math.min(10, table.length); i++) {
        const line = table[i];
        if (!Array.isArray(line)) continue;
        const headers = line.map(String);
        const res = detectSheet(headers);
        if (res.source === oppSource) {
          foundOpposite = true;
          break;
        }
        const norm = headers.map(normalizeHeader);
        if (norm.some(c => c.includes('withdrawal') || c.includes('deposit') || c.includes('particulars') || c.includes('balance'))) {
          foundBank = true;
          break;
        }
      }
      if (foundOpposite || foundBank) break;
    }

    if (foundOpposite) {
      if (targetSource === 'GSTR-2A') {
        throw new Error("File Mismatch: You uploaded the Books Purchase register into the GSTR-2A/2B Portal slot. Please select the Portal file in this slot and Books Purchase in the Books slot (or swap them). (फ़ाइल त्रुटि: GSTR-2A पोर्टल फ़ाइल की जगह बुक्स परचेज़ फ़ाइल अपलोड हो गई है, कृपया फ़ाइलें बदलें)।");
      } else {
        throw new Error("File Mismatch: You uploaded the GSTR-2A/2B Portal file into the Books Purchase slot. Please select your Tally/ERP Purchase register in this slot (or swap them). (फ़ाइल त्रुटि: बुक्स परचेज़ की जगह पोर्टल फ़ाइल अपलोड हो गई है, कृपया फ़ाइलें बदलें)।");
      }
    }

    if (foundBank) {
      throw new Error("File Mismatch: The uploaded file appears to be a Bank Statement or Cash Book, not a GST register. Please select the correct GSTR-2A or Books Purchase file. (फ़ाइल त्रुटि: यह बैंक स्टेटमेंट फ़ाइल प्रतीत होती है, कृपया GST फ़ाइल चुनें)।");
    }

    throw new Error(`No valid ${targetSource === 'GSTR-2A' ? 'GSTR-2A/2B (B2B, CDNR)' : 'Books Purchase'} sheets found in "${file.name}". Please ensure headers like Supplier GSTIN, Invoice No, and Taxable Value are present.`);
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
    const invD = r.invoiceDate ? tryDate(r.invoiceDate) : null;
    const inInv = invD ? (invD >= start && invD <= end) : false;
    if (options.basis === 'invoice' || !r.period) return inInv;

    const pm = parseReturnMonth(r.period);
    const inRet = pm ? ((pm.year * 12 + pm.month) >= startMo && (pm.year * 12 + pm.month) <= endMo) : false;
    if (options.basis === 'return') return inRet;
    return inInv || inRet; // both
  });

  // Filter Books rows (books always uses invoice date)
  const bFiltered = booksRows.filter(r => {
    const invD = r.invoiceDate ? tryDate(r.invoiceDate) : null;
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
        'Source': r['DocSrc_BK'] || 'Unmatched',
        'Reason': r['Reason'] || 'Credit/debit note needs manual confirmation'
      });
    }
  }

  // GSTR-9 ITC Summary. The books side is the whole purchase register (annual),
  // so the portal reference has to be the whole 2A/2B B2B tax as well; using the
  // period-filtered total compared a year of books with one month of portal.
  const pB2bAllTax = portalRows.filter(r => r.type === 'B2B').reduce((s, r) => s + r.totalTax, 0);
  const gstr9Itc = buildGstr9Summary(booksRows, pB2bAllTax);

  // Dashboard table
  const dashboard = buildGst2aDashboard(b2bReco, cdnReco);

  // Transparency rows: how much the period filter left out of the B2B run
  const pKept = new Set(pFiltered);
  const bKept = new Set(bFiltered);
  const pB2bAll = portalRows.filter(r => r.type === 'B2B');
  const bB2bAll = booksRows.filter(r => r.type === 'B2B');
  const pLeft = pB2bAll.filter(r => !pKept.has(r));
  const bLeft = bB2bAll.filter(r => !bKept.has(r));

  dashboard.push({
    Section: 'B2B',
    Status: 'Left out by period filter (2A)',
    Reason: 'Invoice date falls outside the selected period',
    Count: pLeft.length,
    'Taxable as per 2A': round(pLeft.reduce((s, r) => s + (r.taxable || 0), 0)),
    'Taxable as per Books': 0,
    'Tax Difference': 0,
  });
  dashboard.push({
    Section: 'B2B',
    Status: 'Left out by period filter (Books)',
    Reason: 'Invoice date falls outside the selected period',
    Count: bLeft.length,
    'Taxable as per 2A': 0,
    'Taxable as per Books': round(bLeft.reduce((s, r) => s + (r.taxable || 0), 0)),
    'Tax Difference': 0,
  });

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
        Reason: 'Not in Books',
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
        Reason: 'Not in 2A/2B',
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

      // An invoice matches when the taxable value and the total tax agree. A
      // different tax-head split (IGST vs CGST+SGST), a different document date
      // or a supplier-name spelling is reported as a note, not as a mismatch:
      // the ITC amount is the same, so flagging it as a discrepancy buries the
      // real exceptions in a list of a thousand false ones.
      const amountCodes: string[] = [];
      if (Math.abs(diffTaxable) > tolerance) amountCodes.push('TAXABLE_DIFF');
      if (Math.abs(diffTax) > tolerance) amountCodes.push('TAX_DIFF');

      const headCodes: string[] = [];
      if (Math.abs(diffIgst) > tolerance) headCodes.push('IGST_DIFF');
      if (Math.abs(diffCgst) > tolerance) headCodes.push('CGST_DIFF');
      if (Math.abs(diffSgst) > tolerance) headCodes.push('SGST_DIFF');

      const dateDiff = Boolean(p.Date_2A && b.Date_BK && p.Date_2A !== b.Date_BK);
      if (dateDiff) codes.push('DATE_DIFF');
      if (!matchDocType && p.Doc_2A !== b.Doc_BK) {
        codes.push('DOC_TYPE_DIFF');
      }
      codes.unshift(...amountCodes, ...headCodes);

      const notes: string[] = [];
      if (dateDiff) notes.push('Date differs (2A vs Books)');
      if (headCodes.length > 0 && amountCodes.length === 0) notes.push('Tax head split differs, total tax matches');
      if (p.Party_2A && b.Party_BK && p.Party_2A.toLowerCase() !== b.Party_BK.toLowerCase()) {
        notes.push('Name differs (check master)');
      }
      const nameNote = notes.join(' · ');

      const isMatch = amountCodes.length === 0;

      // The Reason column is meant to be filtered, so it carries a small closed
      // set of short labels instead of a sentence: "Taxable Value Diff + Total
      // Tax Diff", "IGST Diff", "Date Diff", "OK". The numbers themselves live
      // in the diff columns next to it.
      const reasonParts: string[] = [];
      if (Math.abs(diffTaxable) > tolerance) reasonParts.push('Taxable Value Diff');
      if (Math.abs(diffTax) > tolerance) reasonParts.push('Total Tax Diff');
      if (Math.abs(diffIgst) > tolerance) reasonParts.push('IGST Diff');
      if (Math.abs(diffCgst) > tolerance) reasonParts.push('CGST Diff');
      if (Math.abs(diffSgst) > tolerance) reasonParts.push('SGST Diff');
      if (dateDiff) reasonParts.push('Date Diff');
      if (!matchDocType && p.Doc_2A !== b.Doc_BK) reasonParts.push('Doc Type Diff');
      if (p.Party_2A && b.Party_BK && p.Party_2A.toLowerCase() !== b.Party_BK.toLowerCase()) {
        reasonParts.push('Name Diff');
      }
      const reason = reasonParts.length ? reasonParts.join(' + ') : 'OK';

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
        Reason: reason,
        Doc_2A: p.Doc_2A,
        Doc_BK: b.Doc_BK,
        'Reason Code': codes.join(', '),
        Action: isMatch
          ? 'Amounts agree. Check the note column for date or tax-head differences.'
          : 'Taxable value or total tax differs. Verify the supplier invoice before claiming ITC.',
        'Name Check': nameNote,
        'Possible Pair': ''
      });
    }
  }

  return pairAcrossGstin(rows, tolerance);
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

const stateOf = (gstin: string) => {
  const code = String(gstin || '').slice(0, 2);
  return STATE_BY_CODE[code] || (code ? `state ${code}` : 'no GSTIN');
};

/**
 * The portal key includes the GSTIN, so the same invoice booked against another
 * state's registration never pairs: it shows up once as "Only in 2A" and once
 * as "Only in Books", and the reviewer has to notice the two rows belong
 * together. When invoice number, date and amount agree but the GSTIN does not,
 * the invoice is right and the registration is wrong, so the two rows are
 * replaced by one row marked "Possible mismatch".
 */
function pairAcrossGstin(
  rows: Array<Record<string, any>>,
  tolerance: number
): Array<Record<string, any>> {
  const only2a = rows.filter(r => r.Status === 'Only in 2A');
  const onlyBk = rows.filter(r => r.Status === 'Only in Books');
  if (!only2a.length || !onlyBk.length) return rows;

  const merged: Array<Record<string, any>> = [];
  const usedBooks = new Set<Record<string, any>>();
  const replaced = new Set<Record<string, any>>();

  for (const a of only2a) {
    const invA = cleanDocNumber(a['Invoice No']);
    if (!invA) continue;

    let best: Record<string, any> | null = null;
    for (const b of onlyBk) {
      if (usedBooks.has(b)) continue;
      if (cleanDocNumber(b['Invoice No']) !== invA) continue;
      if (String(a.GSTIN || '').toUpperCase() === String(b.GSTIN || '').toUpperCase()) continue;
      // Credit and debit notes can share a number: never pair a CN with a DN.
      const docA = String(a.Doc_2A || '').toUpperCase();
      const docB = String(b.Doc_BK || '').toUpperCase();
      if (docA && docB && docA !== docB) continue;
      if (Math.abs((b.Taxable_BK || 0) - (a.Taxable_2A || 0)) > tolerance) continue;
      if (Math.abs((b['Total Tax_BK'] || 0) - (a['Total Tax_2A'] || 0)) > tolerance) continue;
      // Same invoice no and amount, different registration: the date is the
      // tie-breaker when the books carry more than one candidate.
      const sameDate = a.Date_2A && b.Date_BK && a.Date_2A === b.Date_BK;
      if (!best || (sameDate && !(best.Date_2A && best.Date_BK && best.Date_2A === best.Date_BK))) {
        best = b;
        if (sameDate) break;
      }
    }

    if (!best) continue;

    usedBooks.add(best);
    replaced.add(a);
    replaced.add(best);

    const gstin2a = String(a.GSTIN || '').toUpperCase();
    const gstinBk = String(best.GSTIN || '').toUpperCase();
    const dateNote =
      a.Date_2A && best.Date_BK && a.Date_2A !== best.Date_BK
        ? ' Date also differs (2A ' + a.Date_2A + ' vs Books ' + best.Date_BK + ').'
        : '';

    merged.push({
      Status: 'Possible mismatch',
      GSTIN: gstinBk,
      'GSTIN (2A)': gstin2a,
      'GSTIN (Books)': gstinBk,
      Party: a.Party || best.Party || '',
      'Invoice No': a['Invoice No'] || best['Invoice No'] || '',
      Date_2A: a.Date_2A || '',
      Date_BK: best.Date_BK || '',
      Taxable_2A: round(a.Taxable_2A || 0),
      Taxable_BK: round(best.Taxable_BK || 0),
      'Taxable Diff (Books-2A)': round((best.Taxable_BK || 0) - (a.Taxable_2A || 0)),
      'Total Tax_2A': round(a['Total Tax_2A'] || 0),
      'Total Tax_BK': round(best['Total Tax_BK'] || 0),
      'Tax Diff (Books-2A)': round((best['Total Tax_BK'] || 0) - (a['Total Tax_2A'] || 0)),
      Reason: 'Book entry invoice booked in wrong state GSTIN',
      Doc_2A: a.Doc_2A || '',
      Doc_BK: best.Doc_BK || '',
      DocSrc_BK: best.DocSrc_BK || '',
      'Reason Code': 'GSTIN_DIFF',
      Action:
        'Invoice no, date and amount agree, but the party GSTIN differs - the book entry is booked under the wrong state registration. ' +
        'Portal ' + (gstin2a || '-') + ' (' + stateOf(gstin2a) + ') vs Books ' + (gstinBk || '-') + ' (' + stateOf(gstinBk) + '). ' +
        'Correct the GSTIN in the books before claiming ITC.' + dateNote,
      'Name Check': a.Party && best.Party && a.Party.toLowerCase() !== best.Party.toLowerCase()
        ? 'Name differs (check master)'
        : '',
      'Possible Pair': '',
    });
  }

  if (!merged.length) return rows;

  // Keep the original order for everything that was not paired, and drop the
  // two half-rows that the pair replaced.
  const out: Array<Record<string, any>> = [];
  for (const r of rows) {
    if (replaced.has(r)) continue;
    out.push(r);
  }
  return [...merged, ...out];
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

  const statuses = ['Matched', 'Possible mismatch', 'Mismatch', 'Only in 2A', 'Only in Books'];
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

/** Rupee amount for the Reason column, so a difference reads as money. */
function inr(num: number): string {
  return `\u20b9${round(num).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
