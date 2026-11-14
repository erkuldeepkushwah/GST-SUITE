import React from 'react';
import { ModuleKey, LanguageCode } from '../types';
import { t } from '../i18n/translations';
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
      {/* Sidebar toggle only - the brand line and the location chip were removed */}
      <div className="flex items-center mb-3">
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
