import { ModuleKey } from '../types';

export interface ImportRecord {
  id: string;
  at: string;          // ISO timestamp
  gstin: string;
  module: ModuleKey;
  period: string;
  files: string[];
  rows: number;
}

const STORAGE_KEY = 'gst_suite_import_history_v1';
const MAX_RECORDS = 100;
export const HISTORY_EVENT = 'gst-history-updated';

function safeStorage(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = '__gst_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    // Private mode / storage disabled: history just stays empty
    return null;
  }
}

export function loadHistory(): ImportRecord[] {
  const s = safeStorage();
  if (!s) return [];
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ImportRecord[]) : [];
  } catch {
    return [];
  }
}

export function recordImport(entry: Omit<ImportRecord, 'id' | 'at'>): ImportRecord[] {
  const record: ImportRecord = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
  };
  const next = [record, ...loadHistory()].slice(0, MAX_RECORDS);
  const s = safeStorage();
  if (s) {
    try {
      s.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // quota exceeded: keep the newest records only
      try {
        s.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, 20)));
      } catch {
        /* give up quietly, history is a convenience */
      }
    }
  }
  try {
    window.dispatchEvent(new CustomEvent(HISTORY_EVENT));
  } catch {
    /* no-op */
  }
  return next;
}

export function clearHistory(): void {
  const s = safeStorage();
  if (s) s.removeItem(STORAGE_KEY);
  try {
    window.dispatchEvent(new CustomEvent(HISTORY_EVENT));
  } catch {
    /* no-op */
  }
}

export function formatHistoryTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()} ${hh}:${mi}`;
}
