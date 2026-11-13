import React from 'react';
import { ModuleKey, LanguageCode } from '../types';
import { t } from '../i18n/translations';
import { FIRM_NAME, FIRM_TAGLINE, LOGO_PATH } from '../services/branding';
import { Menu } from 'lucide-react';

interface Props {
  module: ModuleKey;
  lang: LanguageCode;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export const HeaderHero: React.FC<Props> = ({ module, lang, isSidebarOpen = true, onToggleSidebar }) => {
  return (
    <div className="mb-5">
      {/* Brand title line */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5 text-slate-800">
          {/* Single icon-only toggle: opens and closes the sidebar */}
          <button
            onClick={onToggleSidebar}
            type="button"
            title={isSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            aria-label={isSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            aria-expanded={isSidebarOpen}
            className="p-2 rounded-lg bg-white border border-[#DDE4EE] text-[#2563eb] hover:bg-[#eff6ff] hover:border-[#93c5fd] transition-colors shadow-2xs cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="w-8 h-8 rounded-lg bg-[#2563eb] flex items-center justify-center p-1 shadow-2xs overflow-hidden shrink-0">
            <img src={LOGO_PATH} alt={FIRM_NAME} className="w-full h-full object-contain" />
          </div>
          <div className="leading-tight">
            <span className="font-bold text-sm text-[#2563eb]">{FIRM_NAME}</span>
            <span className="text-xs text-slate-500 ml-2 hidden sm:inline">{FIRM_TAGLINE}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono px-2.5 py-1 bg-white/80 border border-slate-200 rounded-md text-slate-600 shadow-2xs hidden sm:inline">
            Indore, MP
          </span>
        </div>
      </div>

      {/* Streamlit Hero Gradient banner */}
      <div className="bg-gradient-to-r from-[#1e40af] via-[#1d4ed8] to-[#2563eb] text-white p-5 sm:p-6 rounded-xl shadow-xs">
        <span className="mb-3 block h-[3px] w-10 rounded-full bg-[#2563eb]" aria-hidden="true" />
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight mb-1 text-white">
          {t(`mod_${module}`, lang)}
        </h1>
        <p className="text-xs sm:text-sm text-blue-100/90 font-normal">
          {t('hero_sub', lang)}
        </p>
      </div>
    </div>
  );
};
