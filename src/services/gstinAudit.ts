/**
 * GSTIN audit for imported data.
 *
 * The sidebar only validates the company's own GSTIN. Counterparty GSTINs come
 * from whatever Excel or JSON the user uploads, and a single bad character
 * there quietly splits one party into two in the reconciliation. This service
 * scans every imported row, groups the GSTINs it finds and reports what is
 * wrong: wrong length, bad character, bad state code, bad PAN holder type or a
 * failed check digit. When an invalid GSTIN is one character away from a valid
 * GSTIN in the same import, it names that one as the likely intended value.
 */
import { GST_STATE_NAMES, GstinIssueCode, normalizeGstin, validateGstin } from './validation';

export interface GstinAuditSource {
  /** Human label for the file/section, e.g. "GSTR-2A.xlsx" or "Books". */
  label: string;
  rows: Array<Record<string, any>>;
}

export interface GstinAuditEntry {
  gstin: string;
  status: 'valid' | 'invalid';
  issue?: GstinIssueCode;
  /** A valid GSTIN from the same import that differs by one character. */
  suggestion?: string;
  stateCode: string;
  stateName: string;
  pan: string;
  rows: number;
  sources: string[];
}

export interface GstinAuditSummary {
  /** Rows scanned across all sources. */
  totalRows: number;
  /** Rows that carried a GSTIN value at all. */
  checkedRows: number;
  validRows: number;
  invalidRows: number;
  missingRows: number;
  unregisteredRows: number;
  /** Distinct GSTINs seen. */
  unique: number;
  /** Distinct GSTINs that failed a check. */
  invalid: number;
  entries: GstinAuditEntry[];
}

const GSTIN_KEY = /(gstin|ctin)/i;
const UNREGISTERED = /^(urp|unreg\.?|unregistered|not\s*registered)$/i;

/** First GSTIN-looking value on the row, whatever the sheet called the column. */
export function gstinValueOf(row: Record<string, any> | null | undefined): string {
  if (!row) return '';
  for (const key of Object.keys(row)) {
    if (!GSTIN_KEY.test(key)) continue;
    const value = row[key];
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

/** True when two 15-character GSTINs differ in exactly one position. */
function differsByOne(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      diff++;
      if (diff > 1) return false;
    }
  }
  return diff === 1;
}

export function auditGstins(sources: GstinAuditSource[]): GstinAuditSummary {
  const byGstin = new Map<string, { entry: GstinAuditEntry; sources: Set<string> }>();

  let totalRows = 0;
  let checkedRows = 0;
  let validRows = 0;
  let invalidRows = 0;
  let missingRows = 0;
  let unregisteredRows = 0;

  for (const source of sources) {
    for (const row of source.rows || []) {
      totalRows++;
      const raw = gstinValueOf(row);
      if (!raw) {
        missingRows++;
        continue;
      }
      if (UNREGISTERED.test(raw)) {
        unregisteredRows++;
        continue;
      }
      checkedRows++;

      const check = validateGstin(raw);
      if (check.status === 'valid') validRows++;
      else invalidRows++;

      const gstin = check.normalized || normalizeGstin(raw);
      const existing = byGstin.get(gstin);
      if (existing) {
        existing.entry.rows++;
        existing.sources.add(source.label);
        continue;
      }

      const stateCode = gstin.slice(0, 2);
      byGstin.set(gstin, {
        entry: {
          gstin,
          status: check.status === 'valid' ? 'valid' : 'invalid',
          issue: check.status === 'invalid' ? check.issue : undefined,
          stateCode,
          stateName: GST_STATE_NAMES[stateCode] || '',
          pan: gstin.length >= 12 ? gstin.slice(2, 12) : '',
          rows: 1,
          sources: [source.label],
        },
        sources: new Set([source.label]),
      });
    }
  }

  const entries = Array.from(byGstin.values()).map((v) => ({
    ...v.entry,
    sources: Array.from(v.sources),
  }));

  // One character off from a GSTIN that does check out: almost always the typo.
  const validList = entries.filter((e) => e.status === 'valid').map((e) => e.gstin);
  for (const entry of entries) {
    if (entry.status !== 'invalid' || entry.gstin.length !== 15) continue;
    entry.suggestion = validList.find((v) => differsByOne(v, entry.gstin));
  }

  entries.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'invalid' ? -1 : 1;
    return b.rows - a.rows;
  });

  return {
    totalRows,
    checkedRows,
    validRows,
    invalidRows,
    missingRows,
    unregisteredRows,
    unique: entries.length,
    invalid: entries.filter((e) => e.status === 'invalid').length,
    entries,
  };
}

const ISSUE_TEXT: Record<GstinIssueCode, string> = {
  length: 'Not 15 characters',
  charset: 'Contains characters other than A-Z / 0-9',
  pattern: 'Not in the GSTIN format (state + PAN + entity + Z + check digit)',
  pan: 'Invalid PAN holder type (4th PAN character)',
  state: 'Not a valid GST state code',
  checksum: 'Check digit does not match',
};

export function gstinIssueText(issue?: GstinIssueCode): string {
  return issue ? ISSUE_TEXT[issue] : '';
}

/** Flat rows for the audit table and the Excel "GSTIN Audit" sheet. */
export function gstinAuditRows(summary: GstinAuditSummary): Array<Record<string, any>> {
  if (!summary.entries.length) return [];
  return summary.entries.map((e) => ({
    GSTIN: e.gstin,
    Status: e.status === 'valid' ? 'Valid' : 'Invalid',
    'Issue Code': e.issue || '',
    Issue: gstinIssueText(e.issue),
    Suggestion: e.suggestion || '',
    State: e.stateName ? `${e.stateCode} - ${e.stateName}` : e.stateCode,
    PAN: e.pan,
    Rows: e.rows,
    Sources: e.sources.join(', '),
  }));
}
