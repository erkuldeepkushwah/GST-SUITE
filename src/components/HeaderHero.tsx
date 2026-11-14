import React from 'react';
import { ModuleKey, LanguageCode } from '../types';
import { t } from '../i18n/translations';
import { Menu, ChevronRight, Layers3, ShieldCheck } from 'lucide-react';

interface Props {
  module: ModuleKey;
  lang: LanguageCode;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export const HeaderHero: React.FC<Props> = ({ module, lang, isSidebarOpen = true, onToggleSidebar }) => (
  <header className="mb-7">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-medium text-[#64748B]">
        <span>Solutions &amp; Modules</span>
        <ChevronRight className="h-3.5 w-3.5 text-[#94A3B8]" aria-hidden="true" />
        <span className="text-[#0159D3]">{t(`mod_${module}`, lang)}</span>
      </nav>
      <button
        onClick={onToggleSidebar}
        type="button"
        title={isSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        aria-label={isSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        aria-expanded={isSidebarOpen}
        className="inline-flex items-center gap-2 rounded-xl border border-[#DDE4EE] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#00347D] shadow-sm transition-colors hover:border-[#7FA8E4] hover:bg-[#EAF1FC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0159D3]"
      >
        <Menu className="h-4 w-4" />
        <span>{isSidebarOpen ? 'Hide modules' : 'Browse modules'}</span>
      </button>
    </div>

    <div className="relative isolate overflow-hidden rounded-[24px] border border-[#00347D] bg-gradient-to-br from-[#00347D] via-[#06468E] to-[#0159D3] px-6 py-8 text-white shadow-[0_16px_40px_rgba(0,52,125,0.15)] sm:px-9 sm:py-10">
      <div className="pointer-events-none absolute -right-16 -top-28 h-72 w-72 rounded-full border-[45px] border-white/5" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-36 right-12 h-64 w-64 rounded-full bg-white/5 blur-2xl" aria-hidden="true" />
      <div className="relative z-10 max-w-2xl">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-blue-50">
          <Layers3 className="h-3.5 w-3.5" />
          Fingenuity Solutions
        </div>
        <h1 className="mb-3 text-2xl font-extrabold leading-tight tracking-tight text-white sm:text-3xl lg:text-[34px]">
          {t(`mod_${module}`, lang)}
        </h1>
        <p className="max-w-xl text-sm leading-7 text-[#E1ECFF] sm:text-[15px]">
          {t('hero_sub', lang)}
        </p>
        <div className="mt-6 inline-flex items-center gap-2 border-t border-white/20 pt-4 text-xs font-medium text-blue-50/90">
          <ShieldCheck className="h-4 w-4 text-[#BDD6FF]" />
          Built for accurate, streamlined reconciliation
        </div>
      </div>
    </div>
  </header>
);
