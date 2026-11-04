import { Period, PeriodMode } from '../types';

export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function asDate(val: any): Date {
  if (!val) return new Date();
  if (val instanceof Date) return isNaN(val.getTime()) ? new Date() : val;
  if (typeof val === 'number') {
    // Excel serial date (e.g. 45394 is in 2024)
    if (val > 25000 && val < 65000) {
      const ms = (val - 25569) * 86400 * 1000;
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d;
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? new Date() : d;
  }
  const s = String(val).trim();
  // Check ISO format YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    return new Date(parseInt(isoMatch[1], 10), parseInt(isoMatch[2], 10) - 1, parseInt(isoMatch[3], 10));
  }
  // Check DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmyMatch) {
    return new Date(parseInt(dmyMatch[3], 10), parseInt(dmyMatch[2], 10) - 1, parseInt(dmyMatch[1], 10));
  }
  // Check DD-Mon-YYYY (e.g. 12-Apr-2026)
  const dMonYMatch = s.match(/^(\d{1,2})[-/\s]([A-Za-z]{3})[-/\s](\d{2,4})/);
  if (dMonYMatch) {
    const moIdx = MONTH_NAMES.findIndex(m => m.toLowerCase() === dMonYMatch[2].toLowerCase());
    if (moIdx !== -1) {
      let yr = parseInt(dMonYMatch[3], 10);
      yr = yr < 100 ? yr + 2000 : yr;
      return new Date(yr, moIdx, parseInt(dMonYMatch[1], 10));
    }
  }
  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? new Date() : fallback;
}

/**
 * Strict date parser: returns null when the value is empty or cannot be read as
 * a date, instead of silently falling back to today like asDate() does.
 * Used by period filters so a blank/invalid cell does not become "today".
 */
export function tryDate(val: any): Date | null {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'number') {
    if (val > 25000 && val < 65000) {
      const d = new Date((val - 25569) * 86400 * 1000);
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(val).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) {
    const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    return isNaN(d.getTime()) ? null : d;
  }
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) {
    const d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
    return isNaN(d.getTime()) ? null : d;
  }
  m = s.match(/^(\d{1,2})[-/\s]([A-Za-z]{3})[-/\s](\d{2,4})/);
  if (m) {
    const moIdx = MONTH_NAMES.findIndex(x => x.toLowerCase() === m![2].toLowerCase());
    if (moIdx !== -1) {
      let yr = parseInt(m[3], 10);
      yr = yr < 100 ? yr + 2000 : yr;
      return new Date(yr, moIdx, parseInt(m[1], 10));
    }
  }
  // Only trust the browser's lenient parser when the text actually carries a year,
  // so things like "Apr-26" are not read as 26 April 2001.
  if (!/\d{4}/.test(s)) return null;
  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

export function formatDateIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDateDisplay(val: string | Date): string {
  const d = asDate(val);
  const day = String(d.getDate()).padStart(2, '0');
  const month = MONTH_NAMES[d.getMonth()];
  const y = d.getFullYear();
  return `${day}-${month}-${y}`;
}

export function financialYearStart(val: string | Date = new Date()): number {
  const d = asDate(val);
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; // Month 3 is April (0-indexed)
}

export function fyLabel(startYear: number): string {
  const nextYearStr = String(startYear + 1).slice(-2);
  return `FY ${startYear}-${nextYearStr}`;
}

export function availableFyYears(referenceDate = new Date(), firstYear = 2020, futureYears = 1): number[] {
  const current = financialYearStart(referenceDate);
  const years: number[] = [];
  for (let y = firstYear; y <= current + futureYears; y++) {
    years.push(y);
  }
  return years;
}

export function periodBounds(
  mode: PeriodMode | 'Monthly' | 'Quarterly' | 'Financial Year' | 'Custom',
  options: {
    referenceDate?: Date;
    fyStartYear?: number;
    month?: Date | string;
    quarter?: number;
    start?: Date | string;
    end?: Date | string;
  } = {}
): Period {
  const modeKey = String(mode).trim().toLowerCase();
  const ref = options.referenceDate ? asDate(options.referenceDate) : new Date();
  const fy = options.fyStartYear ?? financialYearStart(ref);

  if (modeKey === 'monthly' || modeKey === 'month') {
    const m = options.month ? asDate(options.month) : new Date(ref.getFullYear(), ref.getMonth(), 1);
    const first = new Date(m.getFullYear(), m.getMonth(), 1);
    const last = new Date(m.getFullYear(), m.getMonth() + 1, 0);
    const label = `${MONTH_NAMES[first.getMonth()]}-${first.getFullYear()}`;
    return {
      start: formatDateIso(first),
      end: formatDateIso(last),
      label,
      mode: 'Monthly',
    };
  }

  if (modeKey === 'quarterly' || modeKey === 'quarter') {
    const defaultQ = Math.floor(((ref.getMonth() - 3 + 12) % 12) / 3) + 1;
    const q = options.quarter ?? defaultQ;
    if (q < 1 || q > 4) {
      throw new Error("Quarter must be between 1 and 4.");
    }
    const rawFirstMonth = 3 + (q - 1) * 3; // 3 = April (0-indexed)
    const firstYear = fy + Math.floor(rawFirstMonth / 12);
    const firstMonth = rawFirstMonth % 12;
    const first = new Date(firstYear, firstMonth, 1);

    const rawLastMonth = rawFirstMonth + 2;
    const lastYear = fy + Math.floor(rawLastMonth / 12);
    const lastMonth = rawLastMonth % 12;
    const last = new Date(lastYear, lastMonth + 1, 0);

    return {
      start: formatDateIso(first),
      end: formatDateIso(last),
      label: `${fyLabel(fy)} Q${q}`,
      mode: 'Quarterly',
    };
  }

  if (modeKey === 'yearly' || modeKey === 'financial year' || modeKey === 'financial-year' || modeKey === 'fy') {
    const first = new Date(fy, 3, 1);
    const last = new Date(fy + 1, 2, 31);
    return {
      start: formatDateIso(first),
      end: formatDateIso(last),
      label: fyLabel(fy),
      mode: 'Financial Year',
    };
  }

  if (modeKey === 'custom') {
    let first = options.start ? asDate(options.start) : new Date(ref.getFullYear(), ref.getMonth(), 1);
    let last = options.end ? asDate(options.end) : new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
    if (isNaN(first.getTime())) first = new Date(ref.getFullYear(), ref.getMonth(), 1);
    if (isNaN(last.getTime())) last = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
    if (first > last) {
      // Auto-swap if start is after end instead of failing
      const tmp = first;
      first = last;
      last = tmp;
    }
    return {
      start: formatDateIso(first),
      end: formatDateIso(last),
      label: `${formatDateDisplay(first)} to ${formatDateDisplay(last)}`,
      mode: 'Custom',
    };
  }

  throw new Error(`Unsupported period mode: ${mode}`);
}

export function lakh(val: any): string {
  const x = parseFloat(val);
  if (isNaN(x)) return "-";
  const absX = Math.abs(x);
  if (absX >= 1e7) {
    return `₹${(x / 1e7).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr`;
  }
  if (absX >= 1e5) {
    return `₹${(x / 1e5).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} L`;
  }
  return `₹${x.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
