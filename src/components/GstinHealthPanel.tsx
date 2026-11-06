import React, { useMemo } from 'react';
import { ShieldCheck, ShieldAlert, Download } from 'lucide-react';
import { LanguageCode } from '../types';
import { t } from '../i18n/translations';
import { DataTable } from './DataTable';
import { downloadCsv } from '../services/excelEngine';
import { GstinAuditSummary, gstinAuditRows } from '../services/gstinAudit';
import { gstinIssueKey } from '../services/validation';

interface Props {
  audit: GstinAuditSummary | null;
  lang: LanguageCode;
  /** Prefix for the downloaded CSV, usually the module name. */
  exportName?: string;
}

const Stat: React.FC<{ label: string; value: number; tone: 'green' | 'red' | 'amber' | 'slate' }> = ({
  label,
  value,
  tone,
}) => {
  const tones: Record<string, string> = {
    green: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    red: 'bg-rose-50 border-rose-200 text-rose-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    slate: 'bg-slate-50 border-slate-200 text-slate-700',
  };
  return (
    <div className={`rounded-lg border px-3 py-2 ${tones[tone]}`}>
      <div className="text-[10.5px] font-semibold uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-lg font-bold leading-tight">{value.toLocaleString()}</div>
    </div>
  );
};

export const GstinHealthPanel: React.FC<Props> = ({ audit, lang, exportName = 'GSTIN_Audit' }) => {
  const tableRows = useMemo(() => {
    if (!audit) return [];
    return gstinAuditRows(audit).map((row) => {
      const code = String(row['Issue Code'] || '');
      return { ...row, Issue: code ? t(gstinIssueKey(code as any), lang) : '' };
    });
  }, [audit, lang]);

  if (!audit || audit.checkedRows === 0) return null;

  const clean = audit.invalid === 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {clean ? (
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          ) : (
            <ShieldAlert className="w-4 h-4 text-rose-600" />
          )}
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            {t('gstin_health_title', lang)}
          </h3>
        </div>
        {!clean && (
          <button
            onClick={() => downloadCsv(tableRows, `${exportName}.csv`)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            {t('gstin_audit_download', lang)}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label={t('gstin_stat_valid', lang)} value={audit.validRows} tone="green" />
        <Stat label={t('gstin_stat_invalid', lang)} value={audit.invalidRows} tone={audit.invalidRows ? 'red' : 'slate'} />
        <Stat label={t('gstin_stat_missing', lang)} value={audit.missingRows} tone={audit.missingRows ? 'amber' : 'slate'} />
        <Stat label={t('gstin_stat_unique', lang)} value={audit.unique} tone="slate" />
      </div>

      <div className="text-[11.5px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
        {t('gstin_health_note', lang, { rows: audit.checkedRows })}
      </div>

      {clean ? (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-medium flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          {t('gstin_health_clean', lang, { checked: audit.checkedRows })}
        </div>
      ) : (
        <DataTable
          data={tableRows}
          title={t('gstin_issues_title', lang)}
          maxHeight="360px"
          hideSearch={tableRows.length < 8}
        />
      )}
    </div>
  );
};
