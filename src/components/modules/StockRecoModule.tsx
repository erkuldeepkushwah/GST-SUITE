import React, { useState } from 'react';
import { LanguageCode, Period, StockMode, StockSnapshotResult, StockMovementResult } from '../../types';
import { t } from '../../i18n/translations';
import { PeriodPicker } from '../PeriodPicker';
import { KPICards } from '../KPICards';
import { DataTable } from '../DataTable';
import { lakh, formatDateDisplay } from '../../services/periodManager';
import { runStockSnapshot, runStockMovement } from '../../services/stockRecoEngine';
import { exportToExcel } from '../../services/excelEngine';
import { Upload, Play, Download, Sparkles, Check, AlertCircle } from 'lucide-react';

interface Props {
  commonPeriod: Period;
  gstin: string;
  lang: LanguageCode;
}

export const StockRecoModule: React.FC<Props> = ({ commonPeriod, gstin, lang }) => {
  const [overridePeriod, setOverridePeriod] = useState(false);
  const [localPeriod, setLocalPeriod] = useState<Period>(commonPeriod);
  const [stockMode, setStockMode] = useState<StockMode>('snapshot');

  // Files
  const [snapshotFile, setSnapshotFile] = useState<File | null>(null);
  const [movementFile, setMovementFile] = useState<File | null>(null);
  const [closingFile, setClosingFile] = useState<File | null>(null);

  const [isRunning, setIsRunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [snapshotResult, setSnapshotResult] = useState<StockSnapshotResult | null>(null);
  const [movementResult, setMovementResult] = useState<StockMovementResult | null>(null);
  const [activeTab, setActiveTab] = useState<string>('summary');

  const activePeriod = overridePeriod ? localPeriod : commonPeriod;

  const handleLoadSample = () => {
    if (stockMode === 'snapshot') {
      const items = [
        { SN: '1)', ID: 'STK-001', Brand: 'Standard', Product: 'Steel Rod 12mm', UNT: 'KGS', Opening: 12000, Closing: 15400, StockValue: 770000, Rate: 50, MIS: '', Flags: '' },
        { SN: '2)', ID: 'STK-002', Brand: 'Standard', Product: 'Steel Angle 50x5', UNT: 'KGS', Opening: 8500, Closing: 6200, StockValue: 341000, Rate: 55, MIS: '', Flags: '' },
        { SN: '3)', ID: 'STK-003', Brand: 'Fastener', Product: 'Hex Bolt M10x50', UNT: 'PCS', Opening: 50000, Closing: 42000, StockValue: 126000, Rate: 3, MIS: '', Flags: '' },
        { SN: '4)', ID: 'STK-004', Brand: 'Chemical', Product: 'Industrial Primer 20L', UNT: 'NOS', Opening: 150, Closing: -5, StockValue: -4500, Rate: 900, MIS: '', Flags: 'NEGATIVE STOCK' },
        { SN: '5)', ID: 'STK-005', Brand: 'Chemical', Product: 'Zinc Spray 400ml', UNT: 'NOS', Opening: 200, Closing: 80, StockValue: null, Rate: null, MIS: '', Flags: 'QTY BUT NO VALUE' },
      ];

      const sum = [
        { Check: "Items sum vs grand total: Opening value", 'Per items': 1241500, 'Per report total': 1241500, Difference: 0, Status: "Tied" },
        { Check: "Items sum vs grand total: Closing qty", 'Per items': 63675, 'Per report total': 63675, Difference: 0, Status: "Tied" },
        { Check: "Items sum vs grand total: Stock value", 'Per items': 1232500, 'Per report total': 1232500, Difference: 0, Status: "Tied" },
        { Check: "Unit-wise closing qty (KGS, PCS, NOS)", 'Per items': '', 'Per report total': '', Difference: 0, Status: "Tied for all units" },
        { Check: "Negative stock items", 'Per items': 1, 'Per report total': '', Difference: -4500, Status: "Exception: value column shows the negative amount" },
        { Check: "Qty present but stock value blank", 'Per items': 1, 'Per report total': '', Difference: 80, Status: "Exception: qty units (value not included in total)" },
        { Check: "Rate below ₹1 per unit", 'Per items': 0, 'Per report total': '', Difference: 0, Status: "Check cost entry" },
        { Check: "Duplicate product name (same name, two IDs)", 'Per items': 0, 'Per report total': '', Difference: '', Status: "Check item master" },
      ];

      const unitTie = [
        { UNT: 'KGS', 'Per items': 21600, 'Per report': 21600, Difference: 0 },
        { UNT: 'PCS', 'Per items': 42000, 'Per report': 42000, Difference: 0 },
        { UNT: 'NOS', 'Per items': 75, 'Per report': 75, Difference: 0 },
      ];

      const exc = items.filter(it => it.Flags !== '');

      setSnapshotResult({
        summary: sum,
        unitTieOut: unitTie,
        exceptions: exc,
        allItems: items,
        tied: true,
      });
      setActiveTab('summary');
    } else {
      // Movement mode sample
      const items = [
        { Item: 'Steel Rod 12mm', Unit: 'KGS', Opening: 12000, Inward: 8000, Outward: 4600, Closing: 15400, 'Calculated Closing': 15400, Difference: 0, Flags: '' },
        { Item: 'Steel Angle 50x5', Unit: 'KGS', Opening: 8500, Inward: 2000, Outward: 4300, Closing: 6200, 'Calculated Closing': 6200, Difference: 0, Flags: '' },
        { Item: 'Industrial Primer 20L', Unit: 'NOS', Opening: 150, Inward: 0, Outward: 155, Closing: -5, 'Calculated Closing': -5, Difference: 0, Flags: 'NEGATIVE CLOSING' },
        { Item: 'Safety Goggles UV400', Unit: 'PCS', Opening: 300, Inward: 500, Outward: 200, Closing: 580, 'Calculated Closing': 600, Difference: -20, Flags: 'MOVEMENT DOES NOT TALLY' },
      ];

      const sum = [
        { Check: "Total items in movement register", 'Per items': 4, Status: "Complete" },
        { Check: "Items where Opening + Inward - Outward == Closing", 'Per items': 3, Status: "1 Mismatches" },
        { Check: "Items with negative closing stock", 'Per items': 1, Status: "Action Required" },
        { Check: "Discrepancy with closing stock summary", 'Per items': 0, Status: "Tied" },
      ];

      const exc = items.filter(it => it.Flags !== '');

      setMovementResult({
        summary: sum,
        exceptions: exc,
        allItems: items,
      });
      setActiveTab('summary');
    }

    setErrorMsg(null);
    setSuccessMsg(`Loaded sample Stock ${stockMode === 'snapshot' ? 'Snapshot' : 'Movement'} data!`);
  };

  const handleRun = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    setIsRunning(true);
    try {
      if (stockMode === 'snapshot') {
        if (!snapshotFile) {
          setErrorMsg("Please upload Tally Stock Report (.xlsx), or click 'Load Sample / Demo Data' to test immediately.");
          return;
        }
        const res = await runStockSnapshot(snapshotFile);
        setSnapshotResult(res);
        setSuccessMsg("Stock summary check completed successfully!");
      } else {
        if (!movementFile) {
          setErrorMsg("Please upload Tally Stock Movement Register (.xlsx), or click 'Load Sample / Demo Data' to test immediately.");
          return;
        }
        const res = await runStockMovement(movementFile, closingFile || undefined);
        setMovementResult(res);
        setSuccessMsg("Stock movement reconciliation completed successfully!");
      }
    } catch (e: any) {
      setErrorMsg(e.message || String(e));
    } finally {
      setIsRunning(false);
    }
  };

  const handleDownloadSnapshot = () => {
    if (!snapshotResult) return;
    exportToExcel(
      {
        Summary: snapshotResult.summary,
        'Unit Tie-out': snapshotResult.unitTieOut,
        Exceptions: snapshotResult.exceptions,
        'All Items': snapshotResult.allItems,
      },
      `Stock_Check_${activePeriod.label.replace(/\s+/g, '_')}.xlsx`,
      { gstin, period: `Stock summary ${activePeriod.label}`, title: 'Stock Report Check' }
    );
  };

  const handleDownloadMovement = () => {
    if (!movementResult) return;
    exportToExcel(
      {
        Summary: movementResult.summary,
        Exceptions: movementResult.exceptions,
        'All Items': movementResult.allItems,
      },
      `Stock_Movement_${activePeriod.label.replace(/\s+/g, '_')}.xlsx`,
      { gstin, period: `Stock movement ${activePeriod.label}`, title: 'Stock Movement Reconciliation' }
    );
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-4">
        {/* Mode radio */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-700">{t('stock_mode_label', lang)}:</span>
            <div className="flex items-center gap-4 text-xs font-medium text-slate-800">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="stock_mode"
                  value="snapshot"
                  checked={stockMode === 'snapshot'}
                  onChange={() => {
                    setStockMode('snapshot');
                    setActiveTab('summary');
                  }}
                  className="accent-[#1f4e79]"
                />
                {t('stock_snapshot', lang)}
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="stock_mode"
                  value="movement"
                  checked={stockMode === 'movement'}
                  onChange={() => {
                    setStockMode('movement');
                    setActiveTab('summary');
                  }}
                  className="accent-[#1f4e79]"
                />
                {t('stock_movement', lang)}
              </label>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={overridePeriod}
              onChange={(e) => setOverridePeriod(e.target.checked)}
              className="accent-[#1f4e79] rounded"
            />
            {t('override_period', lang)}
          </label>
        </div>

        {overridePeriod && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg max-w-md">
            <PeriodPicker prefix="stock_local" value={localPeriod} onChange={setLocalPeriod} lang={lang} />
          </div>
        )}

        <div className="text-[11.5px] text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
          {stockMode === 'snapshot' ? (
            t('stock_snapshot_info', lang, { date: formatDateDisplay(activePeriod.end) })
          ) : (
            t('stock_movement_info', lang)
          )}
        </div>

        {/* Upload inputs */}
        {stockMode === 'snapshot' ? (
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 bg-slate-50/60 hover:bg-slate-50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-700">{t('upload_tally_stock', lang)}</span>
              {snapshotFile && <span className="text-[11px] text-emerald-600 font-medium">Selected</span>}
            </div>
            <label className="flex flex-col items-center justify-center gap-1.5 cursor-pointer py-3 bg-white border border-slate-200 rounded-lg shadow-2xs hover:border-slate-300 transition-all">
              <Upload className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-600 font-medium truncate max-w-[260px]">
                {snapshotFile ? snapshotFile.name : 'Choose Tally Stock Report (.xlsx)'}
              </span>
              <input
                type="file"
                accept=".xlsx,.xlsm"
                className="hidden"
                onChange={(e) => setSnapshotFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 bg-slate-50/60 hover:bg-slate-50 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-700">{t('upload_stock_movement', lang)}</span>
                {movementFile && <span className="text-[11px] text-emerald-600 font-medium">Selected</span>}
              </div>
              <label className="flex flex-col items-center justify-center gap-1.5 cursor-pointer py-3 bg-white border border-slate-200 rounded-lg shadow-2xs hover:border-slate-300 transition-all">
                <Upload className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-600 font-medium truncate max-w-[220px]">
                  {movementFile ? movementFile.name : 'Choose Movement Register (.xlsx)'}
                </span>
                <input
                  type="file"
                  accept=".xlsx,.xlsm"
                  className="hidden"
                  onChange={(e) => setMovementFile(e.target.files?.[0] || null)}
                />
              </label>
            </div>

            <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 bg-slate-50/60 hover:bg-slate-50 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-700">{t('upload_stock_closing', lang)}</span>
                {closingFile && <span className="text-[11px] text-emerald-600 font-medium">Selected</span>}
              </div>
              <label className="flex flex-col items-center justify-center gap-1.5 cursor-pointer py-3 bg-white border border-slate-200 rounded-lg shadow-2xs hover:border-slate-300 transition-all">
                <Upload className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-600 font-medium truncate max-w-[220px]">
                  {closingFile ? closingFile.name : 'Choose Closing Stock Summary (.xlsx)'}
                </span>
                <input
                  type="file"
                  accept=".xlsx,.xlsm"
                  className="hidden"
                  onChange={(e) => setClosingFile(e.target.files?.[0] || null)}
                />
              </label>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <button
            onClick={handleRun}
            disabled={isRunning}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#ff4b4b] hover:bg-[#e03a3a] text-white rounded-lg text-xs font-bold shadow-xs transition-all active:scale-98 disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {isRunning ? t('checking', lang) : (stockMode === 'snapshot' ? t('run_stock', lang) : t('run_stock_movement', lang))}
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

      {/* Snapshot Results */}
      {stockMode === 'snapshot' && snapshotResult && (
        <div className="space-y-4">
          <KPICards
            items={[
              {
                label: t('kpi_neg_stock', lang),
                value: snapshotResult.exceptions.filter(r => r.Closing < 0).length.toLocaleString(),
                sub: t('sub_value', lang, { amount: lakh(snapshotResult.exceptions.filter(r => r.Closing < 0).reduce((s, r) => s + (r.StockValue || 0), 0)) }),
                color: 'red',
              },
              {
                label: t('kpi_qty_no_value', lang),
                value: snapshotResult.exceptions.filter(r => r.Closing > 0 && r.StockValue === null).length.toLocaleString(),
                sub: t('sub_units', lang, { n: snapshotResult.exceptions.filter(r => r.Closing > 0 && r.StockValue === null).reduce((s, r) => s + (r.Closing || 0), 0) }),
                color: 'amber',
              },
              {
                label: t('kpi_tieout', lang),
                value: snapshotResult.tied ? t('tied', lang) : t('not_tied', lang),
                sub: snapshotResult.tied ? t('sub_items_total', lang) : t('sub_see_summary', lang),
                color: snapshotResult.tied ? 'green' : 'red',
              },
              {
                label: t('kpi_items_checked', lang),
                value: snapshotResult.allItems.length.toLocaleString(),
                sub: t('sub_stock_register', lang),
                color: 'blue',
              },
            ]}
          />

          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="flex border-b border-slate-200 bg-slate-50/50 px-2 overflow-x-auto">
              {[
                { id: 'summary', label: t('tab_summary', lang) },
                { id: 'exceptions', label: t('tab_exceptions', lang) },
                { id: 'allItems', label: 'All Items' },
                { id: 'download', label: t('tab_download', lang) },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
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
                <div className="space-y-4">
                  <DataTable data={snapshotResult.summary} title="Stock Consistency Summary" hideSearch />
                  <DataTable data={snapshotResult.unitTieOut} title="Unit Tie-Out" hideSearch />
                </div>
              )}

              {activeTab === 'exceptions' && (
                <DataTable data={snapshotResult.exceptions} title="Stock Exceptions" maxHeight="480px" />
              )}

              {activeTab === 'allItems' && (
                <DataTable data={snapshotResult.allItems} title="All Stock Items" maxHeight="480px" />
              )}

              {activeTab === 'download' && (
                <div className="p-8 text-center space-y-4">
                  <div className="max-w-md mx-auto space-y-2">
                    <h4 className="text-sm font-bold text-slate-800">Export Stock Summary Check</h4>
                    <p className="text-xs text-slate-500">
                      Download full Excel workbook with Summary, Unit Tie-out, Exceptions and All Items.
                    </p>
                  </div>
                  <button
                    onClick={handleDownloadSnapshot}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-[#ff4b4b] hover:bg-[#e03a3a] text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-98"
                  >
                    <Download className="w-4 h-4" />
                    {t('download_stock', lang)}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Movement Results */}
      {stockMode === 'movement' && movementResult && (
        <div className="space-y-4">
          <KPICards
            items={[
              {
                label: t('kpi_stock_items', lang),
                value: movementResult.allItems.length.toLocaleString(),
                sub: t('sub_stock_movement', lang),
                color: 'blue',
              },
              {
                label: t('kpi_movement_errors', lang),
                value: movementResult.allItems.filter(r => r.Flags.includes("MOVEMENT DOES NOT TALLY")).length.toLocaleString(),
                sub: t('sub_opening_inward_outward', lang),
                color: movementResult.allItems.some(r => r.Flags.includes("MOVEMENT DOES NOT TALLY")) ? 'red' : 'green',
              },
              {
                label: t('kpi_neg_closing', lang),
                value: movementResult.allItems.filter(r => r.Closing < 0).length.toLocaleString(),
                sub: t('sub_neg_closing', lang),
                color: movementResult.allItems.some(r => r.Closing < 0) ? 'amber' : 'green',
              },
              {
                label: t('kpi_crosscheck_diff', lang),
                value: movementResult.allItems.filter(r => r.Flags.includes("DIFFERS FROM CLOSING SUMMARY")).length.toString(),
                sub: t('sub_crosscheck', lang),
                color: movementResult.allItems.some(r => r.Flags.includes("DIFFERS FROM CLOSING SUMMARY")) ? 'red' : 'green',
              },
            ]}
          />

          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="flex border-b border-slate-200 bg-slate-50/50 px-2 overflow-x-auto">
              {[
                { id: 'summary', label: t('tab_summary', lang) },
                { id: 'exceptions', label: t('tab_stock_exceptions', lang) },
                { id: 'download', label: t('tab_download', lang) },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
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
                <DataTable data={movementResult.summary} title="Stock Movement Summary" hideSearch />
              )}

              {activeTab === 'exceptions' && (
                <DataTable
                  data={movementResult.exceptions.length > 0 ? movementResult.exceptions : [{ Info: t('info_no_exceptions', lang) }]}
                  title="Stock Movement Exceptions"
                  maxHeight="480px"
                />
              )}

              {activeTab === 'download' && (
                <div className="p-8 text-center space-y-4">
                  <div className="max-w-md mx-auto space-y-2">
                    <h4 className="text-sm font-bold text-slate-800">Export Stock Movement Reconciliation</h4>
                    <p className="text-xs text-slate-500">
                      Download full Excel report with Movement Summary, Exceptions and All Items.
                    </p>
                  </div>
                  <button
                    onClick={handleDownloadMovement}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-[#ff4b4b] hover:bg-[#e03a3a] text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-98"
                  >
                    <Download className="w-4 h-4" />
                    {t('download_stock_movement', lang)}
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
