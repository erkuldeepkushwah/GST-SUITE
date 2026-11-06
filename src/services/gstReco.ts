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
  const s = String(value).replace(/\s+/g, '').trim().toUpperCase();
  return BLANKS.indexOf(s.toLowerCase()) !== -1 ? '' : s;
}

const pad2 = (n: number) => (n < 10 ? '0' : '') + n;

const money2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

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

    const invoiceValueCol = mapping['Invoice Value'];
    const fileInvoiceValue =
      invoiceValueCol && invoiceValueCol !== NOT_MAPPED ? toNumber(row?.[invoiceValueCol]) : 0;
    out['Invoice Value'] = money2(fileInvoiceValue || out['Taxable Value'] + out['Total Tax']);
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

export type RecoStatus = 'Matched' | 'Possible Match' | 'Mismatch' | 'Only in Portal' | 'Only in Books';

/** Every field that is compared, in the order it is reported. */
export const MATCH_FIELDS = [
  'GSTIN',
  'Bill No',
  'Taxable Value',
  'Invoice Value',
  'CGST',
  'SGST',
  'IGST',
] as const;

export type MatchField = (typeof MATCH_FIELDS)[number];

export interface RecoRow extends Record<string, any> {
  Status: RecoStatus;
  'Mismatch Reason': string;
  'Invoice Key': string;
  GSTIN: string;
}

export interface CompareOptions {
  /**
   * Also require the invoice date to agree before calling two rows a match.
   * Off by default: GSTIN + bill number identifies an invoice, and a date
   * written differently on the two sides would otherwise break a real match.
   */
  matchOnDate?: boolean;
}

interface Agg {
  id: string;
  key: string;
  gstin: string;
  dates: Set<string>;
  values: Record<string, number>;
}

const money = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

interface FieldCheck {
  /** Yes / No per field, for the field-wise status columns. */
  flags: Record<MatchField, 'Yes' | 'No'>;
  /** Every field that does not agree, as "GSTIN mismatch" etc. */
  reasons: string[];
  /** True when the only difference is the GSTIN. */
  gstinOnly: boolean;
  allMatch: boolean;
}

/**
 * Compare two aggregated invoices field by field. Nothing is inferred from a
 * single field: each of GSTIN, bill number, taxable value, invoice value and
 * the three tax components is checked on its own and reported on its own.
 */
function checkFields(
  a: Agg,
  b: Agg,
  close: (x: number, y: number) => boolean,
  matchOnDate: boolean
): FieldCheck & { dateOnly: boolean } {
  const flags: Record<MatchField, 'Yes' | 'No'> = {
    GSTIN: a.gstin === b.gstin ? 'Yes' : 'No',
    'Bill No': a.key === b.key ? 'Yes' : 'No',
    'Taxable Value': close(a.values['Taxable Value'], b.values['Taxable Value']) ? 'Yes' : 'No',
    'Invoice Value': close(a.values['Invoice Value'], b.values['Invoice Value']) ? 'Yes' : 'No',
    CGST: close(a.values['CGST'], b.values['CGST']) ? 'Yes' : 'No',
    SGST: close(a.values['SGST'], b.values['SGST']) ? 'Yes' : 'No',
    IGST: close(a.values['IGST'], b.values['IGST']) ? 'Yes' : 'No',
  };

  const reasons: string[] = [];
  for (const field of MATCH_FIELDS) {
    if (flags[field] === 'No') reasons.push(`${field} mismatch`);
  }
  // Cess is not one of the seven headline fields, but it must not be ignored.
  const cessDiffers = !close(a.values['Cess'], b.values['Cess']);
  if (cessDiffers) reasons.push('Cess mismatch');

  const datesDiffer =
    matchOnDate && Array.from(a.dates).sort().join(',') !== Array.from(b.dates).sort().join(',');
  if (datesDiffer) reasons.push('Date mismatch');

  const failed = MATCH_FIELDS.filter((f) => flags[f] === 'No');
  const gstinOnly = failed.length === 1 && failed[0] === 'GSTIN' && !cessDiffers && !datesDiffer;

  return {
    flags,
    reasons,
    gstinOnly,
    allMatch: reasons.length === 0,
    dateOnly: datesDiffer && failed.length === 0,
  };
}

/**
 * Field-wise reconciliation.
 *
 * Pass 1 joins on GSTIN + bill number (plus the date when asked for) and
 * compares every field on the joined pair.
 * Pass 2 offers the leftovers to each other only when a single identity field
 * differs (GSTIN, bill number or date) and all the money agrees - so a GSTIN
 * typed differently becomes a Possible Match, while a bill number that differs
 * is a Mismatch with the reason spelled out. Each row pairs at most once.
 * Anything still unpaired stays Only in.
 */
export function compareFrames(
  portal: StandardRow[],
  books: StandardRow[],
  tolerance = 0,
  options: CompareOptions = {}
): RecoRow[] {
  const matchOnDate = options.matchOnDate === true;
  const close = (x: number, y: number) => Math.abs((Number(x) || 0) - (Number(y) || 0)) <= tolerance;

  const aggregate = (rows: StandardRow[]): Map<string, Agg> => {
    const map = new Map<string, Agg>();
    for (const r of rows) {
      const key = String(r['Invoice Key'] || '').trim().toUpperCase();
      if (!key) continue;
      const gstin = String(r['GSTIN'] || '').trim().toUpperCase();
      const date = String(r['Invoice Date'] || '').trim();
      const id = matchOnDate ? `${key}\u0001${gstin}\u0001${date}` : `${key}\u0001${gstin}`;
      let acc = map.get(id);
      if (!acc) {
        const values: Record<string, number> = {};
        for (const f of VALUE_FIELDS) values[f] = 0;
        acc = { id, key, gstin, dates: new Set<string>(), values };
        map.set(id, acc);
      }
      if (date) acc.dates.add(date);
      for (const f of VALUE_FIELDS) acc.values[f] += Number(r[f]) || 0;
    }
    return map;
  };

  const left = aggregate(portal);
  const right = aggregate(books);

  const dateCells = (a?: Agg, b?: Agg) => {
    const portalDates = a ? Array.from(a.dates).sort() : [];
    const booksDates = b ? Array.from(b.dates).sort() : [];
    return {
      'Date (portal)': portalDates.join(', '),
      'Date (books)': booksDates.join(', '),
      'Date match': !a || !b ? '' : portalDates.join(',') === booksDates.join(',') ? 'Yes' : 'No',
    };
  };

  const valueCells = (a?: Agg, b?: Agg) => {
    const out: Record<string, any> = {};
    for (const f of VALUE_FIELDS) {
      out[`${f}_Portal`] = a ? money(a.values[f]) : 0;
      out[`${f}_Books`] = b ? money(b.values[f]) : 0;
    }
    return out;
  };

  const pairRow = (a: Agg, b: Agg, matchedWith: string): RecoRow => {
    const check = checkFields(a, b, close, matchOnDate);
    const status: RecoStatus = check.allMatch
      ? 'Matched'
      : check.gstinOnly
      ? 'Possible Match'
      : 'Mismatch';

    const row: Record<string, any> = {
      Status: status,
      'Mismatch Reason': check.reasons.join('; '),
      'Invoice Key': a.key,
      GSTIN: a.gstin,
      ...dateCells(a, b),
    };
    for (const field of MATCH_FIELDS) row[`${field} match`] = check.flags[field];
    row['Matched With'] = matchedWith;
    return { ...row, ...valueCells(a, b) } as RecoRow;
  };

  const oneSided = (a: Agg | undefined, b: Agg | undefined): RecoRow => {
    const row: Record<string, any> = {
      Status: a ? 'Only in Portal' : 'Only in Books',
      'Mismatch Reason': 'No pair found',
      'Invoice Key': (a || b)!.key,
      GSTIN: (a || b)!.gstin,
      ...dateCells(a, b),
    };
    for (const field of MATCH_FIELDS) row[`${field} match`] = '';
    row['Matched With'] = '';
    return { ...row, ...valueCells(a, b) } as RecoRow;
  };

  const rows: RecoRow[] = [];
  const portalOnly: Agg[] = [];
  const booksOnly: Agg[] = [];

  // ---------- pass 1: GSTIN + bill number ----------
  for (const id of new Set([...left.keys(), ...right.keys()])) {
    const a = left.get(id);
    const b = right.get(id);
    if (a && b) rows.push(pairRow(a, b, ''));
    else if (a) portalOnly.push(a);
    else if (b) booksOnly.push(b);
  }

  // ---------- pass 2: one identity field off, all money equal ----------
  const usedBooks = new Set<string>();
  const pairedPortal = new Set<string>();

  const moneyMatches = (a: Agg, b: Agg) => {
    const check = checkFields(a, b, close, matchOnDate);
    return MATCH_FIELDS.every((f) => f === 'GSTIN' || f === 'Bill No' || check.flags[f] === 'Yes')
      && close(a.values['Cess'], b.values['Cess']);
  };

  for (const a of portalOnly) {
    const candidate =
      // GSTIN differs, everything else agrees -> possible match
      booksOnly.find(
        (b) => !usedBooks.has(b.id) && b.key === a.key && b.gstin !== a.gstin && moneyMatches(a, b)
      ) ||
      // bill number differs, everything else agrees -> mismatch with the reason
      booksOnly.find(
        (b) => !usedBooks.has(b.id) && b.gstin === a.gstin && b.key !== a.key && moneyMatches(a, b)
      ) ||
      // date differs (only when the date is part of the key)
      (matchOnDate
        ? booksOnly.find(
            (b) =>
              !usedBooks.has(b.id) &&
              b.gstin === a.gstin &&
              b.key === a.key &&
              Array.from(a.dates).sort().join(',') !== Array.from(b.dates).sort().join(',') &&
              moneyMatches(a, b)
          )
        : undefined);

    if (!candidate) continue;
    usedBooks.add(candidate.id);
    pairedPortal.add(a.id);
    rows.push(pairRow(a, candidate, `${candidate.gstin} / ${candidate.key}`));
  }

  for (const a of portalOnly) if (!pairedPortal.has(a.id)) rows.push(oneSided(a, undefined));
  for (const b of booksOnly) if (!usedBooks.has(b.id)) rows.push(oneSided(undefined, b));

  const rank: Record<string, number> = {
    Mismatch: 0,
    'Possible Match': 1,
    'Only in Portal': 2,
    'Only in Books': 3,
    Matched: 4,
  };
  rows.sort((x, y) => {
    const rx = rank[x.Status] ?? 9;
    const ry = rank[y.Status] ?? 9;
    if (rx !== ry) return rx - ry;
    return String(x['Invoice Key']).localeCompare(String(y['Invoice Key']));
  });

  return rows;
}

/** Rows that need a human look: everything that is not a clean match. */
export function exceptionRows(rows: RecoRow[]): RecoRow[] {
  return rows.filter((r) => r.Status !== 'Matched');
}

export interface RecoSummary {
  matched: number;
  possible: number;
  mismatch: number;
  onlyPortal: number;
  onlyBooks: number;
  /** Matched on GSTIN + bill number, but the dates disagree. */
  dateMismatched: number;
  /** How many rows carry each field-level mismatch. */
  fieldMismatches: Record<string, number>;
  portalTaxable: number;
  booksTaxable: number;
}

export function summarize(rows: RecoRow[]): RecoSummary {
  const sum = (side: 'Portal' | 'Books') =>
    rows.reduce((total, r) => total + (Number(r[`Taxable Value_${side}`]) || 0), 0);

  const fieldMismatches: Record<string, number> = {};
  for (const field of MATCH_FIELDS) {
    fieldMismatches[field] = rows.filter((r) => r[`${field} match`] === 'No').length;
  }

  return {
    matched: rows.filter((r) => r.Status === 'Matched').length,
    possible: rows.filter((r) => r.Status === 'Possible Match').length,
    mismatch: rows.filter((r) => r.Status === 'Mismatch').length,
    onlyPortal: rows.filter((r) => r.Status === 'Only in Portal').length,
    onlyBooks: rows.filter((r) => r.Status === 'Only in Books').length,
    dateMismatched: rows.filter((r) => r['Date match'] === 'No').length,
    fieldMismatches,
    portalTaxable: sum('Portal'),
    booksTaxable: sum('Books'),
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
