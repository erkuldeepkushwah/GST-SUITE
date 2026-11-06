export type LanguageCode = 'en' | 'hi' | 'zh' | 'es' | 'fr';

export type ModuleKey = 'gst2a' | 'gstr1' | 'gstreco' | 'bank' | 'tds' | 'stock';

export type PeriodMode = 'monthly' | 'quarterly' | 'fy' | 'custom';

export type BasisOption = 'both' | 'invoice' | 'return';

export type StockMode = 'snapshot' | 'movement';

export interface Period {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
  label: string;
  mode: 'Monthly' | 'Quarterly' | 'Financial Year' | 'Custom';
}

export interface KPIItem {
  label: string;
  value: string;
  sub: string;
  color: 'green' | 'amber' | 'red' | 'blue';
}

export interface ManualNoteType {
  GSTIN: string;
  'Note No': string;
  Type: 'CN' | 'DN';
  Basis: string;
}

export interface Gst2aRecoResult {
  dashboard: Array<Record<string, any>>;
  b2bReco: Array<Record<string, any>>;
  cdnReco: Array<Record<string, any>>;
  gstr9Itc: Array<Record<string, any>>;
  cdnReview: Array<Record<string, any>>;
}

export interface Gstr1RecoResult {
  dashboard: Array<Record<string, any>>;
  monthWise: Array<Record<string, any>>;
  tieOut: Array<Record<string, any>>;
  portalFiles: Array<Record<string, any>>;
  b2bReco: Array<Record<string, any>>;
  cdnrReco: Array<Record<string, any>>;
  hsnReco: Array<Record<string, any>>;
  parsed3b?: Array<Record<string, any>>;
}

export interface BankRecoResult {
  summary: Array<Record<string, any>>;
  closingReconciliation: Array<Record<string, any>>;
  exceptions: Array<Record<string, any>>;
  allEntries: Array<Record<string, any>>;
}

export interface TdsRecoResult {
  summary: Array<Record<string, any>>;
  monthlyReco: Array<Record<string, any>>;
  tallyEntries: Array<Record<string, any>>;
}

export interface StockSnapshotResult {
  summary: Array<Record<string, any>>;
  unitTieOut: Array<Record<string, any>>;
  exceptions: Array<Record<string, any>>;
  allItems: Array<Record<string, any>>;
  tied: boolean;
}

export interface StockMovementResult {
  summary: Array<Record<string, any>>;
  exceptions: Array<Record<string, any>>;
  allItems: Array<Record<string, any>>;
}
