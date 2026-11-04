import React, { useState } from 'react';
import { LanguageCode, Period, BankRecoResult } from '../../types';
import { t } from '../../i18n/translations';
import { PeriodPicker } from '../PeriodPicker';
import { recordImport } from '../../services/importHistory';
import { KPICards } from '../KPICards';
import { DataTable } from '../DataTable';
import { lakh, formatDateDisplay } from '../../services/periodManager';
import { runBankReconciliation } from '../../services/bankRecoEngine';
import { exportToExcel } from '../../services/excelEngine';
import { Upload, Play, Download, Sparkles, Check, AlertCircle, Lock } from 'lucide-react';

interface Props {
  commonPeriod: Period;
  gstin: string;
  lang: LanguageCode;
}

export const BankRecoModule: React.FC<Props> = ({ commonPeriod, gstin, lang }) => {
  const [overridePeriod, setOverridePeriod] = useState(false);
  const [localPeriod, setLocalPeriod] = useState<Period>(commonPeriod);

  const [stmtFile, setStmtFile] = useState<File | null>(null);
  const [ledgerFile, setLedgerFile] = useState<File | null>(null);

  const [isRunning, setIsRunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [resultsPeriod, setResultsPeriod] = useState<string>('');
  const [results, setResults] = useState<BankRecoResult | null>(null);
  const [activeTab, setActiveTab] = useState<'summary' | 'closing' | 'exceptions' | 'entries' | 'download'>('summary');

  const activePeriod = overridePeriod ? localPeriod : commonPeriod;

  const handleLoadSample = () => {
    // Generate realistic demo bank reconciliation data
    const matchedRows = [
      {
        Source: 'Tally', 'Date (Book)': '2026-04-04', 'Date (Bank)': '2026-04-05',
        Particulars: 'Vendor Payment - Apex Ind', Voucher: 'PV-101', 'UTR/Ref': 'AXISN12884920',
        'Amount (Book)': -125000, 'Amount (Bank)': -125000, 'Narration (Bank)': 'AXISN12884920 APEX IND',
        Status: 'Matched', Action: ''
      },
      {
        Source: 'Tally', 'Date (Book)': '2026-04-10', 'Date (Bank)': '2026-04-10',
        Particulars: 'Customer Receipt - Omega Corp', Voucher: 'RV-202', 'UTR/Ref': 'HDFCR9911223',
        'Amount (Book)': 340000, 'Amount (Bank)': 340000, 'Narration (Bank)': 'NEFT CR HDFCR9911223 OMEGA',
        Status: 'Matched', Action: ''
      },
      {
        Source: 'Tally', 'Date (Book)': '2026-04-18', 'Date (Bank)': '2026-04-19',
        Particulars: 'Salary Transfer April', Voucher: 'PV-105', 'UTR/Ref': 'CMS0048192',
        'Amount (Book)': -215000, 'Amount (Bank)': -215000, 'Narration (Bank)': 'CMS BULK PAY SALARY',
        Status: 'Matched', Action: ''
      }
    ];

    const unrecordedBank = [
      {
        Source: 'Bank', 'Date (Book)': '', 'Date (Bank)': '2026-04-28',
        Particulars: '', Voucher: '', 'UTR/Ref': 'CHG/26/04',
        'Amount (Book)': 0, 'Amount (Bank)': -1450, 'Narration (Bank)': 'BANK CHARGES & GST Q1',
        Status: 'In Bank, not in Books', Action: 'Bank me hai, Tally me entry nahi. Entry banayein ya narration check karein'
      }
    ];

    const unclearedBooks = [
      {
        Source: 'Tally', 'Date (Book)': '2026-04-29', 'Date (Bank)': '',
        Particulars: 'Cheque Issued - Reliance Fuels', Voucher: 'CHQ-8812', 'UTR/Ref': '881201',
        'Amount (Book)': -48000, 'Amount (Bank)': 0, 'Narration (Bank)': '',
        Status: 'In Books, not in Bank', Action: 'Bank me entry nahi mili. Cheque clearing ya date check karein'
      }
    ];

    const all = [...matchedRows, ...unrecordedBank, ...unclearedBooks];
    const exceptions = [...unrecordedBank, ...unclearedBooks];

    const closing = [
      { Item: 'Closing Balance as per Books (Tally)', Amount: 1450000, Remark: 'Ledger balance at period end' },
      { Item: 'Add: In Bank, not in Books', Amount: -1450, Remark: 'Direct debits (bank charges) to be booked' },
      { Item: 'Less: In Books, not in Bank', Amount: 48000, Remark: 'Cheque in clearing (adds back to bank balance)' },
      { Item: 'Reconciled Bank Balance', Amount: 1496550, Remark: 'Adjusted balance' },
      { Item: 'Closing Balance as per Bank Statement', Amount: 1496550, Remark: 'Actual statement balance' },
      { Item: 'Unexplained Difference', Amount: 0, Remark: 'Fully reconciled' },
    ];

    const sum = [
      { Check: 'Total Ledger Entries', Value: 4 },
      { Check: 'Total Statement Transactions', Value: 4 },
      { Check: 'Matched Entries', Value: 3 },
      { Check: 'Uncleared Books Entries', Value: 1 },
      { Check: 'Unrecorded Bank Transactions', Value: 1 },
      { Check: 'Closing Difference', Value: 0 },
    ];

    setResults({
      summary: sum,
      closingReconciliation: closing,
      exceptions,
      allEntries: all,
    });
    setErrorMsg(null);
    setSuccessMsg("Loaded sample bank reconciliation dataset!");
  };

  const handleRun = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!stmtFile || !ledgerFile) {
      const missing = [];
      if (!stmtFile) missing.push(t('upload_bank_stmt', lang));
      if (!ledgerFile) missing.push(t('upload_tally_bank', lang));
      setErrorMsg(`Please upload ${missing.join(' and ')}, or click 'Load Sample / Demo Data' to test immediately.`);
      return;
    }

    setIsRunning(true);
    try {
      const res = await runBankReconciliation(stmtFile, ledgerFile, activePeriod.start, activePeriod.end);
      setResults(res);
      setSuccessMsg("Bank reconciliation completed successfully!");
      setResultsPeriod(activePeriod.label);
      recordImport({ gstin, module: 'bank', period: activePeriod.label, files: [stmtFile.name, ledgerFile.name], rows: res.allEntries.length });
    } catch (e: any) {
      setErrorMsg(e.message || String(e));
    } finally {
      setIsRunning(false);
    }
  };

  const handleDownloadFullExcel = () => {
    if (!results) return;
    exportToExcel(
      {
        Summary: results.summary,
        'Closing Reconciliation': results.closingReconciliation,
        Exceptions: results.exceptions,
        'All Entries': results.allEntries,
      },
      `Bank_Reco_${activePeriod.label.replace(/\s+/g, '_')}.xlsx`,
      { gstin, period: `Bank reco ${activePeriod.label}`, title: 'Bank Reconciliation' }
    );
  };

  const matchedCount = results?.allEntries.filter(r => r.Status === 'Matched').length || 0;
  const inBooksNotBankCount = results?.allEntries.filter(r => r.Status === 'In Books, not in Bank').length || 0;
  const inBankNotBooksCount = results?.allEntries.filter(r => r.Status === 'In Bank, not in Books').length || 0;
  const closingDiff = results?.closingReconciliation.slice(-1)[0]?.Amount ?? 0;

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-4">
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
              className="accent-[#1f4e79] rounded"
            />
            {t('override_period', lang)}
          </label>
        </div>

        {overridePeriod && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg max-w-md">
            <PeriodPicker prefix="bank_local" value={localPeriod} onChange={setLocalPeriod} lang={lang} />
          </div>
        )}

        <div className="text-[11.5px] text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
          {t('selected_period', lang, {
            label: activePeriod.label,
            start: formatDateDisplay(activePeriod.start),
            end: formatDateDisplay(activePeriod.end),
          })}{' '}
          {t('bank_caption_note', lang)}
        </div>

        {/* Upload inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 bg-slate-50/60 hover:bg-slate-50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-700">{t('upload_bank_stmt', lang)}</span>
              {stmtFile && <span className="text-[11px] text-emerald-600 font-medium">Selected</span>}
            </div>
            <label className="flex flex-col items-center justify-center gap-1.5 cursor-pointer py-3 bg-white border border-slate-200 rounded-lg shadow-2xs hover:border-slate-300 transition-all">
              <Upload className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-600 font-medium truncate max-w-[220px]">
                {stmtFile ? stmtFile.name : 'Choose Statement (.xls, .xlsx)'}
              </span>
              <input
                type="file"
                accept=".xls,.xlsx"
                className="hidden"
                onChange={(e) => setStmtFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>

          <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 bg-slate-50/60 hover:bg-slate-50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-700">{t('upload_tally_bank', lang)}</span>
              {ledgerFile && <span className="text-[11px] text-emerald-600 font-medium">Selected</span>}
            </div>
            <label className="flex flex-col items-center justify-center gap-1.5 cursor-pointer py-3 bg-white border border-slate-200 rounded-lg shadow-2xs hover:border-slate-300 transition-all">
              <Upload className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-600 font-medium truncate max-w-[220px]">
                {ledgerFile ? ledgerFile.name : 'Choose Tally Bank Ledger (.xlsx, .xlsm)'}
              </span>
              <input
                type="file"
                accept=".xlsx,.xlsm"
                className="hidden"
                onChange={(e) => setLedgerFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <button
            onClick={handleRun}
            disabled={isRunning}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#ff4b4b] hover:bg-[#e03a3a] text-white rounded-lg text-xs font-bold shadow-xs transition-all active:scale-98 disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {isRunning ? t('reconciling', lang) : t('run_bank', lang)}
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

      {results && (
        <div className="space-y-4">
          <KPICards
            items={[
              {
                label: t('kpi_bank_matched', lang),
                value: matchedCount.toLocaleString(),
                sub: t('sub_amount_date', lang),
                color: 'green',
              },
              {
                label: t('kpi_books_not_bank', lang),
                value: inBooksNotBankCount.toLocaleString(),
                sub: t('sub_timing', lang),
                color: 'amber',
              },
              {
                label: t('kpi_bank_not_books', lang),
                value: inBankNotBooksCount.toLocaleString(),
                sub: t('sub_entry_needed', lang),
                color: 'red',
              },
              {
                label: t('kpi_closing_diff', lang),
                value: lakh(closingDiff),
                sub: t('sub_unexplained', lang),
                color: 'blue',
              },
            ]}
          />

          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="flex border-b border-slate-200 bg-slate-50/50 px-2 overflow-x-auto">
              {[
                { id: 'summary', label: t('tab_summary', lang) },
                { id: 'closing', label: t('tab_closing', lang) },
                { id: 'exceptions', label: t('tab_exceptions', lang) },
                { id: 'entries', label: t('tab_all_entries', lang) },
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
              {activeTab === 'summary' && (
                <DataTable gstin={gstin} period={activePeriod.label} data={results.summary} title="Bank Reconciliation Summary" hideSearch />
              )}

              {activeTab === 'closing' && (
                <DataTable gstin={gstin} period={activePeriod.label} data={results.closingReconciliation} title="Closing Reconciliation" hideSearch />
              )}

              {activeTab === 'exceptions' && (
                <DataTable gstin={gstin} period={activePeriod.label} data={results.exceptions} title="Unmatched Exceptions" maxHeight="480px" />
              )}

              {activeTab === 'entries' && (
                <DataTable gstin={gstin} period={activePeriod.label} data={results.allEntries} title="All Transactions" maxHeight="480px" />
              )}

              {activeTab === 'download' && (
                <div className="p-8 text-center space-y-4">
                  <div className="max-w-md mx-auto space-y-2">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 mb-1">
                      <Lock className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Security Protected (Read-Only Sheet Lock Active)</span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-800">Export Bank Reconciliation Workbook</h4>
                    <p className="text-xs text-slate-500">
                      Download full Excel report with Summary, Closing Reconciliation, Exceptions and All Entries with audit protection enabled.
                    </p>
                  </div>
                  <button
                    onClick={handleDownloadFullExcel}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-[#ff4b4b] hover:bg-[#e03a3a] text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-98"
                  >
                    <Download className="w-4 h-4" />
                    {t('download_bank', lang)}
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
