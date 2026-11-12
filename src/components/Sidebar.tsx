import React from 'react';
import { ModuleKey, LanguageCode, Period } from '../types';
import { t } from '../i18n/translations';
import { PeriodPicker } from './PeriodPicker';
import { formatDateDisplay } from '../services/periodManager';
import { FIRM_NAME, FIRM_TAGLINE, FIRM_LOCATION, SIDEBAR_BANNER_PATH, LOGO_PATH } from '../services/branding';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { describeGstin, gstinIssueKey, validateGstin } from '../services/validation';

interface Props {
  isOpen: boolean;
  lang: LanguageCode;
  onLanguageChange: (lang: LanguageCode) => void;
  activeModule: ModuleKey;
  onModuleChange: (mod: ModuleKey) => void;
  gstin: string;
  onGstinChange: (gstin: string) => void;
  commonPeriod: Period;
  onCommonPeriodChange: (p: Period) => void;
}

const MODULE_KEYS: ModuleKey[] = ['gst2a', 'gstr1', 'gstreco', 'bank', 'tds', 'stock'];

/** Section label with the gold tick taken from the logo. */
const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.09em] text-[#64748B]">
    <span className="h-3 w-[3px] rounded-full bg-[#C9A227]" aria-hidden="true" />
    {children}
  </h3>
);

export const Sidebar: React.FC<Props> = ({
  isOpen,
  lang,
  onLanguageChange,
  activeModule,
  onModuleChange,
  gstin,
  onGstinChange,
  commonPeriod,
  onCommonPeriodChange,
}) => {
  const gstinCheck = validateGstin(gstin);
  const isGstinValid = gstinCheck.status === 'valid';
  const gstinProblem =
    gstinCheck.status === 'invalid'
      ? t(gstinIssueKey(gstinCheck.issue), lang, { code: gstinCheck.stateCode })
      : '';

  if (!isOpen) {
    return null;
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-50 w-full overflow-y-auto bg-white border-r border-[#DDE4EE] flex flex-col justify-between gap-6 p-5 text-[#344056] shadow-2xl md:sticky md:top-0 md:h-screen md:w-72 lg:w-80 md:shrink-0 md:z-auto md:shadow-none">
      <div className="space-y-7">
        {/* Logo / Banner */}
        <div className="flex items-center justify-between pt-1">
          <img
            src={SIDEBAR_BANNER_PATH}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = LOGO_PATH;
            }}
            alt={FIRM_NAME}
            className="h-10 w-auto object-contain"
          />
        </div>
        <div className="h-px bg-[#DDE4EE]" />



        {/* Module selection */}
        <div>
          <SectionLabel>{t('sidebar_module', lang)}</SectionLabel>
          <div className="space-y-1.5">
            {MODULE_KEYS.map((k) => {
              const isSelected = activeModule === k;
              return (
                <button
                  key={k}
                  onClick={() => onModuleChange(k)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-xs transition-colors flex items-center justify-between gap-2 ${
                    isSelected
                      ? 'bg-[#165DFC] text-white shadow-sm font-semibold'
                      : 'bg-white text-[#344056] border border-[#DDE4EE] font-medium hover:bg-[#EEF6FF] hover:border-[#8AC4FF] hover:text-[#062E80]'
                  }`}
                >
                  <span>{t(`mod_${k}`, lang)}</span>
                  {isSelected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C9A227] ring-2 ring-white/40" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Company GSTIN */}
        <div>
          <SectionLabel>{t('sidebar_company', lang)}</SectionLabel>
          <div className="relative">
            <input
              type="text"
              value={gstin}
              maxLength={15}
              onChange={(e) =>
                onGstinChange(
                  e.target.value
                    .toUpperCase()
                    .replace(/[^0-9A-Z]/g, '')
                    .slice(0, 15)
                )
              }
              onPaste={(e) => {
                // Portals often copy GSTINs with spaces or hyphens in them.
                const text = e.clipboardData.getData('text');
                if (/[^0-9A-Za-z]/.test(text)) {
                  e.preventDefault();
                  onGstinChange(text.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 15));
                }
              }}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={gstinCheck.status === 'invalid'}
              placeholder={t('gstin_label', lang)}
              className={`w-full text-xs font-mono tracking-wider bg-white border rounded-lg py-2 pl-3 pr-8 text-[#0F172A] uppercase outline-none transition-shadow focus:ring-2 focus:ring-[#165DFC]/30 focus:border-[#165DFC] ${
                gstin.length > 0 && !isGstinValid
                  ? 'border-amber-400 bg-amber-50/20'
                  : isGstinValid
                  ? 'border-emerald-500 bg-emerald-50/20'
                  : 'border-[#DDE4EE]'
              }`}
            />
            {isGstinValid && (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 absolute right-2.5 top-2.5" />
            )}
            {gstin.length > 0 && !isGstinValid && (
              <AlertCircle className="w-4 h-4 text-amber-500 absolute right-2.5 top-2.5" />
            )}
          </div>
          <div className="flex items-baseline justify-between gap-2 mt-1.5 text-[11px] leading-snug text-[#64748B]">
            <span className={`min-w-0 truncate ${gstinProblem ? 'text-amber-700 font-medium' : ''}`}>
              {gstinProblem
                ? gstinProblem
                : isGstinValid
                ? describeGstin(gstin)
                : t('gstin_caption', lang)}
            </span>
            <span className="shrink-0 font-mono text-[#94A3B8]">{gstin.length}/15</span>
          </div>
        </div>

        {/* Common Reporting Period */}
        <div>
          <SectionLabel>{t('common_period', lang)}</SectionLabel>
          <PeriodPicker
            prefix="common"
            value={commonPeriod}
            onChange={onCommonPeriodChange}
            lang={lang}
          />
          <div className="mt-2 p-2.5 bg-[#EEF6FF] border border-[#DDE4EE] rounded-lg text-[11px] leading-snug text-[#47566B]">
            {t('period_caption', lang, {
              label: commonPeriod.label,
              start: formatDateDisplay(commonPeriod.start),
              end: formatDateDisplay(commonPeriod.end),
            })}
          </div>
        </div>
      </div>

      {/* About box in the sidebar footer */}
      <div className="mt-2 border-t-2 border-[#C9A227]/30 pt-4 text-xs leading-relaxed text-[#64748B]">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.09em] text-[#94A3B8]">
          {t('about_heading', lang)}
        </div>
        <div className="font-semibold text-[#062E80]">{FIRM_NAME}</div>
        <div className="my-0.5 text-[11px] text-[#64748B]">{FIRM_TAGLINE}</div>
        <div className="text-[11px] text-[#94A3B8]">{FIRM_LOCATION}</div>
      </div>
    </aside>
  );
};
