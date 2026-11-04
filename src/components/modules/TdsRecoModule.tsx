import React, { useState } from 'react';
import { LanguageCode, Period, TdsRecoResult } from '../../types';
import { t } from '../../i18n/translations';
import { PeriodPicker } from '../PeriodPicker';
import { KPICards } from '../KPICards';
import { DataTable } from '../DataTable';
import { lakh, formatDateDisplay } from '../../services/periodManager';
import { runTdsReconciliation } from '../../services/tdsRecoEngine';
import { exportToExcel } from '../../services/excelEngine';
import { Upload, Play, Download, Sparkles, Check, AlertCircle, Lock } from 'lucide-react';

interface Props {
  commonPeriod: Period;
  gstin: string;
  lang: LanguageCode;
}

export const TdsRecoModule: React.FC<Props> = ({ commonPeriod, gstin, lang }) => {
  const [overridePeriod, setOverridePeriod] = useState(false);
  const [localPeriod, setLocalPeriod] = useState<Period>(commonPeriod);

  const [tallyFile, setTallyFile] = useState<File | null>(null);
  const [caFile, setCaFile] = useState<File | null>(null);

  const [isRunning, setIsRunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [results, setResults] = useState<TdsRecoResult | null>(null);
  const [activeTab, setActiveTab] = useState<'summary' | 'monthly' | 'tally' | 'download'>('summary');

  const activePeriod = overridePeriod ? localPeriod : commonPeriod;

  const handleLoadSample = () => {
    const monthly = [
      { Month: 'Apr-2026', 'CA TDS payable': 45000, 'Tally TDS credited': 45000, Difference: 0, 'CA TDS paid': 45000, 'Tally payments (same month)': 45000 },
      { Month: 'May-2026', 'CA TDS payable': 62500, 'Tally TDS credited': 65000, Difference: 2500, 'CA TDS paid': 62500, 'Tally payments (same month)': 62500 },
      { Month: 'Jun-2026', 'CA TDS payable': 58000, 'Tally TDS credited': 58000, Difference: 0, 'CA TDS paid': 58000, 'Tally payments (same month)': 58000 },
      { Month: 'Period total', 'CA TDS payable': 165500, 'Tally TDS credited': 168000, Difference: 2500, 'CA TDS paid': 165500, 'Tally payments (same month)': 165500 },
    ];

    const sum = [
      { Item: 'Total credits in Tally TDS ledger (period)', Amount: 178000, Remark: '' },
      { Item: 'Less: credits flagged NOT TDS', Amount: -10000, Remark: 'Partner remuneration, P&L, write-off entries. Check.' },
      { Item: 'TDS-type credits in Tally', Amount: 168000, Remark: '' },
      { Item: 'Less: CA TDS payable', Amount: -165500, Remark: 'As per CA working sheet' },
      { Item: 'Net difference (Tally TDS - CA TDS)', Amount: 2500, Remark: 'Difference to verify' },
    ];

    const tallyRows = [
      { Date: '2026-04-10', Particulars: 'TDS - Contractors 194C', 'Voucher Type': 'Journal', 'Voucher No': 'JV-01', Debit: 0, Credit: 25000, Classification: 'TDS - purchase summary (JV)' },
      { Date: '2026-04-20', Particulars: 'TDS on Professional Fees 194J', 'Voucher Type': 'Journal', 'Voucher No': 'JV-02', Debit: 0, Credit: 20000, Classification: 'Check - journal credit' },
      { Date: '2026-04-30', Particulars: 'TDS Paid - Challan 281', 'Voucher Type': 'Payment', 'Voucher No': 'PV-10', Debit: 45000, Credit: 0, Classification: 'Payment to govt' },
      { Date: '2026-05-15', Particulars: 'Partner Remuneration', 'Voucher Type': 'Journal', 'Voucher No': 'JV-08', Debit: 0, Credit: 10000, Classification: 'NOT TDS - check' },
    ];

    setResults({
      summary: sum,
      monthlyReco: monthly,
      tallyEntries: tallyRows,
    });
    setErrorMsg(null);
    setSuccessMsg("Loaded sample TDS reconciliation dataset!");
  };

  const handleRun = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!tallyFile || !caFile) {
      const missing = [];
      if (!tallyFile) missing.push(t('upload_tally_tds', lang));
      if (!caFile) missing.push(t('upload_ca_tds', lang));
      setErrorMsg(`Please upload ${missing.join(' and ')}, or click 'Load Sample / Demo Data' to test immediately.`);
      return;
    }

    setIsRunning(true);
    try {
      const res = await runTdsReconciliation(tallyFile, caFile, activePeriod.start, activePeriod.end);
      setResults(res);
      setSuccessMsg("TDS reconciliation completed successfully!");
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
        'Monthly Reco': results.monthlyReco,
        'Tally Entries': results.tallyEntries,
      },
      `TDS_Reco_${activePeriod.start}_to_${activePeriod.end}.xlsx`,
      { gstin, period: `TDS ${activePeriod.start} to ${activePeriod.end}`, title: 'TDS Reconciliation' }
    );
  };

  const totalRow = results?.monthlyReco.find(r => r.Month === 'Period total');

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
            <PeriodPicker prefix="tds_local" value={localPeriod} onChange={setLocalPeriod} lang={lang} />
          </div>
        )}

        <div className="text-[11.5px] text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
          {t('selected_period', lang, {
            label: activePeriod.label,
            start: formatDateDisplay(activePeriod.start),
            end: formatDateDisplay(activePeriod.end),
          })}{' '}
          | {t('tds_info', lang)}
        </div>

        {/* Upload inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 bg-slate-50/60 hover:bg-slate-50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-700">{t('upload_tally_tds', lang)}</span>
              {tallyFile && <span className="text-[11px] text-emerald-600 font-medium">Selected</span>}
            </div>
            <label className="flex flex-col items-center justify-center gap-1.5 cursor-pointer py-3 bg-white border border-slate-200 rounded-lg shadow-2xs hover:border-slate-300 transition-all">
              <Upload className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-600 font-medium truncate max-w-[220px]">
                {tallyFile ? tallyFile.name : 'Choose Tally TDS Ledger (.xlsx)'}
              </span>
              <input
                type="file"
                accept=".xlsx,.xlsm"
                className="hidden"
                onChange={(e) => setTallyFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>

          <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 bg-slate-50/60 hover:bg-slate-50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-700">{t('upload_ca_tds', lang)}</span>
              {caFile && <span className="text-[11px] text-emerald-600 font-medium">Selected</span>}
            </div>
            <label className="flex flex-col items-center justify-center gap-1.5 cursor-pointer py-3 bg-white border border-slate-200 rounded-lg shadow-2xs hover:border-slate-300 transition-all">
              <Upload className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-600 font-medium truncate max-w-[220px]">
                {caFile ? caFile.name : 'Choose CA TDS Return (.xlsx)'}
              </span>
              <input
                type="file"
                accept=".xlsx,.xlsm"
                className="hidden"
                onChange={(e) => setCaFile(e.target.files?.[0] || null)}
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
            {isRunning ? t('reconciling', lang) : t('run_tds', lang)}
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
      </div>

      {results && totalRow && (
        <div className="space-y-4">
          <KPICards
            items={[
              {
                label: t('kpi_ca_tds_payable', lang),
                value: lakh(totalRow['CA TDS payable']),
                sub: t('sub_period_total', lang),
                color: 'blue',
              },
              {
                label: t('kpi_tally_tds', lang),
                value: lakh(totalRow['Tally TDS credited']),
                sub: t('sub_tds_credits', lang),
                color: 'green',
              },
              {
                label: t('kpi_difference', lang),
                value: lakh(totalRow.Difference),
                sub: t('sub_tally_minus_ca', lang),
                color: 'amber',
              },
              {
                label: t('kpi_ca_paid', lang),
                value: lakh(totalRow['CA TDS paid']),
                sub: t('sub_period_total', lang),
                color: 'blue',
              },
            ]}
          />

          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="flex border-b border-slate-200 bg-slate-50/50 px-2 overflow-x-auto">
              {[
                { id: 'summary', label: t('tab_summary', lang) },
                { id: 'monthly', label: t('tab_monthly', lang) },
                { id: 'tally', label: t('tab_tally_entries', lang) },
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
                <DataTable data={results.summary} title="TDS Reconciliation Summary" hideSearch />
              )}

              {activeTab === 'monthly' && (
                <DataTable data={results.monthlyReco} title="Monthly TDS Reconciliation" hideSearch />
              )}

              {activeTab === 'tally' && (
                <DataTable data={results.tallyEntries} title="Tally TDS Entries" maxHeight="480px" />
              )}

              {activeTab === 'download' && (
                <div className="p-8 text-center space-y-4">
                  <div className="max-w-md mx-auto space-y-2">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 mb-1">
                      <Lock className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Security Protected (Read-Only Sheet Lock Active)</span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-800">Export TDS Reconciliation Workbook</h4>
                    <p className="text-xs text-slate-500">
                      Download full Excel report with Summary, Monthly Reco and Classified Tally Entries with audit protection enabled.
                    </p>
                  </div>
                  <button
                    onClick={handleDownloadFullExcel}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-[#ff4b4b] hover:bg-[#e03a3a] text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-98"
                  >
                    <Download className="w-4 h-4" />
                    {t('download_tds', lang)}
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
