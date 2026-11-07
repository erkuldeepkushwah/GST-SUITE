/**
 * Content-based column detection.
 *
 * Header names differ between a Tally export, a portal download and a
 * customer's own sheet ("Supplier GSTIN" / "GSTIN of Supplier" / "GSTIN/UIN of
 * Recipient" / no header at all). So instead of trusting the header, every
 * column is classified by what is actually in it: GSTINs look like GSTINs,
 * dates look like dates, amounts look like amounts.
 *
 * The detection is returned with a confidence and a sample so the UI can show
 * "Column C = GSTIN (98% of 120 rows)" and let the user override a weak guess.
 */

export type DetectedRole =
  | 'gstin'
  | 'invoice'
  | 'date'
  | 'taxable'
  | 'igst'
  | 'cgst'
  | 'sgst'
  | 'cess'
  | 'amount'
  | 'party'
  | 'gstin_invoice'
  | 'unknown';

export interface ColumnGuess {
  index: number;
  header: string;
  role: DetectedRole;
  /** Share of non-empty values that fitted the role, 0-1. */
  confidence: number;
  /** How many non-empty values were examined. */
  checked: number;
  sample: string[];
  /** Set when one cell carries both a GSTIN and a bill number. */
  split?: boolean;
}

export const GSTIN_RE = /^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const GSTIN_IN_TEXT = /([0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])/i;
const AMOUNT_RE = /^-?(?:₹|rs\.?|inr)?\s*\d{1,3}(?:,\d{2,3})*(?:\.\d+)?$|^-?(?:₹|rs\.?|inr)?\s*\d+(?:\.\d+)?$/i;

export const cleanGstin = (v: any): string =>
  String(v ?? '').replace(/\s+/g, '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();

/**
 * Comparison key for a bill number: spaces, punctuation and leading zeros are
 * dropped so "INV/001", "inv 1" and "0001" agree. The original value is kept
 * separately for display.
 */
export const invoiceKey = (v: any): string => {
  const raw = String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  // "INV/0001", "INV-001" and "inv 1" are the same bill number.
  return raw.replace(/([A-Z])0+(\d)/g, '$1$2').replace(/^0+(\d)/, '$1');
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Any of DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD, DD-MMM-YYYY or an Excel serial. */
export function toDisplayDate(v: any): string {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${pad(v.getDate())}-${pad(v.getMonth() + 1)}-${v.getFullYear()}`;
  }
  const raw = String(v).trim();
  if (!raw) return '';

  // Excel serial (days since 1899-12-30); guard the plausible range only.
  if (/^\d{4,6}(\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (serial > 20000 && serial < 80000) {
      const ms = Math.round((serial - 25569) * 86400000);
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
    }
  }

  let m = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return `${pad(+m[1])}-${pad(+m[2])}-${m[3]}`;

  m = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return `${pad(+m[3])}-${pad(+m[2])}-${m[1]}`;

  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  m = raw.match(/^(\d{1,2})[-/\s]([A-Za-z]{3,})[-/\s](\d{2,4})$/);
  if (m) {
    const mi = months.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mi >= 0) {
      const year = m[3].length === 2 ? `20${m[3]}` : m[3];
      return `${pad(+m[1])}-${pad(mi + 1)}-${year}`;
    }
  }
  m = raw.match(/^([A-Za-z]{3,})[-/\s](\d{1,2})[-/\s](\d{2,4})$/);
  if (m) {
    const mi = months.indexOf(m[1].slice(0, 3).toLowerCase());
    if (mi >= 0) {
      const year = m[3].length === 2 ? `20${m[3]}` : m[3];
      return `${pad(+m[2])}-${pad(mi + 1)}-${year}`;
    }
  }
  return '';
}

export const toAmount = (v: any): number => {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const cleaned = String(v).replace(/[₹,\s]/g, '').replace(/rs\.?|inr/gi, '').replace(/^\((.*)\)$/, '-$1');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
};

const isDateLike = (v: any) => toDisplayDate(v) !== '';
const isAmountLike = (v: any) => {
  const s = String(v ?? '').trim();
  if (!s) return false;
  return AMOUNT_RE.test(s.replace(/\s/g, '')) || typeof v === 'number';
};

/** "HDFC BANK LTD" / "Tata Steel Limited" - words, no digits. */
const isNameLike = (v: any) => {
  const s = String(v ?? '').trim();
  if (!s) return false;
  return /^[A-Za-z][A-Za-z .&()'\-]{2,}$/.test(s) && /[A-Za-z]{3,}/.test(s) && !/\d/.test(s);
};

/** "SPNS/34/26-27", "INV-001", "WC/26-27/3", "41000" - a bill number. */
const isInvoiceLike = (v: any) => {
  const s = String(v ?? '').trim();
  if (s.length < 2 || s.length > 40) return false;
  if (!/[A-Za-z0-9]/.test(s)) return false;
  if (isDateLike(s) || isAmountLike(s)) return false;
  if (GSTIN_RE.test(cleanGstin(s))) return false;
  if (isNameLike(s)) return false;
  const words = s.split(/\s+/).filter(Boolean).length;
  if (words > 3) return false;
  return /[A-Za-z]/.test(s) || /[-/]/.test(s) || /^\d{1,12}$/.test(s);
};

const HEADER_HINTS: Array<{ role: DetectedRole; re: RegExp }> = [
  { role: 'taxable', re: /taxable|assessable/i },
  { role: 'igst', re: /igst|integrated\s*tax/i },
  { role: 'cgst', re: /cgst|central\s*tax/i },
  { role: 'sgst', re: /sgst|utgst|state[\s/|]*(ut[\s/|]*)?tax/i },
  { role: 'cess', re: /cess/i },
  { role: 'gstin', re: /gstin|gst\s*in|uin/i },
  { role: 'invoice', re: /invoice|bill|voucher|note\s*(no|number)|doc\s*(no|number)/i },
  { role: 'date', re: /date|dt\b/i },
  { role: 'party', re: /party|supplier|receiver|name|trade|narration|particular/i },
];

const hintFor = (header: string): DetectedRole | null => {
  const hit = HEADER_HINTS.find((h) => h.re.test(header));
  return hit ? hit.role : null;
};

/**
 * Classify every column from its values. Headers are a hint, never the rule:
 * they settle ties (taxable vs CGST vs SGST, bill no vs party name) and can be
 * wrong or missing entirely.
 */
export function detectColumns(headers: string[], rows: Array<Array<any>>, sampleSize = 200): ColumnGuess[] {
  const width = headers.length;
  const sampleRows = rows
    .filter((r) => Array.isArray(r) && r.some((c) => c !== '' && c !== null && c !== undefined))
    .slice(0, sampleSize);

  const guesses: ColumnGuess[] = [];
  for (let c = 0; c < width; c++) {
    const values = sampleRows.map((r) => r[c]).filter((v) => v !== '' && v !== null && v !== undefined);
    const header = String(headers[c] ?? '').trim();
    const checked = values.length;
    const guess: ColumnGuess = {
      index: c,
      header,
      role: 'unknown',
      confidence: 0,
      checked,
      sample: values.slice(0, 3).map((v) => String(v)),
    };
    if (!checked) {
      guesses.push(guess);
      continue;
    }

    const share = (fn: (v: any) => boolean) => values.filter(fn).length / checked;
    const distinct = new Set(values.map((v) => String(v).trim())).size / checked;
    // 1, 2, 3 ... is a row number, not money
    const sequential =
      values.length >= 3 &&
      values.every((v, i) => /^\d+$/.test(String(v).trim()) && Number(v) === i + 1);

    const gstinShare = share((v) => GSTIN_RE.test(cleanGstin(v)));
    const combinedShare = share((v) => {
      const s = String(v);
      return GSTIN_IN_TEXT.test(s) && /[/\-| ]/.test(s.replace(GSTIN_IN_TEXT, ''));
    });
    const dateShare = share(isDateLike);
    const amountShare = share(isAmountLike);
    const invoiceShare = share(isInvoiceLike);
    const nameShare = share(isNameLike);
    const hint = hintFor(header);

    if (gstinShare >= 0.8) {
      guess.role = 'gstin';
      guess.confidence = gstinShare;
    } else if (combinedShare >= 0.5) {
      guess.role = 'gstin_invoice';
      guess.confidence = combinedShare;
      guess.split = true;
    } else if (dateShare >= 0.8) {
      guess.role = 'date';
      guess.confidence = dateShare;
    } else if (amountShare >= 0.85) {
      if (sequential) {
        guess.role = 'unknown';
      } else {
        const amountHint = hint && ['taxable', 'igst', 'cgst', 'sgst', 'cess'].includes(hint) ? hint : null;
        guess.role = amountHint || 'amount';
        guess.confidence = amountShare;
      }
    } else if (nameShare >= 0.7 && hint !== 'invoice') {
      guess.role = 'party';
      guess.confidence = nameShare;
    } else if (invoiceShare >= 0.6) {
      // bill numbers are short, distinct and carry a digit or a separator;
      // a name column passes the same test, so the hint and distinctness decide
      const score = invoiceShare * (hint === 'invoice' ? 1 : 0.6) * (0.5 + 0.5 * distinct);
      guess.role = 'invoice';
      guess.confidence = Math.min(1, score);
    } else if (nameShare >= 0.5) {
      guess.role = 'party';
      guess.confidence = nameShare;
    }
    guesses.push(guess);
  }

  // Only one invoice column and one party column survive: keep the strongest.
  const scoreOf = (g: ColumnGuess, role: DetectedRole) => {
    const hint = hintFor(g.header);
    let s = g.confidence;
    if (role === 'party') {
      if (hint === 'party') s += 0.5;
      if (hint === 'invoice') s -= 0.5;
    }
    if (role === 'invoice' && hint === 'invoice') s += 0.3;
    return s;
  };
  const keepBest = (role: DetectedRole, demoteTo: DetectedRole) => {
    const same = guesses.filter((g) => g.role === role);
    if (same.length <= 1) return;
    const best = same.reduce((a, b) => (scoreOf(b, role) > scoreOf(a, role) ? b : a));
    for (const g of same) if (g !== best) g.role = demoteTo;
  };
  keepBest('invoice', 'party');
  keepBest('party', 'unknown');
  keepBest('gstin', 'unknown');
  keepBest('date', 'unknown');

  // With no header naming the taxable column, the widest amount column is it.
  if (!guesses.some((g) => g.role === 'taxable')) {
    const amounts = guesses.filter((g) => g.role === 'amount');
    if (amounts.length) {
      const widest = amounts.reduce((a, b) => {
        const maxOf = (g: ColumnGuess) => Math.max(...g.sample.map((s) => Math.abs(toAmount(s))), 0);
        return maxOf(b) > maxOf(a) ? b : a;
      });
      widest.role = 'taxable';
    }
  }

  return guesses;
}

/** Split "07ABCDE1234F1Z5/INV-101" into its GSTIN and bill number. */
export function splitGstinInvoice(v: any): { gstin: string; invoice: string } {
  const s = String(v ?? '').trim();
  const m = s.match(GSTIN_IN_TEXT);
  if (!m) return { gstin: '', invoice: s };
  const gstin = m[1].toUpperCase();
  const rest = s.replace(m[0], '').replace(/^[\s/|\-:]+/, '').trim();
  return { gstin, invoice: rest };
}

export interface DetectedRow {
  GSTIN: string;
  'Invoice No': string;
  Date: string;
  Taxable: number;
  IGST: number;
  CGST: number;
  SGST: number;
  Cess: number;
  Total: number;
}

/** Turn raw rows into the standard shape using the detected columns. */
export function buildDetectedRows(
  rows: Array<Array<any>>,
  guesses: ColumnGuess[]
): DetectedRow[] {
  const pick = (role: DetectedRole) => guesses.find((g) => g.role === role);
  const gstinCol = pick('gstin');
  const combinedCol = pick('gstin_invoice');
  const invoiceCol = pick('invoice');
  const dateCol = pick('date');
  const taxableCol = pick('taxable');
  const amountCols = guesses.filter((g) => g.role === 'amount');
  const igstCol = pick('igst');
  const cgstCol = pick('cgst');
  const sgstCol = pick('sgst');
  const cessCol = pick('cess');

  const out: DetectedRow[] = [];
  for (const r of rows) {
    if (!Array.isArray(r) || !r.some((c) => c !== '' && c !== null && c !== undefined)) continue;
    let gstin = gstinCol ? cleanGstin(r[gstinCol.index]) : '';
    let invoice = invoiceCol ? String(r[invoiceCol.index] ?? '').trim() : '';
    if (combinedCol) {
      const parts = splitGstinInvoice(r[combinedCol.index]);
      gstin = gstin || parts.gstin;
      invoice = invoice || parts.invoice;
    }
    const taxable = taxableCol ? toAmount(r[taxableCol.index]) : amountCols.length ? toAmount(r[amountCols[0].index]) : 0;
    const igst = igstCol ? toAmount(r[igstCol.index]) : 0;
    const cgst = cgstCol ? toAmount(r[cgstCol.index]) : 0;
    const sgst = sgstCol ? toAmount(r[sgstCol.index]) : 0;
    const cess = cessCol ? toAmount(r[cessCol.index]) : 0;
    const date = dateCol ? toDisplayDate(r[dateCol.index]) : '';

    if (!gstin && !invoice) continue;
    const round2 = (n: number) => Math.round(n * 100) / 100;
    out.push({
      GSTIN: gstin,
      'Invoice No': invoice,
      Date: date,
      Taxable: round2(taxable),
      IGST: round2(igst),
      CGST: round2(cgst),
      SGST: round2(sgst),
      Cess: round2(cess),
      Total: round2(taxable + igst + cgst + sgst + cess),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Matching on detected content
 * ------------------------------------------------------------------ */

export type ContentStatus = 'Match' | 'Possible Match' | 'Mismatch' | 'Not in Books' | 'Not in 2B';

export interface ContentRow {
  GSTIN: string;
  'Invoice No': string;
  Date: string;
  'Total (Books)': number;
  'Total (2B)': number;
  Status: ContentStatus;
  Note: string;
}

export interface ContentSummary {
  match: number;
  possible: number;
  mismatch: number;
  notInBooks: number;
  notIn2B: number;
  matchAmount: number;
  mismatchAmount: number;
}

interface Agg {
  id: string;
  gstin: string;
  invoice: string;
  key: string;
  dates: Set<string>;
  total: number;
  rows: number;
}

const money2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const inr = (n: number) =>
  (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function aggregate(rows: DetectedRow[], side: 'b' | 'p'): Agg[] {
  const map = new Map<string, Agg>();
  for (const r of rows) {
    const key = invoiceKey(r['Invoice No']);
    const gstin = cleanGstin(r.GSTIN);
    if (!key && !gstin) continue;
    const id = `${side}:${gstin}\u0001${key}`;
    let acc = map.get(id);
    if (!acc) {
      acc = { id, gstin, invoice: r['Invoice No'], key, dates: new Set<string>(), total: 0, rows: 0 };
      map.set(id, acc);
    }
    if (r.Date) acc.dates.add(r.Date);
    acc.total += r.Total;
    acc.rows += 1;
  }
  return [...map.values()];
}

/**
 * Match on content: (GSTIN same OR invoice no same) AND total amount same.
 * The date is optional and only shows up in the note.
 *
 *  - both keys agree  -> strongest match
 *  - one key agrees   -> match ("GSTIN same" / "Invoice No same" in the note)
 *  - amount only      -> Possible Match (both keys differ)
 *  - key agrees, amount does not -> Mismatch
 *  - nothing agrees   -> Not in Books / Not in 2B
 */
export function compareByContent(
  booksRows: DetectedRow[],
  portalRows: DetectedRow[],
  tolerance = 1
): ContentRow[] {
  const books = aggregate(booksRows, 'b');
  const portal = aggregate(portalRows, 'p');
  const close = (x: number, y: number) => Math.abs(money2(x) - money2(y)) <= tolerance;

  const usedBooks = new Set<string>();
  const usedPortal = new Set<string>();

  const score = (b: Agg, p: Agg): number => {
    const gstin = b.gstin && p.gstin && b.gstin === p.gstin;
    const inv = b.key && p.key && b.key === p.key;
    const amount = close(b.total, p.total);
    if ((gstin || inv) && amount) return gstin && inv ? 1 : 2;   // match, both keys first
    if (amount) return 3;                                        // possible match
    if (gstin || inv) return 4;                                  // mismatch
    return 0;
  };

  const noteFor = (b: Agg, p: Agg, rank: number): string => {
    const gstinSame = b.gstin === p.gstin;
    const invSame = b.key === p.key;
    const dateSame = [...b.dates].sort().join(',') === [...p.dates].sort().join(',');
    const amountSame = close(b.total, p.total);
    const notes: string[] = [];
    if (rank === 3) notes.push('Amount matches, GSTIN and Invoice No both differ');
    if (!gstinSame) notes.push(`GSTIN different (${p.gstin || '-'} vs ${b.gstin || '-'})`);
    if (!invSame) notes.push(`Invoice No different (${p.invoice || '-'} vs ${b.invoice || '-'})`);
    if (!dateSame) notes.push(`Date different (${[...p.dates].sort().join(', ') || '-'} vs ${[...b.dates].sort().join(', ') || '-'})`);
    if (!amountSame) notes.push(`Amount diff ₹${inr(Math.abs(money2(b.total) - money2(p.total)))}`);
    return notes.join(' · ');
  };

  const rows: ContentRow[] = [];
  const push = (b: Agg | undefined, p: Agg | undefined, status: ContentStatus, note: string) => {
    rows.push({
      GSTIN: (p || b)!.gstin,
      'Invoice No': (p || b)!.invoice,
      Date: [...((p || b)!.dates)].sort().join(', '),
      'Total (Books)': b ? money2(b.total) : 0,
      'Total (2B)': p ? money2(p.total) : 0,
      Status: status,
      Note: note,
    });
  };

  // Strongest pairs first (both keys, then one key, then amount-only), so a
  // weak candidate never takes a row that a stronger one needed.
  for (const rank of [1, 2, 3, 4]) {
    for (const p of portal) {
      if (usedPortal.has(p.id)) continue;
      let best: Agg | undefined;
      for (const b of books) {
        if (usedBooks.has(b.id)) continue;
        if (score(b, p) !== rank) continue;
        best = b;
        break;
      }
      if (!best) continue;
      usedPortal.add(p.id);
      usedBooks.add(best.id);
      const status: ContentStatus = rank === 4 ? 'Mismatch' : rank === 3 ? 'Possible Match' : 'Match';
      push(best, p, status, noteFor(best, p, rank));
    }
  }

  // Reciprocal sweep: books -> 2B for whatever is left.
  for (const rank of [1, 2, 3, 4]) {
    for (const b of books) {
      if (usedBooks.has(b.id)) continue;
      let best: Agg | undefined;
      for (const p of portal) {
        if (usedPortal.has(p.id)) continue;
        if (score(b, p) !== rank) continue;
        best = p;
        break;
      }
      if (!best) continue;
      usedBooks.add(b.id);
      usedPortal.add(best.id);
      const status: ContentStatus = rank === 4 ? 'Mismatch' : rank === 3 ? 'Possible Match' : 'Match';
      push(b, best, status, noteFor(b, best, rank));
    }
  }

  for (const p of portal) if (!usedPortal.has(p.id)) push(undefined, p, 'Not in Books', 'No matching record in the books file');
  for (const b of books) if (!usedBooks.has(b.id)) push(b, undefined, 'Not in 2B', 'No matching record in the 2B/2A file');

  const rankOf: Record<string, number> = { Mismatch: 0, 'Possible Match': 1, 'Not in Books': 2, 'Not in 2B': 3, Match: 4 };
  rows.sort((x, y) => {
    const d = (rankOf[x.Status] ?? 9) - (rankOf[y.Status] ?? 9);
    return d !== 0 ? d : String(x['Invoice No']).localeCompare(String(y['Invoice No']));
  });
  return rows;
}

export function summarizeContent(rows: ContentRow[]): ContentSummary {
  const sum = (pred: (r: ContentRow) => boolean, side: 'Books' | '2B') =>
    rows.filter(pred).reduce((t, r) => t + (Number(r[`Total (${side})`]) || 0), 0);

  return {
    match: rows.filter((r) => r.Status === 'Match').length,
    possible: rows.filter((r) => r.Status === 'Possible Match').length,
    mismatch: rows.filter((r) => r.Status === 'Mismatch').length,
    notInBooks: rows.filter((r) => r.Status === 'Not in Books').length,
    notIn2B: rows.filter((r) => r.Status === 'Not in 2B').length,
    matchAmount: sum((r) => r.Status === 'Match', '2B'),
    mismatchAmount: sum((r) => r.Status === 'Mismatch', '2B'),
  };
}
