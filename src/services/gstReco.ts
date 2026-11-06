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
  'IGST',
  'CGST',
  'SGST',
  'Cess',
  'Total Tax',
] as const;

export type RecoField = (typeof RECO_FIELDS)[number];

export const TEXT_FIELDS: RecoField[] = ['GSTIN', 'Party Name', 'Invoice No', 'Invoice Date', 'Invoice Type'];
export const VALUE_FIELDS: RecoField[] = ['Taxable Value', 'IGST', 'CGST', 'SGST', 'Cess', 'Total Tax'];

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

export interface StandardRow extends Record<string, any> {
  'Invoice Key': string;
}

export interface StandardizeContext {
  gstin?: string;
  period?: string;
  returnType?: string;
  sourceName?: string;
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
    out['App GSTIN'] = ctx.gstin || '';
    out['Period'] = ctx.period || '';
    out['Return Type'] = ctx.returnType || '';
    out['Source File'] = ctx.sourceName || '';
    return out as StandardRow;
  });
}

export type RecoStatus = 'Matched' | 'Only in Portal' | 'Only in Books' | `Value mismatch: ${string}`;

export interface RecoRow extends Record<string, any> {
  Status: RecoStatus;
  'Invoice Key': string;
  GSTIN: string;
}

/**
 * Aggregate each side by GSTIN + invoice number, then outer-join them.
 * Values are summed per invoice, so a multi-line invoice on either side still
 * compares cleanly.
 */
export function compareFrames(
  portal: StandardRow[],
  books: StandardRow[],
  tolerance = 0
): RecoRow[] {
  const aggregate = (rows: StandardRow[]) => {
    const map = new Map<string, Record<string, any>>();
    for (const r of rows) {
      const key = String(r['Invoice Key'] || '').trim().toUpperCase();
      if (!key) continue;
      const gstin = String(r['GSTIN'] || '').trim().toUpperCase();
      const id = `${key}\u0001${gstin}`;
      let acc = map.get(id);
      if (!acc) {
        acc = { 'Invoice Key': key, GSTIN: gstin };
        for (const f of VALUE_FIELDS) acc[f] = 0;
        map.set(id, acc);
      }
      for (const f of VALUE_FIELDS) acc[f] += Number(r[f]) || 0;
    }
    return map;
  };

  const left = aggregate(portal);
  const right = aggregate(books);
  const ids = new Set<string>([...left.keys(), ...right.keys()]);

  const out: RecoRow[] = [];
  for (const id of ids) {
    const a = left.get(id);
    const b = right.get(id);
    let status: string;
    if (a && !b) status = 'Only in Portal';
    else if (!a && b) status = 'Only in Books';
    else {
      const diffs = VALUE_FIELDS.filter((f) => Math.abs(a![f] - b![f]) > tolerance);
      status = diffs.length === 0 ? 'Matched' : `Value mismatch: ${diffs.join(', ')}`;
    }

    // Status first: the table scrolls sideways, and this is the column that
    // decides what the user does next.
    const row: Record<string, any> = {
      Status: status,
      'Invoice Key': (a || b)!['Invoice Key'],
      GSTIN: (a || b)!.GSTIN,
    };
    for (const f of VALUE_FIELDS) {
      row[`${f}_Portal`] = a ? a[f] : 0;
      row[`${f}_Books`] = b ? b[f] : 0;
    }
    out.push(row as RecoRow);
  }

  out.sort((x, y) => {
    const sx = x.Status === 'Matched' ? 1 : 0;
    const sy = y.Status === 'Matched' ? 1 : 0;
    if (sx !== sy) return sx - sy;
    return String(x['Invoice Key']).localeCompare(String(y['Invoice Key']));
  });
  return out;
}

/** Rows that need a human look: everything that is not a clean match. */
export function exceptionRows(rows: RecoRow[]): RecoRow[] {
  return rows.filter((r) => r.Status !== 'Matched');
}

export interface RecoSummary {
  portalInvoices: number;
  booksInvoices: number;
  matched: number;
  onlyPortal: number;
  onlyBooks: number;
  mismatched: number;
  portalTaxable: number;
  booksTaxable: number;
}

export function summarize(rows: RecoRow[]): RecoSummary {
  const sum = (side: 'Portal' | 'Books') =>
    rows.reduce((total, r) => total + (Number(r[`Taxable Value_${side}`]) || 0), 0);

  return {
    portalInvoices: rows.filter((r) => (Number(r['Taxable Value_Portal']) || 0) !== 0 || r.Status !== 'Only in Books').length,
    booksInvoices: rows.filter((r) => (Number(r['Taxable Value_Books']) || 0) !== 0 || r.Status !== 'Only in Portal').length,
    matched: rows.filter((r) => r.Status === 'Matched').length,
    onlyPortal: rows.filter((r) => r.Status === 'Only in Portal').length,
    onlyBooks: rows.filter((r) => r.Status === 'Only in Books').length,
    mismatched: rows.filter((r) => String(r.Status).startsWith('Value mismatch')).length,
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
