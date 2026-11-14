import React, { useState } from 'react';
import { LanguageCode, Period, Gstr1RecoResult } from '../../types';
import { t } from '../../i18n/translations';
import { PeriodPicker } from '../PeriodPicker';
import { KPICards } from '../KPICards';
import { DataTable } from '../DataTable';
import {
  parseGstr1JsonFile,
  parseBooksGstr1File,
  runGstr1MultiReconciliation,
  Gstr1PortalFile,
} from '../../services/gstr1Engine';
import { exportToExcel } from '../../services/excelEngine';
import { getSampleGstr1Pack, SAMPLE_GSTIN } from '../../services/sampleData';
import { auditGstins, gstinAuditRows, GstinAuditSummary } from '../../services/gstinAudit';
import { gstinIssueKey, validateGstin } from '../../services/validation';
import { GstinHealthPanel } from '../GstinHealthPanel';
import { Upload, Play, Download, Sparkles, Check, AlertCircle, Plus, Trash2 } from 'lucide-react';

interface Props {
  commonPeriod: Period;
  gstin: string;
  lang: LanguageCode;
  onSetGstin: (gstin: string) => void;
}

export const Gstr1Module: React.FC<Props> = ({ commonPeriod, gstin, lang, onSetGstin }) => {
  const [overridePeriod, setOverridePeriod] = useState(false);
  const [localPeriod, setLocalPeriod] = useState<Period>(commonPeriod);

  const [jsonFiles, setJsonFiles] = useState<File[]>([]);
  const [booksFiles, setBooksFiles] = useState<File[]>([]);

  // 3B Grid state
  const [threeBGrid, setThreeBGrid] = useState<Array<{ 'Return Period': string; Taxable: number; IGST: number; CGST: number; SGST: number }>>([
    { 'Return Period': 'Apr-2026', Taxable: 0, IGST: 0, CGST: 0, SGST: 0 },
  ]);

  const [isRunning, setIsRunning] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [resultsPeriod, setResultsPeriod] = useState<string>('');
  const [results, setResults] = useState<Gstr1RecoResult | null>(null);
  const [audit, setAudit] = useState<GstinAuditSummary | null>(null);
  const [activeTab, setActiveTab] = useState<'dash' | 'month' | 'tieout' | 'b2b' | 'cdnr' | 'hsn' | 'download'>('dash');

  /** Portal JSON and Books sheets both carry the counterparty GSTIN; flatten
   *  them so the audit sees every imported row, not just the reco output. */
  const auditSources = (portals: any[], books: any[]) =>
    auditGstins([
      {
        label: 'GSTR-1 portal',
        rows: portals.flatMap((p) => [...(p.b2b || []), ...(p.cdnr || [])]),
      },
      {
        label: 'Books',
        rows: books.flatMap((b) => [...(b.b2b || []), ...(b.cdnr || [])]),
      },
    ]);

  const activePeriod = overridePeriod ? localPeriod : commonPeriod;

  const handleLoadSample = () => {
    if (!gstin) onSetGstin(SAMPLE_GSTIN);
    const { portalFiles, booksFiles, threeB } = getSampleGstr1Pack();
    setThreeBGrid(threeB);

    const res = runGstr1MultiReconciliation(
      portalFiles,
      booksFiles,
      activePeriod.start,
      activePeriod.end,
      threeB
    );
    setResults(res);
    setAudit(auditSources(portalFiles, booksFiles));
    setErrorMsg(null);
    setSuccessMsg("Loaded sample GSTR-1 & 3B reconciliation dataset!");
  };

  const handleRun = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    const companyCheck = validateGstin(gstin);
    if (companyCheck.status !== 'valid') {
      const reason =
        companyCheck.status === 'invalid'
          ? t(gstinIssueKey(companyCheck.issue), lang, { code: companyCheck.stateCode })
          : t('gstin_caption', lang);
      setErrorMsg(t('err_gstin_reason', lang, { reason }));
      return;
    }
    if (jsonFiles.length === 0 || booksFiles.length === 0) {
      setErrorMsg("Please upload both GSTR-1 Portal JSON and Books Excel files, or click 'Load Sample / Demo Data' to test immediately.");
      return;
    }

    setIsRunning(true);
    try {
      const parsedPortals: Gstr1PortalFile[] = [];
      for (const f of jsonFiles) {
        const p = await parseGstr1JsonFile(f);
        parsedPortals.push(p);
      }

      const parsedBooksList: any[] = [];
      for (const f of booksFiles) {
        const b = await parseBooksGstr1File(f);
        parsedBooksList.push(b);
      }

      const res = runGstr1MultiReconciliation(
        parsedPortals,
        parsedBooksList,
        activePeriod.start,
        activePeriod.end,
        threeBGrid.filter(r => r['Return Period'].trim())
      );

      setResults(res);
      setAudit(auditSources(parsedPortals, parsedBooksList));
      setSuccessMsg("GSTR-1 & 3B reconciliation completed successfully!");
      setResultsPeriod(activePeriod.label);
    } catch (e: any) {
      setErrorMsg(e.message || String(e));
    } finally {
      setIsRunning(false);
    }
  };

  const handleAdd3bRow = () => {
    setThreeBGrid([
      ...threeBGrid,
      { 'Return Period': activePeriod.label, Taxable: 0, IGST: 0, CGST: 0, SGST: 0 },
    ]);
  };

  const handleUpdate3bRow = (idx: number, field: string, val: any) => {
    // Build a new row object: mutating the existing one leaves React state stale
    setThreeBGrid(
      threeBGrid.map((row, i) =>
        i === idx ? { ...row, [field]: field === 'Return Period' ? val : (parseFloat(val) || 0) } : row
      )
    );
  };

  const handleDelete3bRow = (idx: number) => {
    setThreeBGrid(threeBGrid.filter((_, i) => i !== idx));
  };

  const handleDownloadFullExcel = async () => {
    if (!results || isExporting) return;
    setIsExporting(true);
    setErrorMsg(null);
    try {
      await exportToExcel(
        {
          Dashboard: results.dashboard,
          'Month-wise (portal)': results.monthWise,
          '3B tie-out': results.tieOut,
          'Portal files': results.portalFiles,
          'B2B Reco': results.b2bReco,
          'CDNR Reco': results.cdnrReco.length > 0 ? results.cdnrReco : [{ Info: t('no_cdnr_rows', lang) }],
          'HSN Summary': results.hsnReco.length > 0 ? results.hsnReco : [{ Info: 'No HSN lines found in the uploaded files.' }],
          ...(audit ? { 'GSTIN Audit': gstinAuditRows(audit) } : {}),
        },
        `GSTR1_Reco_${activePeriod.label.replace(/\s+/g, '_')}.xlsx`,
        { gstin, period: activePeriod.label, title: 'GSTR-1 & 3B Reconciliation' }
      );
    } catch (e: any) {
      setErrorMsg(t('err_export', lang, { error: e?.message || String(e) }));
    } finally {
      setIsExporting(false);
    }
  };

  // KPIs
  let b2bMatched = 0, b2bMismatch = 0, onlyPortal = 0, onlyBooks = 0;
  if (results) {
    for (const d of results.dashboard) {
      if (d.Section === 'B2B') {
        if (d.Status === 'Matched') b2bMatched = d.Count;
        else if (d.Status === 'Mismatch') b2bMismatch = d.Count;
        else if (d.Status === 'Only in Portal') onlyPortal = d.Count;
        else if (d.Status === 'Only in Books') onlyBooks = d.Count;
      }
    }
  }

  return (
    <div className="space-y-5">
      {/* Upload card */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-4">
        <div className="text-xs text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
          {t('note_gstr1', lang)}
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={overridePeriod}
              onChange={(e) => {
                const on = e.target.checked;
                setOverridePeriod(on);
                if (on) setLocalPeriod(commonPeriod);
              }}
              className="accent-[#0159D3] rounded"
            />
            {t('override_period', lang)}
          </label>
        </div>

        {overridePeriod && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg max-w-md">
            <PeriodPicker prefix="gstr1_local" value={localPeriod} onChange={setLocalPeriod} lang={lang} />
          </div>
        )}

        {/* Upload inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* JSON Portal Files */}
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 bg-slate-50/60 hover:bg-slate-50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-700">{t('upload_gstr1_json', lang)}</span>
              {jsonFiles.length > 0 && (
                <span className="text-[11px] text-emerald-600 font-medium">
                  {jsonFiles.length} file(s)
                </span>
              )}
            </div>
            <label className="flex flex-col items-center justify-center gap-1.5 cursor-pointer py-3 bg-white border border-slate-200 rounded-lg shadow-2xs hover:border-slate-300 transition-all">
              <Upload className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-600 font-medium truncate max-w-[220px]">
                {jsonFiles.length > 0 ? `${jsonFiles.length} JSON file(s) selected` : 'Select JSON files (multi)'}
              </span>
              <input
                type="file"
                multiple
                accept=".json"
                className="hidden"
                onChange={(e) => setJsonFiles(Array.from(e.target.files || []))}
              />
            </label>
          </div>

          {/* Books Excel Files */}
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 bg-slate-50/60 hover:bg-slate-50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-700">{t('upload_books_gstr1', lang)}</span>
              {booksFiles.length > 0 && (
                <span className="text-[11px] text-emerald-600 font-medium">
                  {booksFiles.length} file(s)
                </span>
              )}
            </div>
            <label className="flex flex-col items-center justify-center gap-1.5 cursor-pointer py-3 bg-white border border-slate-200 rounded-lg shadow-2xs hover:border-slate-300 transition-all">
              <Upload className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-600 font-medium truncate max-w-[220px]">
                {booksFiles.length > 0 ? `${booksFiles.length} Excel file(s) selected` : 'Select Excel files (multi)'}
              </span>
              <input
                type="file"
                multiple
                accept=".xlsx,.xlsm"
                className="hidden"
                onChange={(e) => setBooksFiles(Array.from(e.target.files || []))}
              />
            </label>
          </div>
        </div>

        {/* 3B Values interactive data grid */}
        <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">{t('gstr1_3b_header', lang)}</span>
            <button
              onClick={handleAdd3bRow}
              className="flex items-center gap-1 text-[11px] font-semibold text-[#0159D3] hover:underline"
            >
              <Plus className="w-3.5 h-3.5" /> Add Month
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-2">Return Period</th>
                  <th className="p-2 text-right">Taxable</th>
                  <th className="p-2 text-right">IGST</th>
                  <th className="p-2 text-right">CGST</th>
                  <th className="p-2 text-right">SGST</th>
                  <th className="p-2 text-center w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {threeBGrid.map((row, idx) => (
                  <tr key={idx} className="bg-white hover:bg-slate-50">
                    <td className="p-1.5">
                      <input
                        type="text"
                        value={row['Return Period']}
                        onChange={(e) => handleUpdate3bRow(idx, 'Return Period', e.target.value)}
                        placeholder="e.g. Apr-2026"
                        className="w-28 px-2 py-1 border border-slate-300 rounded text-xs font-medium"
                      />
                    </td>
                    <td className="p-1.5 text-right">
                      <input
                        type="number"
                        value={row.Taxable || ''}
                        onChange={(e) => handleUpdate3bRow(idx, 'Taxable', e.target.value)}
                        className="w-24 px-2 py-1 border border-slate-300 rounded text-xs text-right font-mono"
                      />
                    </td>
                    <td className="p-1.5 text-right">
                      <input
                        type="number"
                        value={row.IGST || ''}
                        onChange={(e) => handleUpdate3bRow(idx, 'IGST', e.target.value)}
                        className="w-20 px-2 py-1 border border-slate-300 rounded text-xs text-right font-mono"
                      />
                    </td>
                    <td className="p-1.5 text-right">
                      <input
                        type="number"
                        value={row.CGST || ''}
                        onChange={(e) => handleUpdate3bRow(idx, 'CGST', e.target.value)}
                        className="w-20 px-2 py-1 border border-slate-300 rounded text-xs text-right font-mono"
                      />
                    </td>
                    <td className="p-1.5 text-right">
                      <input
                        type="number"
                        value={row.SGST || ''}
                        onChange={(e) => handleUpdate3bRow(idx, 'SGST', e.target.value)}
                        className="w-20 px-2 py-1 border border-slate-300 rounded text-xs text-right font-mono"
                      />
                    </td>
                    <td className="p-1.5 text-center">
                      <button
                        onClick={() => handleDelete3bRow(idx)}
                        className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <button
            onClick={handleRun}
            disabled={isRunning}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#0159D3] hover:bg-[#00347D] text-white rounded-lg text-xs font-bold shadow-xs transition-all active:scale-98 disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {isRunning ? t('reconciling', lang) : t('run_gstr1', lang)}
          </button>

          <button
            onClick={handleLoadSample}
            type="button"
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            Load Sample / Demo Data
          </button>
        </div>

        {/* Error / Success Banners */}
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
            <button
              onClick={handleLoadSample}
              className="text-xs font-bold text-rose-800 underline hover:no-underline cursor-pointer"
            >
              Click to load demo data & fix
            </button>
          </div>
        )}
        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-xs flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
        {resultsPeriod && resultsPeriod !== activePeriod.label && results && (
          <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg text-xs">
            Ye results {resultsPeriod} ke hain, ab selected period {activePeriod.label} hai. Numbers refresh karne ke liye Run dobara dabayein.
          </div>
        )}
      </div>

      {/* Results View */}
      {results && (
        <div className="space-y-4">
          <KPICards
            items={[
              {
                label: t('kpi_b2b_matched', lang),
                value: b2bMatched.toLocaleString(),
                sub: activePeriod.label,
                color: 'green',
              },
              {
                label: t('kpi_b2b_mismatch', lang),
                value: b2bMismatch.toLocaleString(),
                sub: activePeriod.label,
                color: 'amber',
              },
              {
                label: t('kpi_only_portal', lang),
                value: onlyPortal.toLocaleString(),
                sub: t('sub_gstr1_not_books', lang),
                color: 'red',
              },
              {
                label: t('kpi_only_books', lang),
                value: onlyBooks.toLocaleString(),
                sub: t('sub_books_not_gstr1', lang),
                color: 'blue',
              },
            ]}
          />

          {/* GSTIN health of everything that was imported */}
          <GstinHealthPanel audit={audit} lang={lang} exportName={`GSTIN_Audit_${gstin}`} />

          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="flex border-b border-slate-200 bg-slate-50/50 px-2 overflow-x-auto">
              {[
                { id: 'dash', label: t('tab_dashboard', lang) },
                { id: 'month', label: t('tab_month', lang) },
                { id: 'tieout', label: t('tab_tieout', lang) },
                { id: 'b2b', label: t('tab_b2b_reco', lang) },
                { id: 'cdnr', label: t('tab_cdnr_reco', lang) },
                { id: 'hsn', label: t('tab_hsn', lang) },
                { id: 'download', label: t('tab_download', lang) },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 ${
                    activeTab === tab.id
                      ? 'border-[#0159D3] text-[#0159D3] bg-white'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="p-4">
              {activeTab === 'dash' && (
                <div className="space-y-4">
                  <DataTable gstin={gstin} period={activePeriod.label} data={results.dashboard} title="GSTR-1 Reco Dashboard" hideSearch />
                  <DataTable gstin={gstin} period={activePeriod.label} data={results.portalFiles} title={t('tab_portal_files', lang)} hideSearch />
                </div>
              )}

              {activeTab === 'month' && (
                <DataTable gstin={gstin} period={activePeriod.label} data={results.monthWise} title="Month-wise Portal Figures" hideSearch />
              )}

              {activeTab === 'tieout' && (
                <DataTable gstin={gstin} period={activePeriod.label} data={results.tieOut} title="GSTR-1 vs GSTR-3B Tie-out" hideSearch />
              )}

              {activeTab === 'b2b' && (
                <DataTable gstin={gstin} period={activePeriod.label} data={results.b2bReco} title="B2B Sales Reconciliation" maxHeight="520px" />
              )}

              {activeTab === 'cdnr' && (
                <DataTable gstin={gstin} period={activePeriod.label}
                  data={results.cdnrReco.length > 0 ? results.cdnrReco : [{ Info: t('info_no_cdnr', lang) }]}
                  title="Credit / Debit Notes (CDNR) Reco"
                />
              )}

              {activeTab === 'hsn' && (
                <DataTable gstin={gstin} period={activePeriod.label}
                  data={results.hsnReco.length > 0 ? results.hsnReco : [{ Info: t('info_no_hsn', lang) }]}
                  title={t('tab_hsn', lang)}
                  maxHeight="520px"
                />
              )}

              {activeTab === 'download' && (
                <div className="p-8 text-center space-y-4">
                  <div className="max-w-md mx-auto space-y-2">
                    <h4 className="text-sm font-bold text-slate-800">Export GSTR-1 & 3B Reconciliation Workbook</h4>
                    <p className="text-xs text-slate-500">
                      Generates full Excel workbook with Dashboard, Month-wise, 3B Tie-out, B2B Reco and CDNR Reco sheets with audit protection enabled.
                    </p>
                  </div>
                  <button
                    onClick={handleDownloadFullExcel}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-[#0159D3] hover:bg-[#00347D] text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-98"
                  >
                    <Download className="w-4 h-4" />
                    {t('download_gstr1', lang)}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
