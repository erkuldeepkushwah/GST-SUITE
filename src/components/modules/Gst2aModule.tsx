import React, { useState } from 'react';
import { LanguageCode, Period, BasisOption, Gst2aRecoResult, ManualNoteType } from '../../types';
import { t } from '../../i18n/translations';
import { PeriodPicker } from '../PeriodPicker';
import { recordImport } from '../../services/importHistory';
import { KPICards } from '../KPICards';
import { DataTable } from '../DataTable';
import { lakh, formatDateDisplay } from '../../services/periodManager';
import {
  parseWorkbookSheets,
  runGst2aReconciliation,
  loadManualNotes,
  saveManualNotes,
  mergeManualNotes
} from '../../services/recoCore';
import { exportToExcel, downloadCsv } from '../../services/excelEngine';
import { getSampleGst2aRows, SAMPLE_GSTIN } from '../../services/sampleData';
import { Upload, Play, Download, Sparkles, Check, AlertCircle, Lock } from 'lucide-react';

interface Props {
  commonPeriod: Period;
  gstin: string;
  lang: LanguageCode;
  onSetGstin: (gstin: string) => void;
}

export const Gst2aModule: React.FC<Props> = ({ commonPeriod, gstin, lang, onSetGstin }) => {
  const [overridePeriod, setOverridePeriod] = useState(false);
  const [localPeriod, setLocalPeriod] = useState<Period>(commonPeriod);
  const [basis, setBasis] = useState<BasisOption>('both');

  const [portalFile, setPortalFile] = useState<File | null>(null);
  const [booksFile, setBooksFile] = useState<File | null>(null);

  const [isRunning, setIsRunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [results, setResults] = useState<Gst2aRecoResult | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'b2b' | 'cdn' | 'gstr9' | 'confirm' | 'download'>('overview');

  // Manual note types review state
  const [reviewRows, setReviewRows] = useState<any[]>([]);

  const activePeriod = overridePeriod ? localPeriod : commonPeriod;

  const handleLoadSample = () => {
    if (!gstin) onSetGstin(SAMPLE_GSTIN);
    const { portal, books } = getSampleGst2aRows();
    const manualNotes = loadManualNotes();
    const res = runGst2aReconciliation(portal, books, gstin || SAMPLE_GSTIN, {
      startDate: activePeriod.start,
      endDate: activePeriod.end,
      basis,
      manualTypes: manualNotes,
    });
    setResults(res);
    setReviewRows(res.cdnReview);
    setErrorMsg(null);
    setSuccessMsg("Loaded sample reconciliation dataset!");
  };

  const handleRun = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (gstin.length !== 15) {
      setErrorMsg("Please enter a valid 15-character GSTIN in the sidebar (e.g. 23AAOFT2395R1ZA), or click 'Load Sample / Demo Data' to test immediately.");
      return;
    }
    if (!portalFile || !booksFile) {
      const missing = [];
      if (!portalFile) missing.push(t('upload_gstr2', lang));
      if (!booksFile) missing.push(t('upload_books_purchase', lang));
      setErrorMsg(`Please upload ${missing.join(' and ')}, or click 'Load Sample / Demo Data' to test immediately.`);
      return;
    }

    setIsRunning(true);
    try {
      const portalRows = await parseWorkbookSheets(portalFile, 'GSTR-2A');
      const booksRows = await parseWorkbookSheets(booksFile, 'BOOKS-PURCHASE');

      if (portalRows.length === 0 && booksRows.length === 0) {
        throw new Error("Could not find standard GSTR-2A or Books Purchase sheets in uploaded files. Please check sheet headers.");
      }

      const manualNotes = loadManualNotes();
      const res = runGst2aReconciliation(portalRows, booksRows, gstin, {
        startDate: activePeriod.start,
        endDate: activePeriod.end,
        basis,
        manualTypes: manualNotes,
      });

      setResults(res);
      setReviewRows(res.cdnReview);
      setSuccessMsg("Reconciliation completed successfully!");
      recordImport({ gstin, module: 'gst2a', period: activePeriod.label, files: [portalFile.name, booksFile.name], rows: res.b2bReco.length + res.cdnReco.length });
    } catch (e: any) {
      setErrorMsg(t('err_gst2a_failed', lang, { error: e.message || String(e) }));
    } finally {
      setIsRunning(false);
    }
  };

  const handleSaveNotes = () => {
    const updated: ManualNoteType[] = reviewRows.map(r => ({
      GSTIN: r.GSTIN,
      'Note No': r['Note No'],
      Type: r['Type (CN / DN)'],
      Basis: 'User confirmed in app',
    }));

    const current = loadManualNotes();
    const merged = mergeManualNotes(current, updated);
    saveManualNotes(merged);
    setSuccessMsg(t('notes_saved', lang, { n: updated.length }));
  };

  const handleNotesCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result as string;
        const lines = text.split(/\r?\n/).filter(Boolean);
        if (lines.length < 2) return;
        const headers = lines[0].split(',').map(h => h.trim());
        const gIdx = headers.indexOf('GSTIN');
        const nIdx = headers.indexOf('Note No');
        const tIdx = headers.indexOf('Type');
        if (gIdx === -1 || nIdx === -1 || tIdx === -1) {
          setErrorMsg(t('err_notes_csv', lang));
          return;
        }

        const incoming: ManualNoteType[] = [];
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(',').map(s => s.trim());
          if (parts.length > tIdx) {
            incoming.push({
              GSTIN: parts[gIdx],
              'Note No': parts[nIdx],
              Type: parts[tIdx].toUpperCase() === 'DN' ? 'DN' : 'CN',
              Basis: 'Uploaded CSV',
            });
          }
        }

        const merged = mergeManualNotes(loadManualNotes(), incoming);
        saveManualNotes(merged);
        setSuccessMsg(t('notes_loaded', lang, { n: incoming.length, name: file.name }));
      } catch (err: any) {
        setErrorMsg(t('err_notes_csv', lang));
      }
    };
    reader.readAsText(file);
  };

  const handleDownloadFullExcel = () => {
    if (!results) return;
    exportToExcel(
      {
        Dashboard: results.dashboard,
        'B2B Reco': results.b2bReco,
        'CDN Reco': results.cdnReco,
        'GSTR-9 ITC': results.gstr9Itc,
        'CDN Review': results.cdnReview,
      },
      `GST_2A_Reco_${gstin}_${activePeriod.label.replace(/\s+/g, '_')}.xlsx`,
      { gstin, period: activePeriod.label, title: 'GST 2A/2B Reconciliation' }
    );
  };

  // Compute KPI counts from Dashboard
  let b2bMatchedCnt = 0, b2bMatchedAmt = 0;
  let b2bMismatchCnt = 0, b2bMismatchAmt = 0;
  let only2aCnt = 0, only2aAmt = 0;
  let onlyBkCnt = 0, onlyBkAmt = 0;

  if (results) {
    for (const r of results.dashboard) {
      if (r.Section === 'B2B') {
        if (r.Status === 'Matched') {
          b2bMatchedCnt = r.Count || 0;
          b2bMatchedAmt = r['Taxable as per 2A'] || 0;
        } else if (r.Status === 'Mismatch') {
          b2bMismatchCnt = r.Count || 0;
          b2bMismatchAmt = r['Taxable as per 2A'] || 0;
        } else if (r.Status === 'Only in 2A') {
          only2aCnt = r.Count || 0;
          only2aAmt = r['Taxable as per 2A'] || 0;
        } else if (r.Status === 'Only in Books') {
          onlyBkCnt = r.Count || 0;
          onlyBkAmt = r['Taxable as per Books'] || 0;
        }
      }
    }
  }

  return (
    <div className="space-y-5">
      {/* Module options & Period override */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-700">{t('basis_label', lang)}:</span>
            <div className="flex items-center gap-4 text-xs font-medium text-slate-800">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="gst2a_basis"
                  value="both"
                  checked={basis === 'both'}
                  onChange={() => setBasis('both')}
                  className="accent-[#1f4e79]"
                />
                {t('basis_both', lang)}
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="gst2a_basis"
                  value="invoice"
                  checked={basis === 'invoice'}
                  onChange={() => setBasis('invoice')}
                  className="accent-[#1f4e79]"
                />
                {t('basis_invoice', lang)}
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="gst2a_basis"
                  value="return"
                  checked={basis === 'return'}
                  onChange={() => setBasis('return')}
                  className="accent-[#1f4e79]"
                />
                {t('basis_return', lang)}
              </label>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={overridePeriod}
              onChange={(e) => {
                const on = e.target.checked;
                setOverridePeriod(on);
                if (on) setLocalPeriod(commonPeriod);
              }}
              className="accent-[#1f4e79] rounded"
            />
            {t('override_period', lang)}
          </label>
        </div>

        {overridePeriod && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg max-w-md">
            <PeriodPicker prefix="gst2a_local" value={localPeriod} onChange={setLocalPeriod} lang={lang} />
          </div>
        )}

        <div className="text-[11.5px] text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
          <div className="font-semibold text-slate-700 mb-0.5">
            {t('reporting_window', lang, {
              label: activePeriod.label,
              start: formatDateDisplay(activePeriod.start),
              end: formatDateDisplay(activePeriod.end),
            })}
          </div>
          {t('basis_note', lang)}
        </div>

        {/* Upload inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* GSTR-2A File */}
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 bg-slate-50/60 hover:bg-slate-50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-700">{t('upload_gstr2', lang)}</span>
              {portalFile && <span className="text-[11px] text-emerald-600 font-medium">Selected</span>}
            </div>
            <label className="flex flex-col items-center justify-center gap-1.5 cursor-pointer py-3 bg-white border border-slate-200 rounded-lg shadow-2xs hover:border-slate-300 transition-all">
              <Upload className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-600 font-medium truncate max-w-[220px]">
                {portalFile ? portalFile.name : 'Choose Excel (.xlsx, .xlsm)'}
              </span>
              <input
                type="file"
                accept=".xlsx,.xlsm"
                className="hidden"
                onChange={(e) => setPortalFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>

          {/* Books Purchase Register File */}
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 bg-slate-50/60 hover:bg-slate-50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-700">{t('upload_books_purchase', lang)}</span>
              {booksFile && <span className="text-[11px] text-emerald-600 font-medium">Selected</span>}
            </div>
            <label className="flex flex-col items-center justify-center gap-1.5 cursor-pointer py-3 bg-white border border-slate-200 rounded-lg shadow-2xs hover:border-slate-300 transition-all">
              <Upload className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-600 font-medium truncate max-w-[220px]">
                {booksFile ? booksFile.name : 'Choose Excel (.xlsx, .xlsm)'}
              </span>
              <input
                type="file"
                accept=".xlsx,.xlsm"
                className="hidden"
                onChange={(e) => setBooksFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <button
            onClick={handleRun}
            disabled={isRunning}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#ff4b4b] hover:bg-[#e03a3a] text-white rounded-lg text-xs font-bold shadow-xs transition-all active:scale-98 disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {isRunning ? t('reconciling', lang) : t('run_gst2a', lang)}
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

        {results && (() => {
          // If the Books file carried no IGST/CGST/SGST columns, every pair shows a
          // tax difference. Say so instead of leaving a thousand "Mismatch" rows.
          const bkTax = results.b2bReco.reduce((s: number, r: any) => s + (r['Total Tax_BK'] || 0), 0);
          const pTax = results.b2bReco.reduce((s: number, r: any) => s + (r['Total Tax_2A'] || 0), 0);
          const noBooksTax = pTax > 0 && bkTax === 0;
          return noBooksTax ? (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg text-xs">
              Books file me IGST / CGST / SGST ke columns nahi mile, isliye har invoice me tax difference dikhega.
              Books register me 'Integrated Tax Paid', 'Central Tax Paid', 'State/UT Tax Paid' columns ke saath file dobara export karein.
            </div>
          ) : null;
        })()}
      </div>

      {/* Results View */}
      {results && (
        <div className="space-y-4">
          {/* KPIs */}
          <KPICards
            items={[
              {
                label: t('kpi_b2b_matched', lang),
                value: b2bMatchedCnt.toLocaleString(),
                sub: t('sub_taxable', lang, { amount: lakh(b2bMatchedAmt) }),
                color: 'green',
              },
              {
                label: t('kpi_b2b_mismatch', lang),
                value: b2bMismatchCnt.toLocaleString(),
                sub: t('sub_taxable', lang, { amount: lakh(b2bMismatchAmt) }),
                color: 'amber',
              },
              {
                label: t('kpi_only_2a_risk', lang),
                value: only2aCnt.toLocaleString(),
                sub: t('sub_taxable', lang, { amount: lakh(only2aAmt) }),
                color: 'red',
              },
              {
                label: t('kpi_only_books', lang),
                value: onlyBkCnt.toLocaleString(),
                sub: t('sub_taxable', lang, { amount: lakh(onlyBkAmt) }),
                color: 'blue',
              },
            ]}
          />

          {/* Streamlit-style Tabs navigation */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="flex border-b border-slate-200 bg-slate-50/50 px-2 overflow-x-auto">
              {[
                { id: 'overview', label: t('tab_overview', lang) },
                { id: 'b2b', label: t('tab_b2b', lang) },
                { id: 'cdn', label: t('tab_cdn', lang) },
                { id: 'gstr9', label: t('tab_gstr9', lang) },
                { id: 'confirm', label: t('tab_confirm', lang) },
                { id: 'download', label: t('tab_download', lang) },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 ${
                    activeTab === tab.id
                      ? 'border-[#ff4b4b] text-[#ff4b4b] bg-white'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="p-4">
              {activeTab === 'overview' && (
                <DataTable gstin={gstin} period={activePeriod.label} data={results.dashboard} title="Reconciliation Dashboard Summary" hideSearch />
              )}

              {activeTab === 'b2b' && (
                <DataTable gstin={gstin} period={activePeriod.label} data={results.b2bReco} title="B2B Invoices Reconciliation" maxHeight="520px" />
              )}

              {activeTab === 'cdn' && (
                <DataTable gstin={gstin} period={activePeriod.label} data={results.cdnReco} title="Credit / Debit Notes Reconciliation" maxHeight="520px" />
              )}

              {activeTab === 'gstr9' && (
                <div className="space-y-3">
                  <div className="text-xs text-slate-500 bg-blue-50/60 p-2.5 rounded-lg border border-blue-100">
                    {t('note_gstr9', lang)}
                  </div>
                  <DataTable gstin={gstin} period={activePeriod.label} data={results.gstr9Itc} title="GSTR-9 ITC Table Breakdown" hideSearch />
                </div>
              )}

              {activeTab === 'confirm' && (
                <div className="space-y-4">
                  <div className="text-xs text-slate-600 bg-amber-50/80 p-3 rounded-lg border border-amber-200">
                    {reviewRows.length > 0 ? t('note_confirm', lang) : t('notes_all_confirmed', lang)}
                  </div>

                  {reviewRows.length > 0 ? (
                    <div className="space-y-3">
                      <DataTable gstin={gstin} period={activePeriod.label}
                        data={reviewRows}
                        title="Unconfirmed Notes Requiring Verification"
                        editableColumn="Type (CN / DN)"
                        editableOptions={['CN', 'DN']}
                        onCellEdit={(rowIndex, col, val) => {
                          setReviewRows(reviewRows.map((r, i) => (i === rowIndex ? { ...r, [col]: val } : r)));
                        }}
                      />
                      <button
                        onClick={handleSaveNotes}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs"
                      >
                        {t('btn_save_notes', lang)}
                      </button>
                    </div>
                  ) : (
                    <div className="p-4 bg-emerald-50 text-emerald-800 rounded-lg text-xs font-medium">
                      {t('notes_all_confirmed', lang)}
                    </div>
                  )}

                  <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <button
                      onClick={() => downloadCsv(loadManualNotes(), 'manual_note_types.csv')}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                    >
                      <Download className="w-3.5 h-3.5" />
                      {t('btn_download_notes', lang)}
                    </button>

                    <label className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer">
                      <Upload className="w-3.5 h-3.5 text-slate-400" />
                      <span>{t('upload_notes_csv', lang)}</span>
                      <input type="file" accept=".csv" className="hidden" onChange={handleNotesCsvUpload} />
                    </label>
                  </div>
                </div>
              )}

              {activeTab === 'download' && (
                <div className="p-8 text-center space-y-4">
                  <div className="max-w-md mx-auto space-y-2">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 mb-1">
                      <Lock className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Security Protected (Read-Only Sheet Lock Active)</span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-800">Ready to export reconciliation report</h4>
                    <p className="text-xs text-slate-500">
                      Export includes Dashboard, B2B Reco, CDN Reco, GSTR-9 ITC and Notes Review in a formatted multi-sheet Excel spreadsheet with audit sheet protection enabled.
                    </p>
                  </div>
                  <button
                    onClick={handleDownloadFullExcel}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-[#ff4b4b] hover:bg-[#e03a3a] text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-98"
                  >
                    <Download className="w-4 h-4" />
                    {t('download_gst2a', lang)}
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
