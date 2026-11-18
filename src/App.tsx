import React, { useState, useEffect } from 'react';
import { ModuleKey, LanguageCode, Period } from './types';
import { Sidebar } from './components/Sidebar';
import { HeaderHero } from './components/HeaderHero';
import { Gst2aModule } from './components/modules/Gst2aModule';
import { Gstr1Module } from './components/modules/Gstr1Module';
import { GstRecoModule } from './components/modules/GstRecoModule';
import { BankRecoModule } from './components/modules/BankRecoModule';
import { TdsRecoModule } from './components/modules/TdsRecoModule';
import { StockRecoModule } from './components/modules/StockRecoModule';
import { periodBounds } from './services/periodManager';
import { t } from './i18n/translations';
import { Files, FileSpreadsheet, Scale, Landmark, ReceiptText, Boxes, SlidersHorizontal } from 'lucide-react';

const MOBILE_MODULES = [
  { key: 'gst2a', icon: Files }, { key: 'gstr1', icon: FileSpreadsheet },
  { key: 'gstreco', icon: Scale }, { key: 'bank', icon: Landmark },
  { key: 'tds', icon: ReceiptText }, { key: 'stock', icon: Boxes },
] as const;


export const App: React.FC = () => {
  const embedded = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('embedded') === '1';
  const [lang, setLang] = useState<LanguageCode>('en');
  const [activeModule, setActiveModule] = useState<ModuleKey>(() => {
    // Optional deep link from the Customer Portal's My Services cards.
    const allowed: ModuleKey[] = ['gst2a', 'gstr1', 'gstreco', 'bank', 'tds', 'stock'];
    const requested = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('module');
    return requested && allowed.includes(requested as ModuleKey) ? requested as ModuleKey : 'gst2a';
  });
  const [gstin, setGstin] = useState<string>('');
  const [commonPeriod, setCommonPeriod] = useState<Period>(() => periodBounds('monthly'));
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => !embedded);

  // Start collapsed on phones so the workspace gets the full width
  useEffect(() => {
    if (embedded || (typeof window !== 'undefined' && window.innerWidth < 1024)) {
      setIsSidebarOpen(false);
    }
  }, [embedded]);

  return (
    <div className={`${embedded ? 'embedded-gst-workspace ' : ''}min-h-screen bg-[#F5F8FC] text-[#0F172A] flex flex-col lg:flex-row antialiased relative`}>
      {/* Backdrop while the sidebar overlays the content on small screens */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className={`fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-40 transition-opacity ${embedded ? '' : 'lg:hidden'}`}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Navigation */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        lang={lang}
        onLanguageChange={setLang}
        activeModule={activeModule}
        onModuleChange={(mod) => { setActiveModule(mod); if (embedded || (typeof window !== 'undefined' && window.innerWidth < 768)) setIsSidebarOpen(false); }}
        gstin={gstin}
        onGstinChange={setGstin}
        commonPeriod={commonPeriod}
        onCommonPeriodChange={setCommonPeriod}
      />

      {/* Main Content Workspace */}
      <main className="gst-app-main flex-1 min-w-0 w-full max-w-[1440px] mx-auto px-3 py-4 sm:px-6 sm:py-6 lg:p-9 transition-all duration-300">
        {embedded && (
          <div className="gst-embedded-toolbar">
            <nav className="gst-embedded-tabs" aria-label="Reconciliation modules">
              {MOBILE_MODULES.map(({ key, icon: Icon }) => (
                <button key={key} type="button"
                  className={activeModule === key ? 'is-active' : ''}
                  aria-current={activeModule === key ? 'page' : undefined}
                  onClick={() => setActiveModule(key)}>
                  <Icon size={16} aria-hidden="true" />
                  <span>{t(`mod_${key}`, lang)}</span>
                </button>
              ))}
            </nav>
            <button type="button" className="gst-embedded-settings"
              aria-label="Configure GSTIN and reporting period"
              onClick={() => setIsSidebarOpen(true)}>
              <SlidersHorizontal size={17} aria-hidden="true" />
              <span>Settings</span>
            </button>
          </div>
        )}
        {!embedded && <nav className="gst-mobile-tabs lg:hidden" aria-label="Quick module navigation">
          <div className="gst-mobile-tabs-track">
            {MOBILE_MODULES.map(({ key, icon: Icon }) => (
              <button key={key} type="button"
                aria-current={activeModule === key ? 'page' : undefined}
                className={`gst-mobile-tab ${activeModule === key ? 'is-active' : ''}`}
                onClick={() => setActiveModule(key)}
              >
                <Icon size={17} aria-hidden="true" />
                <span>{t(`mod_${key}`, lang)}</span>
              </button>
            ))}
          </div>
          <button type="button" className="gst-mobile-settings"
            aria-label="Open company and reporting period settings"
            onClick={() => setIsSidebarOpen(true)}>
            <SlidersHorizontal size={19} />
          </button>
        </nav>}
        <HeaderHero
          module={activeModule}
          lang={lang}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        />

        {activeModule === 'gst2a' && (
          <Gst2aModule
            commonPeriod={commonPeriod}
            gstin={gstin}
            lang={lang}
            onSetGstin={setGstin}
          />
        )}

        {activeModule === 'gstr1' && (
          <Gstr1Module
            commonPeriod={commonPeriod}
            gstin={gstin}
            lang={lang}
            onSetGstin={setGstin}
          />
        )}

        {activeModule === 'gstreco' && (
          <GstRecoModule commonPeriod={commonPeriod} gstin={gstin} lang={lang} />
        )}

        {activeModule === 'bank' && (
          <BankRecoModule
            commonPeriod={commonPeriod}
            gstin={gstin}
            lang={lang}
          />
        )}

        {activeModule === 'tds' && (
          <TdsRecoModule
            commonPeriod={commonPeriod}
            gstin={gstin}
            lang={lang}
          />
        )}

        {activeModule === 'stock' && (
          <StockRecoModule
            commonPeriod={commonPeriod}
            gstin={gstin}
            lang={lang}
          />
        )}
      </main>
    </div>
  );
};

export default App;
