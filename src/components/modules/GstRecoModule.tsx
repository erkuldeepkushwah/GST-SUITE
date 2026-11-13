import React, { useMemo, useRef, useState } from 'react';
import { LanguageCode, Period } from '../../types';
import { t } from '../../i18n/translations';
import { KPICards } from '../KPICards';
import { DataTable } from '../DataTable';
import { readExcelFile, getRawSheetRows, exportToExcel } from '../../services/excelEngine';
import {
  RECO_FIELDS,
  NOT_MAPPED,
  FILE_TYPES,
  RECO_PAIRS,
  FileType,
  findPair,
  fileTypeOption,
  expectedBooksLabel,
  filterRowsForPeriod,
  detectReturnPeriodColumn,
  ColumnMapping,
  StandardRow,
  autoMapColumns,
  standardize,
  compareFrames,
  exceptionRows,
  summarize,
  threeBRows,
  THREE_B_PARTICULARS,
} from '../../services/gstReco';
import { Upload, Play, Download, FileSpreadsheet, Check, AlertCircle, Sparkles } from 'lucide-react';

interface Props {
  commonPeriod: Period;
  gstin: string;
  lang: LanguageCode;
}

type Side = 'portal' | 'books';

interface SideState {
  fileName: string;
  sheets: string[];
  sheet: string;
  headers: string[];
  rows: Array<Record<string, any>>;
  mapping: ColumnMapping;
  imported: StandardRow[];
}

const emptySide: SideState = {
  fileName: '',
  sheets: [],
  sheet: '',
  headers: [],
  rows: [],
  mapping: {},
  imported: [],
};

/** Read one sheet into headers + row objects, whatever the file type. */
function sheetToRows(wb: any, sheetName: string) {
  const aoa = getRawSheetRows(wb, sheetName);
  const nonEmpty = aoa.filter((r) => (r || []).some((c) => String(c ?? '').trim() !== ''));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const headers = (nonEmpty[0] || []).map((h, i) => (String(h ?? '').trim() || `Column ${i + 1}`));
  const rows = nonEmpty.slice(1).map((r) => {
    const obj: Record<string, any> = {};
    headers.forEach((h, i) => {
      obj[h] = (r || [])[i];
    });
    return obj;
  });
  return { headers, rows };
}

export const GstRecoModule: React.FC<Props> = ({ commonPeriod, gstin, lang }) => {
  const [portal, setPortal] = useState<SideState>(emptySide);
  const [books, setBooks] = useState<SideState>(emptySide);
  // Workbooks stay in refs so switching sheets does not need a second upload.
  const portalWb = useRef<any>(null);
  const booksWb = useRef<any>(null);
  const [tolerance, setTolerance] = useState<string>('1');
  // Which two return types to compare, and what each uploaded file is.
  const [pairId, setPairId] = useState<string>('2B-purchase');
  const [portalType, setPortalType] = useState<FileType>('GSTR-2B');
  const [booksType, setBooksType] = useState<FileType>('BOOKS-PURCHASE');
  const [results, setResults] = useState<Array<Record<string, any>> | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<'import' | 'reco' | '3b' | 'export'>('import');

  // GSTR-3B summary: portal and books figures typed by the user
  const [threeB, setThreeB] = useState<Record<string, { portal: number; books: number }>>(() =>
    Object.fromEntries(THREE_B_PARTICULARS.map((p) => [p.key, { portal: 0, books: 0 }]))
  );

  const setSide = (side: Side, next: SideState) => (side === 'portal' ? setPortal(next) : setBooks(next));
  const getSide = (side: Side) => (side === 'portal' ? portal : books);

  const loadFile = async (side: Side, file: File | null) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!file) return;
    try {
      const wb: any = await readExcelFile(file);
      (side === 'portal' ? portalWb : booksWb).current = wb;
      const sheets: string[] = wb.SheetNames || [];
      if (!sheets.length) throw new Error(t('err_reco_empty_file', lang, { name: file.name }));
      const first = sheets[0];
      const { headers, rows } = sheetToRows(wb, first);
      if (!headers.length) throw new Error(t('err_reco_empty_file', lang, { name: file.name }));
      setSide(side, {
        fileName: file.name,
        sheets,
        sheet: first,
        headers,
        rows,
        mapping: autoMapColumns(headers),
        imported: [],
      });
      setResults(null);
    } catch (e: any) {
      setErrorMsg(e?.message || String(e));
    }
  };

  const changeSheet = (side: Side, sheetName: string) => {
    const current = getSide(side);
    const wb = (side === 'portal' ? portalWb : booksWb).current;
    if (!wb) return;
    const { headers, rows } = sheetToRows(wb, sheetName);
    setSide(side, {
      ...current,
      sheet: sheetName,
      headers,
      rows,
      mapping: autoMapColumns(headers),
      imported: [],
    });
    setResults(null);
  };

  const updateMapping = (side: Side, field: string, column: string) => {
    const current = getSide(side);
    setSide(side, { ...current, mapping: { ...current.mapping, [field]: column }, imported: [] });
  };

  const importSide = (side: Side) => {
    const current = getSide(side);
    const type = side === 'portal' ? portalType : booksType;
    const option = fileTypeOption(type);
    if (!current.rows.length) {
      setErrorMsg(t('err_reco_no_file', lang));
      return;
    }
    // A summary file has no invoice rows, so the invoice mapping is not needed.
    if (!option.summary && current.mapping['Invoice No'] === NOT_MAPPED) {
      setErrorMsg(t('err_reco_no_invoice_col', lang));
      return;
    }
    const rows = standardize(current.rows, current.mapping, {
      gstin,
      period: commonPeriod.label,
      returnType: type,
      sourceName: current.fileName,
      returnPeriodColumn: detectReturnPeriodColumn(current.headers),
    });
    setSide(side, { ...current, imported: rows });
    setSuccessMsg(t('reco_imported', lang, { n: rows.length, name: current.fileName }));
    setErrorMsg(null);
  };

  const handleRun = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!portal.imported.length || !books.imported.length) {
      setErrorMsg(t('err_reco_import_first', lang));
      return;
    }
    const pair = findPair(pairId);
    const portalActual = portal.imported[0]?.['Return Type'];
    const booksActual = books.imported[0]?.['Return Type'];
    if (portalActual !== pair.portal) {
      setErrorMsg(
        t('err_reco_wrong_type', lang, {
          side: t('reco_portal_file', lang),
          expected: fileTypeOption(pair.portal).label,
          actual: fileTypeOption(portalActual as FileType).label || String(portalActual),
        })
      );
      return;
    }
    if (booksActual !== pair.books) {
      setErrorMsg(
        t('err_reco_wrong_type', lang, {
          side: t('reco_books_file', lang),
          expected: expectedBooksLabel(pair),
          actual: fileTypeOption(booksActual as FileType).label || String(booksActual),
        })
      );
      return;
    }

    setIsRunning(true);
    try {
      const portalRows = filterRowsForPeriod(portal.imported, pair.portal, commonPeriod.start, commonPeriod.end);
      const booksRows = filterRowsForPeriod(books.imported, pair.books, commonPeriod.start, commonPeriod.end);
      if (!portalRows.length || !booksRows.length) {
        // Everything was filtered out: the files are for another period.
        setErrorMsg(
          t('err_reco_period_empty', lang, {
            period: commonPeriod.label,
            portal: portalRows.length,
            portalTotal: portal.imported.length,
            books: booksRows.length,
            booksTotal: books.imported.length,
          })
        );
        setResults(null);
        setIsRunning(false);
        return;
      }
      const rows = compareFrames(portalRows, booksRows, Number(tolerance) || 0);
      setResults(rows as any);
      setSuccessMsg(
        t('reco_done_filtered', lang, {
          n: rows.length,
          portal: portalRows.length,
          portalTotal: portal.imported.length,
          books: booksRows.length,
          booksTotal: books.imported.length,
        })
      );
      setActiveTab('reco');
    } catch (e: any) {
      setErrorMsg(e?.message || String(e));
    } finally {
      setIsRunning(false);
    }
  };

  const handleLoadSample = () => {
    // Dates come from the selected reporting period, otherwise the period
    // filter would drop every sample row and the run would report 0 invoices.
    const dayIn = (offset: number) => {
      const d = new Date(`${commonPeriod.start}T00:00:00`);
      d.setDate(d.getDate() + offset);
      const end = new Date(`${commonPeriod.end}T00:00:00`);
      return (d > end ? end : d).toISOString().slice(0, 10).split('-').reverse().join('-');
    };
    const d0 = dayIn(3);
    const d1 = dayIn(10);
    const d2 = dayIn(17);
    const portalRows = [
      { 'GSTIN of Supplier': '27AABCT1332L1ZE', 'Invoice Number': 'INV-001', 'Invoice Date': d0, 'Taxable Value': 100000, 'Integrated Tax Amount': 18000 },
      { 'GSTIN of Supplier': '24AAACB2233M1ZZ', 'Invoice Number': 'INV-002', 'Invoice Date': d1, 'Taxable Value': 50000, 'Integrated Tax Amount': 9000 },
      { 'GSTIN of Supplier': '23AACCF4455P1ZD', 'Invoice Number': 'INV-003', 'Invoice Date': d2, 'Taxable Value': 25000, 'Integrated Tax Amount': 4500 },
    ];
    const booksRows = [
      { 'Supplier GSTIN': '27AABCT1332L1ZE', 'Voucher No': 'INV-001', 'Voucher Date': d0, 'Taxable Amt': 100000, 'IGST Amt': 18000 },
      { 'Supplier GSTIN': '24AAACB2233M1ZZ', 'Voucher No': 'INV-002', 'Voucher Date': d1, 'Taxable Amt': 48000, 'IGST Amt': 8640 },
      { 'Supplier GSTIN': '23AABCS8899Q1ZB', 'Voucher No': 'INV-004', 'Voucher Date': d2, 'Taxable Amt': 30000, 'IGST Amt': 5400 },
    ];
    const build = (rows: Array<Record<string, any>>, name: string): SideState => {
      const headers = Object.keys(rows[0]);
      return {
        fileName: name,
        sheets: ['Sheet1'],
        sheet: 'Sheet1',
        headers,
        rows,
        mapping: autoMapColumns(headers),
        imported: standardize(rows, autoMapColumns(headers), {
          gstin,
          period: commonPeriod.label,
          returnType: name.includes('2A') ? 'GSTR-2A' : 'BOOKS-PURCHASE',
          sourceName: name,
          returnPeriodColumn: detectReturnPeriodColumn(headers),
        }),
      };
    };
    const p = build(portalRows, 'sample_2A.xlsx');
    const b = build(booksRows, 'sample_books.xlsx');
    setPortal(p);
    setBooks(b);
    setPairId('2A-purchase');
    setPortalType('GSTR-2A');
    setBooksType('BOOKS-PURCHASE');
    setResults(null);
    setErrorMsg(null);
    setSuccessMsg(t('reco_sample_loaded', lang));
  };

  const handleDownload = async () => {
    if (!results || isExporting) return;
    setIsExporting(true);
    setErrorMsg(null);
    try {
      const rows = results as any[];
      await exportToExcel(
        {
          'Invoice Reco': rows,
          Exceptions: exceptionRows(rows).length ? exceptionRows(rows) : [{ Info: 'No exceptions - every invoice matched.' }],
          '3B Summary': threeBRows(threeB),
          'Portal Rows': portal.imported.length ? portal.imported : [{ Info: 'Nothing imported from the portal file.' }],
          'Books Rows': books.imported.length ? books.imported : [{ Info: 'Nothing imported from the books file.' }],
        },
        `GST_Reconciliation_${gstin || 'company'}_${commonPeriod.label.replace(/\s+/g, '_')}.xlsx`,
        { gstin, period: commonPeriod.label, title: 'GST-Reconciliation' }
      );
    } catch (e: any) {
      setErrorMsg(t('err_export', lang, { error: e?.message || String(e) }));
    } finally {
      setIsExporting(false);
    }
  };

  const summary = useMemo(() => (results ? summarize(results as any) : null), [results]);

  const mappingTable = (side: Side) => {
    const current = getSide(side);
    if (!current.headers.length) return null;
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
          {RECO_FIELDS.map((field) => (
            <label key={field} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-[#47566B] shrink-0 w-28">{field}</span>
              <select
                value={current.mapping[field] || NOT_MAPPED}
                onChange={(e) => updateMapping(side, field, e.target.value)}
                className={`flex-1 min-w-0 text-[11px] bg-white border rounded-md px-2 py-1 outline-none focus:ring-2 focus:ring-[#2563eb]/30 focus:border-[#2563eb] ${
                  (current.mapping[field] || NOT_MAPPED) === NOT_MAPPED
                    ? 'border-[#DDE4EE] text-[#94A3B8]'
                    : 'border-[#C8D1DF] text-[#0F172A]'
                }`}
              >
                <option value={NOT_MAPPED}>{t('reco_not_mapped', lang)}</option>
                {current.headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <span className="text-[11px] text-[#64748B]">
            {t('reco_file_rows', lang, { n: current.rows.length, name: current.fileName })}
          </span>
          <button
            onClick={() => importSide(side)}
            className="px-3 py-1.5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-[11px] font-semibold transition-colors"
          >
            {current.imported.length
              ? t('reco_reimport', lang, { n: current.imported.length })
              : t('reco_import', lang)}
          </button>
        </div>
      </div>
    );
  };

  const uploadCard = (side: Side) => {
    const current = getSide(side);
    return (
      <div className="border-2 border-dashed border-[#DDE4EE] rounded-xl p-4 bg-[#F8FAFC] space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-[#344056]">
            {side === 'portal' ? t('reco_portal_file', lang) : t('reco_books_file', lang)}
          </span>
          {current.imported.length > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
              <Check className="w-3.5 h-3.5" />
              {t('reco_ready', lang, { n: current.imported.length })}
            </span>
          )}
        </div>
        <label className="flex items-center gap-2 text-[11px] text-[#64748B]">
          <span className="shrink-0">{t('reco_file_type', lang)}</span>
          <select
            value={side === 'portal' ? portalType : booksType}
            onChange={(e) => {
              const type = e.target.value as FileType;
              if (side === 'portal') setPortalType(type);
              else setBooksType(type);
              // The return type decides how the rows are filtered later, so a
              // change has to be re-imported.
              setSide(side, { ...current, imported: [] });
              setResults(null);
            }}
            className="flex-1 min-w-0 text-[11px] bg-white border border-[#C8D1DF] rounded-md px-2 py-1 outline-none focus:ring-2 focus:ring-[#2563eb]/30 focus:border-[#2563eb]"
          >
            {(side === 'portal' ? FILE_TYPES.filter((f) => !f.books) : FILE_TYPES.filter((f) => f.books)).map((f) => (
              <option key={f.type} value={f.type}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col items-center justify-center gap-1.5 cursor-pointer py-3 bg-white border border-[#DDE4EE] rounded-lg hover:border-[#93c5fd] transition-colors">
          <Upload className="w-4 h-4 text-[#94A3B8]" />
          <span className="text-xs text-[#64748B] font-medium truncate max-w-[240px]">
            {current.fileName || t('reco_choose_file', lang)}
          </span>
          <input
            type="file"
            accept=".xlsx,.xlsm,.xls,.csv"
            className="hidden"
            onChange={(e) => loadFile(side, e.target.files?.[0] || null)}
          />
        </label>
        {current.sheets.length > 1 && (
          <label className="flex items-center gap-2 text-[11px] text-[#64748B]">
            <span className="shrink-0">{t('reco_sheet', lang)}</span>
            <select
              value={current.sheet}
              onChange={(e) => changeSheet(side, e.target.value)}
              className="flex-1 text-[11px] bg-white border border-[#C8D1DF] rounded-md px-2 py-1"
            >
              {current.sheets.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
        {mappingTable(side)}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-[#DDE4EE] p-4 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-xs text-[#64748B] max-w-2xl leading-relaxed">{t('reco_intro', lang)}</p>
          <button
            onClick={handleLoadSample}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#F1F5F9] hover:bg-[#eff6ff] text-[#344056] rounded-lg text-xs font-semibold transition-colors shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#2563eb]" />
            {t('reco_load_sample', lang)}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {uploadCard('portal')}
          {uploadCard('books')}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-2 text-[11px] text-[#47566B]">
            <span className="shrink-0 font-semibold">{t('reco_pair_label', lang)}</span>
            <select
              value={pairId}
              onChange={(e) => {
                const next = findPair(e.target.value);
                setPairId(next.id);
                // The pair decides what each side must be, so keep the two
                // file types in step; a changed type has to be re-imported.
                if (next.portal !== portalType) {
                  setPortalType(next.portal);
                  setPortal((prev) => ({ ...prev, imported: [] }));
                }
                if (next.books !== booksType) {
                  setBooksType(next.books);
                  setBooks((prev) => ({ ...prev, imported: [] }));
                }
                setResults(null);
                setErrorMsg(null);
              }}
              className="text-[11px] bg-white border border-[#C8D1DF] rounded-md px-2 py-1 outline-none focus:ring-2 focus:ring-[#2563eb]/30 focus:border-[#2563eb]"
            >
              {RECO_PAIRS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-[11px] text-[#47566B]">
            <span>{t('reco_tolerance', lang)}</span>
            <input
              type="number"
              step="0.01"
              value={tolerance}
              onChange={(e) => setTolerance(e.target.value)}
              className="w-24 text-xs font-mono bg-white border border-[#C8D1DF] rounded-md px-2 py-1 outline-none focus:ring-2 focus:ring-[#2563eb]/30"
            />
          </label>
          </div>
          <button
            onClick={handleRun}
            disabled={isRunning}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-lg text-xs font-bold shadow-xs transition-colors disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {isRunning ? t('reconciling', lang) : t('reco_run', lang)}
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-xs flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
      </div>

      {summary && results && (
        <div className="space-y-4">
          <KPICards
            items={[
              { label: t('reco_kpi_matched', lang), value: summary.matched.toLocaleString(), sub: t('reco_kpi_invoices', lang), color: 'green' },
              { label: t('reco_kpi_possible', lang), value: summary.possible.toLocaleString(), sub: t('reco_kpi_invoices', lang), color: 'blue' },
              { label: t('reco_kpi_mismatch', lang), value: summary.mismatch.toLocaleString(), sub: t('reco_kpi_value_diff', lang), color: 'amber' },
              {
                label: t('reco_kpi_only_one_side', lang),
                value: (summary.onlyPortal + summary.onlyBooks).toLocaleString(),
                sub: t('reco_kpi_only_split', lang, { portal: summary.onlyPortal, books: summary.onlyBooks }),
                color: 'red',
              },
            ]}
          />

          <div className="bg-white rounded-xl border border-[#DDE4EE] shadow-2xs overflow-hidden">
            <div className="flex border-b border-[#DDE4EE] bg-[#F8FAFC] px-2 overflow-x-auto">
              {[
                { id: 'reco', label: t('reco_tab_reco', lang) },
                { id: '3b', label: t('reco_tab_3b', lang) },
                { id: 'export', label: t('reco_tab_export', lang) },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-4 py-3 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 ${
                    activeTab === tab.id
                      ? 'border-[#2563eb] text-[#2563eb] bg-white'
                      : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="p-4">
              {activeTab === 'reco' && (
                <DataTable data={results} title={t('reco_tab_reco', lang)} maxHeight="560px" gstin={gstin} period={commonPeriod.label} />
              )}

              {activeTab === '3b' && (
                <div className="space-y-3">
                  <div className="text-xs text-[#47566B] bg-[#eff6ff] border border-[#DDE4EE] p-2.5 rounded-lg">
                    {t('reco_3b_note', lang)}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-[#1e40af] text-white">
                          <th className="text-left px-3 py-2 font-semibold">{t('reco_3b_particulars', lang)}</th>
                          <th className="text-right px-3 py-2 font-semibold">{t('reco_3b_portal', lang)}</th>
                          <th className="text-right px-3 py-2 font-semibold">{t('reco_3b_books', lang)}</th>
                          <th className="text-right px-3 py-2 font-semibold">{t('reco_3b_diff', lang)}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {threeBRows(threeB).map((row, i) => {
                          const key = THREE_B_PARTICULARS[i].key;
                          return (
                            <tr key={key} className="border-b border-[#DDE4EE]">
                              <td className="px-3 py-1.5 text-[#344056]">{row.Particulars}</td>
                              {(['portal', 'books'] as const).map((side) => (
                                <td key={side} className="px-2 py-1 text-right">
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={threeB[key]?.[side] ?? 0}
                                    onChange={(e) =>
                                      setThreeB({
                                        ...threeB,
                                        [key]: { ...threeB[key], [side]: parseFloat(e.target.value) || 0 },
                                      })
                                    }
                                    className="w-28 text-right text-xs font-mono bg-white border border-[#C8D1DF] rounded px-2 py-1 outline-none focus:ring-2 focus:ring-[#2563eb]/30"
                                  />
                                </td>
                              ))}
                              <td
                                className={`px-3 py-1.5 text-right font-mono ${
                                  Math.abs(row.Difference) > 0.009 ? 'text-rose-700 font-semibold' : 'text-[#64748B]'
                                }`}
                              >
                                {row.Difference.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === 'export' && (
                <div className="p-6 text-center space-y-3">
                  <h4 className="text-sm font-bold text-[#0F172A]">{t('reco_export_title', lang)}</h4>
                  <p className="text-xs text-[#64748B] max-w-lg mx-auto">{t('reco_export_note', lang)}</p>
                  <button
                    onClick={handleDownload}
                    disabled={isExporting}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-xl text-xs font-bold shadow-sm transition-colors disabled:opacity-60 disabled:cursor-wait"
                  >
                    <Download className="w-4 h-4" />
                    {isExporting ? t('export_running', lang) : t('reco_export_btn', lang)}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {!results && (
        <div className="bg-white rounded-xl border border-[#DDE4EE] p-6 flex items-start gap-3">
          <FileSpreadsheet className="w-5 h-5 text-[#94A3B8] shrink-0 mt-0.5" />
          <p className="text-xs text-[#64748B] leading-relaxed">{t('reco_empty_hint', lang)}</p>
        </div>
      )}
    </div>
  );
};
