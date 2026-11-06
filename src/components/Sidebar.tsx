import React from 'react';
import { ModuleKey, LanguageCode, Period } from '../types';
import { t } from '../i18n/translations';
import { PeriodPicker } from './PeriodPicker';
import { formatDateDisplay } from '../services/periodManager';
import { FIRM_NAME, FIRM_TAGLINE, FIRM_LOCATION, SIDEBAR_BANNER_PATH, LOGO_PATH } from '../services/branding';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { describeGstin, gstinIssueKey, validateGstin } from '../services/validation';
import { ImportHistory } from './ImportHistory';

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

const MODULE_KEYS: ModuleKey[] = ['gst2a', 'gstr1', 'bank', 'tds', 'stock'];

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
    <aside className="fixed inset-y-0 left-0 z-50 w-full overflow-y-auto bg-[#f0f2f6] border-r border-[#d5dae2] flex flex-col justify-between gap-8 p-5 text-[#31333f] shadow-2xl md:sticky md:top-0 md:h-screen md:w-72 lg:w-80 md:shrink-0 md:z-auto md:shadow-none">
      <div className="space-y-6">
        {/* Logo / Banner */}
        <div className="flex items-center justify-between pt-1">
          <img
            src={SIDEBAR_BANNER_PATH}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = LOGO_PATH;
            }}
            alt={FIRM_NAME}
            className="h-9 w-auto object-contain"
          />
        </div>



        {/* Module selection */}
        <div>
          <h3 className="text-sm font-bold text-slate-800 mb-2 uppercase tracking-wider text-[11px]">
            {t('sidebar_module', lang)}
          </h3>
          <div className="space-y-1.5">
            {MODULE_KEYS.map((k) => {
              const isSelected = activeModule === k;
              return (
                <button
                  key={k}
                  onClick={() => onModuleChange(k)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-medium transition-all flex items-center justify-between ${
                    isSelected
                      ? 'bg-[#1f3a5f] text-white shadow-xs font-semibold'
                      : 'bg-white/80 hover:bg-white text-slate-700 border border-transparent hover:border-slate-300'
                  }`}
                >
                  <span>{t(`mod_${k}`, lang)}</span>
                  {isSelected && <span className="w-2 h-2 rounded-full bg-[#f0b429]"></span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Company GSTIN */}
        <div>
          <h3 className="text-sm font-bold text-slate-800 mb-2 uppercase tracking-wider text-[11px]">
            {t('sidebar_company', lang)}
          </h3>
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
              className={`w-full text-xs font-mono tracking-wider bg-white border rounded-lg px-3 py-2 text-slate-800 uppercase focus:ring-1 focus:ring-[#1f4e79] ${
                gstin.length > 0 && !isGstinValid
                  ? 'border-amber-400 bg-amber-50/20'
                  : isGstinValid
                  ? 'border-emerald-500 bg-emerald-50/20'
                  : 'border-[#d5dae2]'
              }`}
            />
            {isGstinValid && (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 absolute right-2.5 top-2.5" />
            )}
            {gstin.length > 0 && !isGstinValid && (
              <AlertCircle className="w-4 h-4 text-amber-500 absolute right-2.5 top-2.5" />
            )}
          </div>
          <div className="flex justify-between items-start gap-2 mt-1 text-[11px] text-slate-500">
            <span className={gstinProblem ? 'text-amber-700 font-medium' : ''}>
              {gstinProblem
                ? gstinProblem
                : isGstinValid
                ? describeGstin(gstin)
                : t('gstin_caption', lang)}
            </span>
            <span className="shrink-0">{gstin.length}/15</span>
          </div>
        </div>

        {/* Import history */}
        <ImportHistory lang={lang} />

        {/* Common Reporting Period */}
        <div>
          <h3 className="text-sm font-bold text-slate-800 mb-2 uppercase tracking-wider text-[11px]">
            {t('common_period', lang)}
          </h3>
          <PeriodPicker
            prefix="common"
            value={commonPeriod}
            onChange={onCommonPeriodChange}
            lang={lang}
          />
          <div className="mt-2 p-2 bg-slate-200/60 rounded text-[11px] text-slate-600">
            {t('period_caption', lang, {
              label: commonPeriod.label,
              start: formatDateDisplay(commonPeriod.start),
              end: formatDateDisplay(commonPeriod.end),
            })}
          </div>
        </div>
      </div>

      {/* About Box in sidebar footer */}
      <div className="pt-6 border-t border-[#d5dae2] text-xs text-slate-500 leading-relaxed mt-6">
        <b className="text-slate-800 font-semibold block mb-0.5">{t('about_heading', lang)}</b>
        <div className="font-medium text-slate-700">{FIRM_NAME}</div>
        <div className="text-[11px] text-slate-500 my-0.5">{FIRM_TAGLINE}</div>
        <div className="text-[11px] text-slate-400">{FIRM_LOCATION}</div>
      </div>
    </aside>
  );
};
