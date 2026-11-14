import React from 'react';
import { ModuleKey, LanguageCode, Period } from '../types';
import { t } from '../i18n/translations';
import { PeriodPicker } from './PeriodPicker';
import { formatDateDisplay } from '../services/periodManager';
import { CheckCircle2, AlertCircle, X, Files, FileSpreadsheet, Scale, Landmark, ReceiptText, Boxes, CalendarDays, Building2 } from 'lucide-react';
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
  <h3 className="mb-2 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#718096]">
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
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 pb-3 pt-3 sm:px-4">
        <div className="mb-3 flex items-center justify-between border-b border-[#E8EDF5] pb-2">
          <div>
            <h2 className="text-sm font-bold tracking-tight text-[#00347D]">Select Module</h2>
          </div>
          <button type="button" aria-label="Close modules" onClick={onClose}
            className="rounded-lg border border-[#E3EAF3] p-2 text-[#475569] hover:bg-[#EAF1FC] md:hidden">
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav aria-label="Reconciliation modules" className="mb-3">
          
          <div className="space-y-0.5">
            {MODULES.map(({ key, icon: Icon }) => {
              const selected = activeModule === key;
              return (
                <button key={key} type="button" aria-current={selected ? 'page' : undefined}
                  onClick={() => onModuleChange(key)}
                  className={`group flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-1 text-left transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0159D3] ${selected
                    ? 'border-[#0159D3] bg-[#0159D3] text-white shadow-[0_6px_16px_rgba(1,89,211,.2)]'
                    : 'border-transparent bg-transparent text-[#334155] hover:border-[#DDE8F6] hover:bg-[#F2F7FF]'}`}>
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-white/20 text-white' : 'bg-[#EFF5FD] text-[#0159D3] group-hover:bg-white'}`}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] font-semibold leading-5">{t(`mod_${key}`, lang)}</span>
                </button>
              );
            })}
          </div>
        </nav>

        <div className="mb-3 border-t border-[#E8EDF5] pt-3">
          <SectionHeading icon={Building2}>{t('sidebar_company', lang)}</SectionHeading>
          <div className="rounded-lg border border-[#E2E9F3] bg-[#FAFCFF] p-2.5">
            <label className="mb-1 block text-[10px] font-semibold text-[#475569]" htmlFor="suite-gstin">
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
                className={`w-full rounded-lg border bg-white py-2 pl-3 pr-9 font-mono text-xs uppercase tracking-wider text-[#0F172A] outline-none transition-shadow focus:border-[#0159D3] focus:ring-2 focus:ring-[#0159D3]/20 ${gstin.length > 0 && !isGstinValid
                  ? 'border-amber-400' : isGstinValid ? 'border-emerald-500' : 'border-[#D7E0EC]'}`}
              />
              {isGstinValid && <CheckCircle2 className="absolute right-3 top-2 h-4 w-4 text-emerald-600" aria-hidden="true" />}
              {gstin.length > 0 && !isGstinValid && <AlertCircle className="absolute right-3 top-2.5 h-4 w-4 text-amber-500" aria-hidden="true" />}
            </div>
            <div id="suite-gstin-help" className="mt-1 flex items-start justify-between gap-2 text-[10px] leading-4">
              <span className={`min-w-0 break-words ${gstinProblem ? 'font-medium text-amber-700' : 'text-[#718096]'}`}>
                {gstinProblem || (isGstinValid ? describeGstin(gstin) : t('gstin_caption', lang))}
              </span>
              <span className="shrink-0 font-mono text-[#94A3B8]">{gstin.length}/15</span>
            </div>
          </div>
        </div>

        <section aria-label="Reporting period" className="border-t border-[#E8EDF5] pt-3">
          <SectionHeading icon={CalendarDays}>{t('common_period', lang)}</SectionHeading>
          <div className="rounded-xl border border-[#E2E9F3] bg-[#FAFCFF] p-3">
            <PeriodPicker compact prefix="common" value={commonPeriod} onChange={onCommonPeriodChange} lang={lang} />
            <div className="mt-2 rounded-lg border border-[#DAE8F9] bg-[#EDF5FF] px-2 py-1.5 text-[10px] leading-4 text-[#375779]">
              {t('period_caption', lang, {
                label: commonPeriod.label,
                start: formatDateDisplay(commonPeriod.start),
                end: formatDateDisplay(commonPeriod.end),
              })}
            </div>
          </div>
        </section>
      </div>
    </aside>
  );
};
