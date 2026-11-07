/**
 * Generic invoice reconciliation — ported from the GST-Reconciliation app
 * (github.com/erkuldeepkushwah/GST-Reconciliation, docs/core.js).
 *
 * That app's idea: whatever the file calls its columns, map them onto one
 * standard invoice schema first, let the user confirm that mapping, and only
 * then reconcile. This module keeps that behaviour so a Tally export, a portal
 * download and a customer's sheet can all be compared on the same footing.
 */

export const RECO_FIELDS = [
  'GSTIN',
  'Party Name',
  'Invoice No',
  'Invoice Date',
  'Invoice Type',
  'Taxable Value',
  'Invoice Value',
  'IGST',
  'CGST',
  'SGST',
  'Cess',
  'Total Tax',
] as const;

export type RecoField = (typeof RECO_FIELDS)[number];

export const TEXT_FIELDS: RecoField[] = ['GSTIN', 'Party Name', 'Invoice No', 'Invoice Date', 'Invoice Type'];
export const VALUE_FIELDS: RecoField[] = ['Taxable Value', 'Invoice Value', 'IGST', 'CGST', 'SGST', 'Cess', 'Total Tax'];

export const NOT_MAPPED = '(Not mapped)';

export const FIELD_ALIASES: Record<string, string[]> = {
  'Party Name': [
    'party name', 'supplier name', 'customer name', 'vendor name', 'trade name', 'legal name',
    'name of supplier', 'name of recipient', 'receiver name', 'recipient name', 'buyer name', 'party',
  ],
  'Invoice Type': ['invoice type', 'document type', 'doc type', 'voucher type', 'supply type', 'type of invoice'],
  GSTIN: [
    'gstin', 'gstin of supplier', 'supplier gstin', 'gstin of recipient', 'recipient gstin', 'ctin',
    'customer gstin', 'party gstin', 'gst number', 'gstin uin of recipient', 'gstin uin of supplier',
  ],
  'Invoice No': [
    'invoice no', 'invoice number', 'inum', 'bill no', 'bill number', 'document number', 'doc no',
    'voucher no', 'voucher number', 'inv no', 'invoice',
  ],
  'Invoice Date': ['invoice date', 'date', 'idt', 'bill date', 'document date', 'voucher date'],
  'Taxable Value': ['taxable value', 'taxable amount', 'taxable', 'assessable value', 'taxable amt'],
  'Invoice Value': ['invoice value', 'invoice amount', 'bill amount', 'invoice total', 'total invoice value', 'grand total'],
  IGST: ['igst', 'integrated tax', 'igst amount', 'integrated tax amount'],
  CGST: ['cgst', 'central tax', 'cgst amount', 'central tax amount'],
  SGST: ['sgst', 'utgst', 'state tax', 'sgst amount', 'state tax amount', 'utgst amount'],
  Cess: ['cess', 'cess amount'],
  'Total Tax': ['total tax', 'tax amount', 'total gst', 'gst amount', 'total tax amount'],
};

const TOKEN_EXPAND: Record<string, string> = {
  amt: 'amount', amnt: 'amount', amts: 'amount',
  dt: 'date', inv: 'invoice', invs: 'invoice',
  no: 'number', num: 'number', nos: 'number', numbers: 'number',
  val: 'value', vals: 'value', desc: 'description',
  taxbl: 'taxable', tot: 'total', qty: 'quantity',
};

const BLANKS = ['', 'nan', 'none', 'null', '-', 'na', 'n/a'];

/** Normalise a heading and expand abbreviations: "GST Amt" -> "gst amount". */
export function normCol(value: unknown): string {
  const base = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!base) return '';
  return base
    .split(' ')
    .map((token) => TOKEN_EXPAND[token] || token)
    .join(' ');
}

export type ColumnMapping = Record<string, string>;

/** Suggest a source column for every standard field. */
export function autoMapColumns(headers: string[]): ColumnMapping {
  const mapped: ColumnMapping = {};
  const normalized = headers.map((col) => ({ col, nc: normCol(col) }));
  // One source column feeds one field only. Without this, "Integrated Tax Amount"
  // would be taken by both IGST and Total Tax, and a file with CGST/SGST too
  // would report Total Tax as the IGST figure alone.
  const used = new Set<string>();

  for (const field of RECO_FIELDS) {
    const aliasNorms = (FIELD_ALIASES[field] || []).map(normCol);
    let found: string | null = null;

    for (const n of normalized) {
      if (found === null && !used.has(n.col) && aliasNorms.indexOf(n.nc) !== -1) found = n.col;
    }
    if (found === null) {
      for (const n of normalized) {
        if (found !== null) break;
        if (used.has(n.col)) continue;
        const hit = aliasNorms.some(
          (a) => a.length >= 4 && (n.nc.indexOf(a) !== -1 || a.indexOf(n.nc) !== -1)
        );
        if (hit) found = n.col;
      }
    }
    if (found !== null) used.add(found);
    mapped[field] = found === null ? NOT_MAPPED : found;
  }
  return mapped;
}

/** A GSTIN as the law defines it: state code, PAN, entity number, Z, check digit. */
const GSTIN_RE = /^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const GSTIN_IN_TEXT_RE = /[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]/;

const DATE_TEXT_RE = /^\d{1,4}\s*[-/. ]\s*\d{1,2}\s*[-/. ]\s*\d{1,4}$/;

/** True when the whole cell is a GSTIN. */
export function isGstinValue(value: unknown): boolean {
  const s = String(value ?? '').replace(/\s+/g, '').toUpperCase();
  return GSTIN_RE.test(s);
}

/**
 * "07ABCDE1234F1Z5/INV-101" carries two fields in one cell. Returns both parts,
 * or null when the cell holds only a GSTIN or no GSTIN at all.
 */
export function splitGstinInvoice(value: unknown): { gstin: string; invoice: string } | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  const match = upper.match(GSTIN_IN_TEXT_RE);
  if (!match) return null;
  const gstin = match[0];
  const at = upper.indexOf(gstin);
  const rest = raw.slice(0, at) + ' ' + raw.slice(at + gstin.length);
  const invoice = rest.replace(/^[\s/\\|:;,-]+|[\s/\\|:;,-]+$/g, '').trim();
  return invoice ? { gstin, invoice } : null;
}

interface ColumnProfile {
  col: string;
  filled: number;
  gstin: number;
  combined: number;
  date: number;
  numeric: number;
  invoiceLike: number;
}

const share = (hit: number, total: number) => (total === 0 ? 0 : hit / total);

function profileColumns(rows: Array<Record<string, any>>, headers: string[], sample = 80): ColumnProfile[] {
  const head = rows.slice(0, sample);
  return headers.map((col) => {
    const headerLooksDate = /date|dt\b|din/i.test(col);
    let filled = 0;
    let gstin = 0;
    let combined = 0;
    let date = 0;
    let numeric = 0;
    let invoiceLike = 0;

    for (const row of head) {
      const v = row?.[col];
      const text = String(v ?? '').trim();
      if (!text || BLANKS.indexOf(text.toLowerCase()) !== -1) continue;
      filled++;

      if (isGstinValue(text)) {
        gstin++;
        continue;
      }
      const split = splitGstinInvoice(text);
      if (split) {
        combined++;
        continue;
      }
      if (DATE_TEXT_RE.test(text) || v instanceof Date) {
        date++;
        continue;
      }
      const asNumber = typeof v === 'number' ? v : Number(text.replace(/[,\u20b9\s]/g, ''));
      if (isFinite(asNumber) && text.replace(/[,\u20b9\s]/g, '') !== '') {
        numeric++;
        // A serial date only counts when the heading says it is a date; an
        // amount of 45000 must never be mistaken for 15-Dec-2023.
        if (headerLooksDate && asNumber > 20000 && asNumber < 80000) date++;
        continue;
      }
      if (text.length <= 40 && /[0-9]/.test(text)) invoiceLike++;
    }

    return {
      col,
      filled,
      gstin: share(gstin, filled),
      combined: share(combined, filled),
      date: share(date, filled),
      numeric: share(numeric, filled),
      invoiceLike: share(invoiceLike, filled),
    };
  });
}

/**
 * Spec step 1: read the values, not the headings. A sheet whose columns are
 * called "CTIN", "No.", "Dt." and "Amt" still maps correctly, and a column that
 * packs the GSTIN and the bill number together is reported so it can be split.
 */
export function detectColumnRoles(
  rows: Array<Record<string, any>>,
  headers: string[]
): { mapping: ColumnMapping; combined: string[] } {
  const profiles = profileColumns(rows, headers);
  const mapping: ColumnMapping = {};
  const used = new Set<string>();
  const best = (score: (p: ColumnProfile) => number, floor: number): string | null => {
    let winner: ColumnProfile | null = null;
    for (const p of profiles) {
      if (used.has(p.col) || p.filled === 0) continue;
      const value = score(p);
      if (value < floor) continue;
      if (!winner || value > score(winner)) winner = p;
    }
    return winner ? winner.col : null;
  };

  const combined = profiles.filter((p) => p.combined >= 0.5 && p.gstin < 0.5).map((p) => p.col);
  combined.forEach((c) => used.add(c));

  const gstinCol = best((p) => p.gstin, 0.5);
  if (gstinCol) used.add(gstinCol);

  const dateCol = best((p) => p.date, 0.5);
  if (dateCol) used.add(dateCol);

  const invoiceCol = best((p) => p.invoiceLike, 0.4);
  if (invoiceCol) used.add(invoiceCol);

  // Amounts: the headings are still the best guide, so start from them and only
  // fill what they left unmapped.
  const headerMap = autoMapColumns(headers);
  for (const field of ['Taxable Value', 'Invoice Value', 'IGST', 'CGST', 'SGST', 'Cess', 'Total Tax'] as RecoField[]) {
    const fromHeader = headerMap[field];
    if (fromHeader && fromHeader !== NOT_MAPPED && !used.has(fromHeader)) {
      mapping[field] = fromHeader;
      used.add(fromHeader);
    }
  }

  const numericCols = profiles
    .filter((p) => p.numeric >= 0.5 && !used.has(p.col))
    .map((p) => p.col);

  if (!mapping['Taxable Value'] && numericCols.length > 0) {
    // The taxable value is the largest figure on the sheet, bar the invoice total.
    const avg = (col: string) => {
      const vals = rows.slice(0, 80).map((r) => toNumber(r?.[col])).filter((n) => n !== 0);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };
    const ranked = [...numericCols].sort((x, y) => avg(y) - avg(x));
    mapping['Taxable Value'] = ranked[0];
    used.add(ranked[0]);
  }
  if (!mapping['CGST'] && !mapping['SGST']) {
    const rest = numericCols.filter((c) => !used.has(c));
    if (rest.length >= 2) {
      mapping['CGST'] = rest[0];
      mapping['SGST'] = rest[1];
      used.add(rest[0]);
      used.add(rest[1]);
    }
  }
  if (!mapping['IGST']) {
    const rest = numericCols.filter((c) => !used.has(c));
    if (rest.length > 0) {
      mapping['IGST'] = rest[0];
      used.add(rest[0]);
    }
  }

  for (const field of RECO_FIELDS) {
    if (mapping[field]) continue;
    if (field === 'GSTIN' && gstinCol) mapping[field] = gstinCol;
    else if (field === 'Invoice No' && invoiceCol) mapping[field] = invoiceCol;
    else if (field === 'Invoice Date' && dateCol) mapping[field] = dateCol;
    else mapping[field] = headerMap[field] && headerMap[field] !== NOT_MAPPED && !used.has(headerMap[field])
      ? headerMap[field]
      : NOT_MAPPED;
    if (mapping[field] !== NOT_MAPPED) used.add(mapping[field]);
  }

  return { mapping, combined };
}

/**
 * Split every "GSTIN/INV-101" column into two derived columns and return the
 * widened header list, so the rest of the app only ever sees one field per cell.
 */
export function splitCombinedColumns(
  rows: Array<Record<string, any>>,
  headers: string[],
  combined: string[]
): { rows: Array<Record<string, any>>; headers: string[] } {
  if (combined.length === 0) return { rows, headers };
  const extra: string[] = [];
  for (const col of combined) {
    extra.push(`${col} \u00b7 GSTIN`, `${col} \u00b7 Invoice No`);
  }
  const next = rows.map((row) => {
    const out: Record<string, any> = { ...row };
    for (const col of combined) {
      const split = splitGstinInvoice(row?.[col]);
      out[`${col} \u00b7 GSTIN`] = split ? split.gstin : '';
      out[`${col} \u00b7 Invoice No`] = split ? split.invoice : '';
    }
    return out;
  });
  return { rows: next, headers: [...headers, ...extra] };
}

export function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return isFinite(value) ? value : 0;
  let s = String(value).replace(/,/g, '').replace(/\u20b9/g, '').replace(/\u00a0/g, ' ').trim();
  if (BLANKS.indexOf(s.toLowerCase()) !== -1) return 0;
  const negative = /^\(.*\)$/.test(s);
  if (negative) s = s.slice(1, -1);
  const n = parseFloat(s.replace(/[^0-9eE+\-.]/g, ''));
  if (!isFinite(n)) return 0;
  return negative ? -n : n;
}

export function normalizeInvoice(value: unknown): string {
  if (value === null || value === undefined) return '';
  const raw = String(value).trim();
  if (!raw || BLANKS.indexOf(raw.toLowerCase()) !== -1) return '';
  // Spec step 2: spaces, special characters and leading zeros are not part of
  // the bill, so INV/26-27/001, inv 26 27 001 and 0012627001 all compare equal.
  const cleaned = raw.replace(/[^A-Za-z0-9]+/g, '').toUpperCase();
  const trimmed = cleaned.replace(/^0+/, '');
  return trimmed || cleaned;
}

const pad2 = (n: number) => (n < 10 ? '0' : '') + n;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/** Day-first parsing, matching the original pandas dayfirst=True behaviour. */
export function parseDateValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date && !isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }
  if (typeof value === 'number' && isFinite(value)) {
    if (value > 20000 && value < 80000) {
      const d = new Date(Math.round((value - 25569) * 86400000));
      if (!isNaN(d.getTime())) {
        return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
      }
    }
    return '';
  }
  const s = String(value).trim();
  if (!s || BLANKS.indexOf(s.toLowerCase()) !== -1) return '';

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${pad2(+iso[2])}-${pad2(+iso[3])}`;

  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (dmy) {
    let day = +dmy[1];
    const mon = +dmy[2];
    let yr = +dmy[3];
    if (yr < 100) yr += yr < 70 ? 2000 : 1900;
    if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31) return `${yr}-${pad2(mon)}-${pad2(day)}`;
  }

  const named = s.match(/^(\d{1,2})[\-\s]([A-Za-z]{3,9})[\-\s](\d{2,4})$/);
  if (named) {
    const m2 = MONTHS[named[2].slice(0, 3).toLowerCase()];
    let y2 = +named[3];
    if (y2 < 100) y2 += y2 < 70 ? 2000 : 1900;
    if (m2) return `${y2}-${pad2(m2)}-${pad2(+named[1])}`;
  }

  const fallback = new Date(s);
  if (!isNaN(fallback.getTime())) {
    return `${fallback.getFullYear()}-${pad2(fallback.getMonth() + 1)}-${pad2(fallback.getDate())}`;
  }
  return '';
}

function cleanText(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  return BLANKS.indexOf(s.toLowerCase()) !== -1 ? '' : s;
}


/* ------------------------------------------------------------------ *
 * File types and reconciliation pairs (mirrors the source app's
 * "File type / source" and "Reconciliation" dropdowns)
 * ------------------------------------------------------------------ */

export type FileType =
  | 'GSTR-2A'
  | 'GSTR-2B'
  | 'GSTR-1'
  | 'BOOKS-PURCHASE'
  | 'BOOKS-SALES'
  | 'GSTR-3B';

export interface FileTypeOption {
  /** Internal type stored on every imported row. */
  type: FileType;
  /** Label shown in the dropdown, same wording as the source app. */
  label: string;
  /** True for the books side (Tally registers). */
  books: boolean;
  /** Summary files carry no invoice rows, so no invoice mapping is needed. */
  summary?: boolean;
}

export const FILE_TYPES: FileTypeOption[] = [
  { type: 'GSTR-2A', label: 'GSTR-2A', books: false },
  { type: 'GSTR-2B', label: 'GSTR-2B', books: false },
  { type: 'GSTR-1', label: 'GSTR-1', books: false },
  { type: 'BOOKS-PURCHASE', label: 'Books - Purchase Register', books: true },
  { type: 'BOOKS-SALES', label: 'Books - Sales Register', books: true },
  { type: 'GSTR-3B', label: 'GSTR-3B', books: false, summary: true },
];

export interface RecoPair {
  id: '2A-purchase' | '2B-purchase' | '1-sales';
  label: string;
  portal: FileType;
  books: FileType;
}

export const RECO_PAIRS: RecoPair[] = [
  { id: '2A-purchase', label: 'GSTR-2A vs Books Purchase', portal: 'GSTR-2A', books: 'BOOKS-PURCHASE' },
  { id: '2B-purchase', label: 'GSTR-2B vs Books Purchase', portal: 'GSTR-2B', books: 'BOOKS-PURCHASE' },
  { id: '1-sales', label: 'GSTR-1 vs Books Sales', portal: 'GSTR-1', books: 'BOOKS-SALES' },
];

export function findPair(id: string): RecoPair {
  return RECO_PAIRS.find((p) => p.id === id) || RECO_PAIRS[1];
}

export function fileTypeOption(type: FileType): FileTypeOption {
  return FILE_TYPES.find((f) => f.type === type) || FILE_TYPES[1];
}

/** Which books register a reconciliation pair expects. */
export function expectedBooksLabel(pair: RecoPair): string {
  return fileTypeOption(pair.books).label;
}

/* ------------------------------------------------------------------ *
 * Period filtering: the portal side is filtered by return period, the
 * books side by invoice date - exactly as the source app does it.
 * ------------------------------------------------------------------ */

export function monthPeriods(startISO: string, endISO: string): string[] {
  const s = startISO.split('-').map(Number);
  const e = endISO.split('-').map(Number);
  let y = s[0];
  let m = s[1];
  const out: string[] = [];
  while (y < e[0] || (y === e[0] && m <= e[1])) {
    out.push(`${pad2(m)}${y}`);
    if (m === 12) {
      y += 1;
      m = 1;
    } else m += 1;
    if (out.length > 240) break;
  }
  return out;
}

/** Return periods arrive as MMYYYY, 042026, Apr-2026, 2026-04 ... */
export function periodToMmyyyy(value: unknown): string {
  const s = String(value ?? '').trim();
  if (!s) return '';
  const digits = s.replace(/[^0-9]/g, '');
  if (/^\d{6}$/.test(digits)) {
    const mm = Number(digits.slice(0, 2));
    const yyyy = Number(digits.slice(2));
    if (mm >= 1 && mm <= 12 && yyyy > 1900) return digits;
    const mm2 = Number(digits.slice(4));
    const yyyy2 = Number(digits.slice(0, 4));
    if (mm2 >= 1 && mm2 <= 12 && yyyy2 > 1900) return `${pad2(mm2)}${yyyy2}`;
  }
  const named = s.match(/([A-Za-z]{3,9})[\s\-/]*([0-9]{4})/);
  if (named) {
    const m = MONTHS[named[1].slice(0, 3).toLowerCase()];
    if (m) return `${pad2(m)}${named[2]}`;
  }
  const iso = s.match(/([0-9]{4})-([0-9]{2})/);
  if (iso) return `${iso[2]}${iso[1]}`;
  return '';
}

/**
 * Keep the rows that belong to the reporting window.
 * Books: invoice date inside the window.
 * Portal: return period inside the window, falling back to invoice date when
 * the file carries no return period column.
 */
export function filterRowsForPeriod(
  rows: StandardRow[],
  type: FileType,
  startISO: string,
  endISO: string
): StandardRow[] {
  if (!startISO || !endISO || !rows.length) return rows;
  const option = fileTypeOption(type);
  const inWindow = (d: string) => !!d && d >= startISO && d <= endISO;

  if (option.books) return rows.filter((r) => inWindow(String(r['Invoice Date'] || '')));

  const periods = new Set(monthPeriods(startISO, endISO));
  const hasReturnPeriod = rows.some((r) => String(r['Return Period'] || '').trim() !== '');
  if (!hasReturnPeriod) return rows.filter((r) => inWindow(String(r['Invoice Date'] || '')));

  return rows.filter((r) => {
    const period = periodToMmyyyy(r['Return Period']);
    if (period) return periods.has(period);
    return inWindow(String(r['Invoice Date'] || ''));
  });
}

/** Column that carries the portal return period, if the file has one. */
const RETURN_PERIOD_ALIASES = ['return period', 'tax period', 'rtnprd', 'period', 'return month', 'taxperiod'];

export function detectReturnPeriodColumn(headers: string[]): string {
  const normalized = headers.map((h) => ({ col: h, nc: normCol(h) }));
  for (const alias of RETURN_PERIOD_ALIASES.map(normCol)) {
    const hit = normalized.find((n) => n.nc === alias);
    if (hit) return hit.col;
  }
  return '';
}

export interface StandardRow extends Record<string, any> {
  'Invoice Key': string;
}

export interface StandardizeContext {
  gstin?: string;
  period?: string;
  returnType?: string;
  sourceName?: string;
  /** Column holding the portal return period (MMYYYY), if the file has one. */
  returnPeriodColumn?: string;
}

/** Turn raw source rows into the standard invoice schema. */
export function standardize(
  rows: Array<Record<string, any>>,
  mapping: ColumnMapping,
  ctx: StandardizeContext = {}
): StandardRow[] {
  return (rows || []).map((row) => {
    const out: Record<string, any> = {};
    for (const field of RECO_FIELDS) {
      const col = mapping[field];
      const raw = col && col !== NOT_MAPPED ? row?.[col] : '';
      out[field] = TEXT_FIELDS.includes(field) ? cleanText(raw) : toNumber(raw);
    }
    out['GSTIN'] = String(out['GSTIN'] || '').toUpperCase();
    const dateCol = mapping['Invoice Date'];
    out['Invoice Date'] = parseDateValue(dateCol && dateCol !== NOT_MAPPED ? row?.[dateCol] : '');

    const taxSum = out['IGST'] + out['CGST'] + out['SGST'] + out['Cess'];
    if (out['Total Tax'] === 0 && taxSum !== 0) out['Total Tax'] = taxSum;

    out['Invoice Key'] = normalizeInvoice(out['Invoice No']);
    if (ctx.returnPeriodColumn) {
      out['Return Period'] = cleanText(row?.[ctx.returnPeriodColumn]);
    }
    out['App GSTIN'] = ctx.gstin || '';
    out['Period'] = ctx.period || '';
    out['Return Type'] = ctx.returnType || '';
    out['Source File'] = ctx.sourceName || '';
    return out as StandardRow;
  });
}

export type RecoStatus = 'Match' | 'Possible Match' | 'Mismatch' | 'Not in Books' | 'Not in 2B';

/**
 * One row of the output table, in the order the spec asks for it:
 * GSTIN, Invoice No, Date, Total (Books), Total (2B), Status, Note.
 */
export interface RecoRow extends Record<string, any> {
  GSTIN: string;
  'Invoice No': string;
  Date: string;
  'Total (Books)': number;
  'Total (2B)': number;
  Status: RecoStatus;
  Note: string;
  /** Which row of the priority table produced this verdict (0 = no pair). */
  'Match Rule': number;
  'Invoice Key': string;
}

interface Agg {
  id: string;
  key: string;
  /** The invoice number as the file printed it, for display. */
  label: string;
  gstin: string;
  dates: Set<string>;
  values: Record<string, number>;
}

const money = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

interface Flags {
  gstin: boolean;
  invoice: boolean;
  date: boolean;
  taxable: boolean;
  invoiceValue: boolean;
  tax: boolean;
  allValues: boolean;
}

/**
 * Matching runs down the priority table, not on a single key. A pair is a Match
 * when at least one of GSTIN and invoice no agrees and the amount agrees; the
 * date never decides a status, it only shows up in the Reason column. Each pair
 * is scored by the first rule its flags satisfy, strongest first:
 *
 *  1  GSTIN + invoice no + date + amount            -> Match
 *  2  GSTIN + invoice no + amount, date differs     -> Match
 *  3  GSTIN + date + amount, invoice no differs     -> Match
 *  4  invoice no + date + amount, GSTIN differs     -> Match
 *  5  GSTIN + amount, invoice no and date differ    -> Match
 *  6  invoice no + amount, GSTIN and date differ    -> Match
 *  7  neither GSTIN nor invoice no same             -> no pair (even if the date
 *                                                      is the same)
 *  8  GSTIN or invoice no same, amount differs      -> Mismatch
 *  9  neither GSTIN nor invoice no same, amount off -> no pair
 *
 * Amount means taxable value and total tax (IGST + CGST + SGST + Cess) within
 * the tolerance, plus the invoice value when the file carries it. Tax is compared
 * as a total, not head by head: a supplier who filed IGST where the books have
 * CGST + SGST has still billed the same amount, so that pair is a Match with a
 * GSTIN mismatch, not a Mismatch.
 */
const taxTotal = (x: Agg) =>
  ['IGST', 'CGST', 'SGST', 'Cess'].reduce((s, h) => s + (Number(x.values[h]) || 0), 0);

function flagsOf(a: Agg, b: Agg, close: (x: number, y: number) => boolean): Flags {
  const datesA = Array.from(a.dates).sort().join(',');
  const datesB = Array.from(b.dates).sort().join(',');
  const taxable = close(a.values['Taxable Value'], b.values['Taxable Value']);
  // Amount = Taxable + CGST + SGST + IGST, so the tax total is what counts, not
  // the head split.
  const tax = close(taxTotal(a), taxTotal(b));

  // Invoice Value is derived from taxable + tax when the file does not carry it,
  // so a tax difference would always look like an invoice-value difference too.
  // Only treat it as its own mismatch when everything else already agrees.
  const invoiceValue =
    close(a.values['Invoice Value'], b.values['Invoice Value']) || !(taxable && tax);

  return {
    gstin: a.gstin === b.gstin,
    invoice: a.key === b.key,
    date: datesA === datesB,
    taxable,
    invoiceValue,
    tax,
    allValues: taxable && invoiceValue && tax,
  };
}

/** Priority of a candidate pair: 1-8 from the table, or 0 when there is no pair. */
function ruleOf(f: Flags): number {
  const keyed = f.gstin || f.invoice;

  if (keyed && f.allValues) {
    if (f.gstin && f.invoice) return f.date ? 1 : 2;
    if (f.gstin) return f.date ? 3 : 4;
    return f.date ? 5 : 6;
  }

  // Row 8: one key agrees but the amount does not.
  if (keyed) return 8;

  // Row 7: the amount agrees but neither GSTIN nor invoice no does.
  if (f.allValues) return 7;

  return 0;
}

/**
 * Rule order for pairing, strongest first. A key match with a wrong amount (8)
 * is tried before an amount-only coincidence (7): a supplier's own bill number
 * is stronger evidence than two invoices that happen to add up to the same
 * figure, so the real exception is not hidden behind a guess.
 */
const RULE_ORDER = [1, 2, 3, 4, 5, 6, 8, 7];

const STATUS_BY_RULE: Record<number, RecoStatus> = {
  1: 'Match',
  2: 'Match',
  3: 'Match',
  4: 'Match',
  5: 'Match',
  6: 'Match',
  7: 'Possible Match',
  8: 'Mismatch',
};

/** One-line reason for every row of the priority table, so the Reason column
 * never falls back to a blank cell for a rule the app can produce. */
export const RULE_REASON: Record<number, string> = {
  0: 'No pair',
  1: 'GSTIN, invoice no, date and amount match',
  2: 'GSTIN, invoice no and amount match - date mismatch',
  3: 'GSTIN, date and amount match - invoice no mismatch',
  4: 'GSTIN and amount match - invoice no and date mismatch',
  5: 'Invoice no, date and amount match - GSTIN mismatch',
  6: 'Invoice no and amount match - GSTIN and date mismatch',
  7: 'Amount matches - GSTIN and invoice no both differ',
  8: 'Amount mismatch - GSTIN or invoice no matches',
};

const inr = (v: number) =>
  `\u20b9${money(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const datesOf = (x: Agg) => Array.from(x.dates).sort().join(', ') || 'not given';

/**
 * Reason for a matched pair: the rule's headline plus the actual values that
 * were compared, so the reviewer can see the evidence without opening both
 * files. A rule 1 pair whose dates differ says so, because the priority table
 * has no row for it.
 */
function pairReason(
  rule: number,
  f: Flags,
  a: Agg,
  b: Agg,
  close: (x: number, y: number) => boolean
): string {
  const parts: string[] = [RULE_REASON[rule] || 'Matched outside the priority table'];
  const gap = (h: string) => Math.abs((Number(a.values[h]) || 0) - (Number(b.values[h]) || 0));

  // A Possible Match rests on the amount alone, so name both sides.
  if (rule === 7) {
    parts.push(`portal ${a.gstin || '-'} / ${a.label || '-'} vs books ${b.gstin || '-'} / ${b.label || '-'}`);
  }

  // A mismatch says which of Taxable / Inv Value / Tax is off, and by how much,
  // so the reviewer does not have to compare two files column by column.
  if (rule === 8) {
    if (!f.taxable) {
      parts.push(
        `taxable by ${inr(gap('Taxable Value'))} (portal ${inr(a.values['Taxable Value'])} vs books ${inr(b.values['Taxable Value'])})`
      );
    }
    if (!f.tax) {
      parts.push(
        `tax by ${inr(Math.abs(taxTotal(a) - taxTotal(b)))} (portal ${inr(taxTotal(a))} vs books ${inr(taxTotal(b))})`
      );
    }
    if (f.taxable && f.tax && !f.invoiceValue) {
      parts.push(`invoice value by ${inr(gap('Invoice Value'))}`);
    }
  }

  return parts.join(' \u00b7 ');
}

export function compareFrames(
  portal: StandardRow[],
  books: StandardRow[],
  tolerance = 0
): RecoRow[] {
  const close = (x: number, y: number) => Math.abs((Number(x) || 0) - (Number(y) || 0)) <= tolerance;

  const aggregate = (rows: StandardRow[], side: 'p' | 'b'): Map<string, Agg> => {
    const map = new Map<string, Agg>();
    for (const r of rows) {
      const key = String(r['Invoice Key'] || '').trim().toUpperCase();
      if (!key) continue;
      const gstin = String(r['GSTIN'] || '').trim().toUpperCase();
      const date = String(r['Invoice Date'] || '').trim(); // already ISO, so 05-04-2026 and 2026-04-05 agree
      const id = `${side}:${key}\u0001${gstin}`;
      let acc = map.get(id);
      if (!acc) {
        const values: Record<string, number> = {};
        for (const f of VALUE_FIELDS) values[f] = 0;
        acc = {
          id,
          key,
          label: String(r['Invoice No'] ?? key).trim() || key,
          gstin,
          dates: new Set<string>(),
          values,
        };
        map.set(id, acc);
      }
      if (date) acc.dates.add(date);
      for (const f of VALUE_FIELDS) acc.values[f] += Number(r[f]) || 0;
    }
    return map;
  };

  const left = aggregate(portal, 'p');
  const right = aggregate(books, 'b');

  // Indexes so the priority scan does not compare every row with every row.
  const booksByGstinInvoice = new Map<string, Agg[]>();
  const booksByInvoice = new Map<string, Agg[]>();
  const booksByGstin = new Map<string, Agg[]>();
  const push = (m: Map<string, Agg[]>, k: string, v: Agg) => {
    const list = m.get(k);
    if (list) list.push(v);
    else m.set(k, [v]);
  };
  const byKey = new Map<string, Agg>();
  for (const b of right.values()) {
    byKey.set(`${b.gstin}\u0001${b.key}`, b);
    push(booksByGstinInvoice, `${b.gstin}\u0001${b.key}`, b);
    push(booksByInvoice, b.key, b);
    push(booksByGstin, b.gstin, b);
  }

  // Amount index, so a Possible Match can find an invoice with the same total
  // without scanning every row. Total = taxable + tax, rounded to the rupee.
  const booksByAmount = new Map<number, Agg[]>();
  const amountOf = (x: Agg) => Math.round((x.values['Taxable Value'] || 0) + taxTotal(x));
  for (const b of right.values()) {
    const k = amountOf(b);
    const list = booksByAmount.get(k);
    if (list) list.push(b);
    else booksByAmount.set(k, [b]);
  }

  const usedBooks = new Set<string>();
  const usedPortal = new Set<string>();
  const pairs: Array<{ a: Agg; b: Agg; rule: number }> = [];

  const candidatesFor = (a: Agg): Agg[] => {
    const seen = new Set<string>();
    const out: Agg[] = [];
    const add = (list?: Agg[]) => {
      for (const b of list || []) {
        if (b.id === a.id || usedBooks.has(b.id) || seen.has(b.id)) continue;
        seen.add(b.id);
        out.push(b);
      }
    };
    add(booksByGstinInvoice.get(`${a.gstin}\u0001${a.key}`));
    add(booksByInvoice.get(a.key));
    add(booksByGstin.get(a.gstin));
    // Within the tolerance, so probe the rupee either side too.
    const k = amountOf(a);
    add(booksByAmount.get(k - 1));
    add(booksByAmount.get(k));
    add(booksByAmount.get(k + 1));
    return out;
  };

  // Rule 4 of the sheet: when a row has more than one candidate at the same rule,
  // pair it with the one whose invoice value and date are closest.
  const dayGap = (x: Set<string>, y: Set<string>) => {
    const toDay = (d: string) => {
      const t = Date.parse(`${d}T00:00:00Z`);
      return isNaN(t) ? null : t;
    };
    let best = Number.MAX_SAFE_INTEGER;
    for (const dx of x) {
      const tx = toDay(dx);
      if (tx === null) continue;
      for (const dy of y) {
        const ty = toDay(dy);
        if (ty === null) continue;
        best = Math.min(best, Math.abs(tx - ty) / 86400000);
      }
    }
    return best;
  };

  const closeness = (a: Agg, b: Agg): [number, number] => [
    Math.abs((Number(a.values['Invoice Value']) || 0) - (Number(b.values['Invoice Value']) || 0)),
    dayGap(a.dates, b.dates),
  ];

  const bestCandidate = (a: Agg, rule: number): Agg | undefined => {
    let winner: Agg | undefined;
    let bestScore: [number, number] | null = null;
    for (const b of candidatesFor(a)) {
      if (usedBooks.has(b.id)) continue;
      if (ruleOf(flagsOf(a, b, close)) !== rule) continue;
      const s = closeness(a, b);
      if (!bestScore || s[0] < bestScore[0] || (s[0] === bestScore[0] && s[1] < bestScore[1])) {
        bestScore = s;
        winner = b;
      }
    }
    return winner;
  };

  // Strongest rule first, across every row: a weak rule (say 6, same GSTIN but a
  // different bill number) must never take the books row that rule 1 would have
  // matched exactly. One row per pair, so nothing is matched twice.
  for (const rule of RULE_ORDER) {
    for (const a of left.values()) {
      if (usedPortal.has(a.id)) continue;
      const candidate = bestCandidate(a, rule);
      if (!candidate) continue;
      usedPortal.add(a.id);
      usedBooks.add(candidate.id);
      pairs.push({ a, b: candidate, rule });
    }
  }

  // Reciprocal sweep: a books row gets its turn against whatever portal rows are
  // still free, best rule first.
  for (const rule of RULE_ORDER) {
    for (const b of right.values()) {
      if (usedBooks.has(b.id)) continue;
      let match: Agg | undefined;
      let bestScore: [number, number] | null = null;
      for (const a of left.values()) {
        if (usedPortal.has(a.id)) continue;
        if (ruleOf(flagsOf(a, b, close)) !== rule) continue;
        const s = closeness(a, b);
        if (!bestScore || s[0] < bestScore[0] || (s[0] === bestScore[0] && s[1] < bestScore[1])) {
          bestScore = s;
          match = a;
        }
      }
      if (!match) continue;
      usedPortal.add(match.id);
      usedBooks.add(b.id);
      pairs.push({ a: match, b, rule });
    }
  }

  const firstDate = (x?: Agg) => (x ? Array.from(x.dates).sort()[0] || '' : '');
  const totalOf = (x?: Agg) => (x ? money((x.values['Taxable Value'] || 0) + taxTotal(x)) : 0);

  /** The output row: the seven columns the spec asks for, in that order. */
  const rowOf = (
    a: Agg | undefined,
    b: Agg | undefined,
    status: RecoStatus,
    rule: number,
    note: string
  ): RecoRow => ({
    GSTIN: a?.gstin || b?.gstin || '',
    'Invoice No': a?.label || b?.label || '',
    Date: firstDate(a) || firstDate(b),
    'Total (Books)': totalOf(b),
    'Total (2B)': totalOf(a),
    Status: status,
    Note: note,
    'Match Rule': rule,
    'Invoice Key': a?.key || b?.key || '',
  });

  const rows: RecoRow[] = pairs.map(({ a, b, rule }) =>
    rowOf(a, b, STATUS_BY_RULE[rule], rule, pairReason(rule, flagsOf(a, b, close), a, b, close))
  );

  for (const a of left.values()) {
    if (usedPortal.has(a.id)) continue;
    rows.push(rowOf(a, undefined, 'Not in Books', 0, 'No pair in Books'));
  }
  for (const b of right.values()) {
    if (usedBooks.has(b.id)) continue;
    rows.push(rowOf(undefined, b, 'Not in 2B', 0, 'No pair in 2B'));
  }

  const rank: Record<string, number> = {
    Mismatch: 0,
    'Possible Match': 1,
    'Not in Books': 2,
    'Not in 2B': 3,
    Match: 4,
  };
  rows.sort((x, y) => {
    const rx = rank[x.Status] ?? 9;
    const ry = rank[y.Status] ?? 9;
    if (rx !== ry) return rx - ry;
    const k = String(x['Invoice Key']).localeCompare(String(y['Invoice Key']));
    return k !== 0 ? k : String(x.GSTIN).localeCompare(String(y.GSTIN));
  });

  return rows;
}

/** Rows that need a human look: everything that is not a clean match. */
export function exceptionRows(rows: RecoRow[]): RecoRow[] {
  return rows.filter((r) => r.Status !== 'Match');
}

export interface RecoSummary {
  matched: number;
  possible: number;
  mismatch: number;
  onlyPortal: number;
  onlyBooks: number;
  portalTaxable: number;
  booksTaxable: number;
}

export function summarize(rows: RecoRow[]): RecoSummary {
  const sum = (col: 'Total (2B)' | 'Total (Books)') =>
    rows.reduce((total, r) => total + (Number(r[col]) || 0), 0);

  return {
    matched: rows.filter((r) => r.Status === 'Match').length,
    possible: rows.filter((r) => r.Status === 'Possible Match').length,
    mismatch: rows.filter((r) => r.Status === 'Mismatch').length,
    // "Not in Books" means the portal filed it and the books did not, and the
    // other way round for "Not in 2B".
    onlyPortal: rows.filter((r) => r.Status === 'Not in Books').length,
    onlyBooks: rows.filter((r) => r.Status === 'Not in 2B').length,
    portalTaxable: sum('Total (2B)'),
    booksTaxable: sum('Total (Books)'),
  };
}

/** The seven GSTR-3B particulars the original app compares. */
export const THREE_B_PARTICULARS = [
  { label: 'Outward taxable value', key: 'outward' },
  { label: 'IGST liability', key: 'igst' },
  { label: 'CGST liability', key: 'cgst' },
  { label: 'SGST/UTGST liability', key: 'sgst' },
  { label: 'Cess liability', key: 'cess' },
  { label: 'Eligible ITC', key: 'itc' },
  { label: 'RCM liability', key: 'rcm' },
] as const;

export interface ThreeBRow {
  Particulars: string;
  Portal: number;
  Books: number;
}

export function threeBRows(values: Record<string, { portal: number; books: number }>): Array<ThreeBRow & { Difference: number }> {
  return THREE_B_PARTICULARS.map((p) => {
    const v = values[p.key] || { portal: 0, books: 0 };
    return {
      Particulars: p.label,
      Portal: v.portal,
      Books: v.books,
      Difference: Math.round((v.books - v.portal) * 100) / 100,
    };
  });
}
