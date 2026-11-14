import React from 'react';
import { ModuleKey, LanguageCode, Period } from '../types';
import { t } from '../i18n/translations';
import { PeriodPicker } from './PeriodPicker';
import { formatDateDisplay } from '../services/periodManager';
import { CheckCircle2, AlertCircle, X, Files, FileSpreadsheet, Scale, Landmark, ReceiptText, Boxes, ChevronRight, CalendarDays, Building2, ShieldCheck } from 'lucide-react';
import { describeGstin, gstinIssueKey, validateGstin } from '../services/validation';

interface Props {
  isOpen: boolean;
  onClose?: () => void;
  lang: LanguageCode;
  onLanguageChange: (lang: LanguageCode) => void;
  activeModule: ModuleKey;
  onModuleChange: (mod: ModuleKey) => void;
  gstin: string;
  onGstinChange: (gstin: string) => void;
  commonPeriod: Period;
  onCommonPeriodChange: (p: Period) => void;
}

const MODULES = [
  { key: 'gst2a', icon: Files, hint: '2A / 2B matching' },
  { key: 'gstr1', icon: FileSpreadsheet, hint: 'Returns & reporting' },
  { key: 'gstreco', icon: Scale, hint: 'GST reconciliation' },
  { key: 'bank', icon: Landmark, hint: 'Bank transactions' },
  { key: 'tds', icon: ReceiptText, hint: 'Tax deductions' },
  { key: 'stock', icon: Boxes, hint: 'Inventory matching' },
] as const satisfies ReadonlyArray<{ key: ModuleKey; icon: React.ElementType; hint: string }>;

const SectionHeading: React.FC<{ icon: React.ElementType; children: React.ReactNode }> = ({ icon: Icon, children }) => (
  <h3 className="mb-3 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#718096]">
    <Icon className="h-4 w-4 text-[#0159D3]" aria-hidden="true" />
    {children}
  </h3>
);

export const Sidebar: React.FC<Props> = ({
  isOpen, onClose, lang, onLanguageChange, activeModule, onModuleChange,
  gstin, onGstinChange, commonPeriod, onCommonPeriodChange,
}) => {
  const gstinCheck = validateGstin(gstin);
  const isGstinValid = gstinCheck.status === 'valid';
  const gstinProblem = gstinCheck.status === 'invalid'
    ? t(gstinIssueKey(gstinCheck.issue), lang, { code: gstinCheck.stateCode })
    : '';

  if (!isOpen) return null;

  return (
    <aside id="gst-suite-sidebar" aria-label="Solutions navigation"
      className="fixed inset-y-0 left-0 z-50 flex w-[min(92vw,350px)] flex-col overflow-hidden border-r border-[#E3EAF3] bg-white text-[#344056] shadow-2xl md:sticky md:top-0 md:z-auto md:h-screen md:w-[280px] md:shrink-0 md:shadow-none xl:w-[308px]">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pb-6 pt-5 sm:px-5">
        <div className="mb-6 rounded-2xl border border-[#D7E6FB] bg-gradient-to-br from-[#F0F6FF] via-white to-[#F7FAFF] p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-widest text-[#0159D3] ring-1 ring-[#DCE8F8]">
              <ShieldCheck className="h-3.5 w-3.5" /> Workspace
            </span>
            <button type="button" aria-label="Close modules" onClick={onClose}
              className="rounded-lg p-1.5 text-[#475569] hover:bg-[#EAF1FC] md:hidden">
              <X className="h-5 w-5" />
            </button>
          </div>
          <h2 className="text-lg font-extrabold tracking-tight text-[#00347D]">Solutions &amp; Modules</h2>
          <p className="mt-1.5 text-xs leading-5 text-[#64748B]">One workspace for your accounting and reconciliation.</p>
        </div>

        <nav aria-label="Reconciliation modules" className="mb-6">
          <div className="mb-3 flex items-center justify-between gap-2">
            <SectionHeading icon={Files}>{t('sidebar_module', lang)}</SectionHeading>
            <span className="mb-3 rounded-md bg-[#F1F5FA] px-2 py-1 text-[10px] font-semibold text-[#64748B]">06</span>
          </div>
          <div className="space-y-1.5">
            {MODULES.map(({ key, icon: Icon, hint }) => {
              const selected = activeModule === key;
              return (
                <button key={key} type="button" aria-current={selected ? 'page' : undefined}
                  onClick={() => onModuleChange(key)}
                  className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0159D3] ${selected
                    ? 'border-[#0159D3] bg-[#0159D3] text-white shadow-[0_6px_16px_rgba(1,89,211,.2)]'
                    : 'border-transparent bg-transparent text-[#334155] hover:border-[#DDE8F6] hover:bg-[#F2F7FF]'}`}>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${selected ? 'bg-white/20 text-white' : 'bg-[#EFF5FD] text-[#0159D3] group-hover:bg-white'}`}>
                    <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-bold leading-5">{t(`mod_${key}`, lang)}</span>
                    <span className={`block truncate text-[10px] leading-4 ${selected ? 'text-[#E1EBFF]' : 'text-[#8390A3]'}`}>{hint}</span>
                  </span>
                  <ChevronRight className={`h-4 w-4 shrink-0 ${selected ? 'text-white' : 'text-[#B3C0D0] group-hover:text-[#0159D3]'}`} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </nav>

        <div className="mb-5 border-t border-[#E8EDF5] pt-5">
          <SectionHeading icon={Building2}>{t('sidebar_company', lang)}</SectionHeading>
          <div className="rounded-xl border border-[#E2E9F3] bg-[#FAFCFF] p-3">
            <label className="mb-2 block text-[11px] font-semibold text-[#475569]" htmlFor="suite-gstin">
              {t('gstin_label', lang)}
            </label>
            <div className="relative">
              <input id="suite-gstin" type="text" value={gstin} maxLength={15}
                onChange={(e) => onGstinChange(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 15))}
                onPaste={(e) => {
                  const text = e.clipboardData.getData('text');
                  if (/[^0-9A-Za-z]/.test(text)) {
                    e.preventDefault();
                    onGstinChange(text.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 15));
                  }
                }}
                spellCheck={false} autoComplete="off"
                aria-invalid={gstinCheck.status === 'invalid'}
                aria-describedby="suite-gstin-help"
                placeholder="Enter 15-digit GSTIN"
                className={`w-full rounded-lg border bg-white py-2.5 pl-3 pr-9 font-mono text-xs uppercase tracking-wider text-[#0F172A] outline-none transition-shadow focus:border-[#0159D3] focus:ring-2 focus:ring-[#0159D3]/20 ${gstin.length > 0 && !isGstinValid
                  ? 'border-amber-400' : isGstinValid ? 'border-emerald-500' : 'border-[#D7E0EC]'}`}
              />
              {isGstinValid && <CheckCircle2 className="absolute right-3 top-2.5 h-4 w-4 text-emerald-600" aria-hidden="true" />}
              {gstin.length > 0 && !isGstinValid && <AlertCircle className="absolute right-3 top-2.5 h-4 w-4 text-amber-500" aria-hidden="true" />}
            </div>
            <div id="suite-gstin-help" className="mt-2 flex items-start justify-between gap-2 text-[10px] leading-4">
              <span className={`min-w-0 break-words ${gstinProblem ? 'font-medium text-amber-700' : 'text-[#718096]'}`}>
                {gstinProblem || (isGstinValid ? describeGstin(gstin) : t('gstin_caption', lang))}
              </span>
              <span className="shrink-0 font-mono text-[#94A3B8]">{gstin.length}/15</span>
            </div>
          </div>
        </div>

        <section aria-label="Reporting period" className="border-t border-[#E8EDF5] pt-5">
          <SectionHeading icon={CalendarDays}>{t('common_period', lang)}</SectionHeading>
          <div className="rounded-xl border border-[#E2E9F3] bg-[#FAFCFF] p-3">
            <PeriodPicker prefix="common" value={commonPeriod} onChange={onCommonPeriodChange} lang={lang} />
            <div className="mt-3 rounded-lg border border-[#DAE8F9] bg-[#EDF5FF] px-3 py-2.5 text-[10px] leading-5 text-[#375779]">
              {t('period_caption', lang, {
                label: commonPeriod.label,
                start: formatDateDisplay(commonPeriod.start),
                end: formatDateDisplay(commonPeriod.end),
              })}
            </div>
          </div>
        </section>
      </div>
      <div className="shrink-0 border-t border-[#E8EDF5] bg-white px-5 py-3">
        <p className="flex items-center gap-2 text-[10px] font-semibold text-[#718096]">
          <span className="h-2 w-2 rounded-full bg-[#16A34A]" /> Fingenuity Associates
        </p>
      </div>
    </aside>
  );
};
