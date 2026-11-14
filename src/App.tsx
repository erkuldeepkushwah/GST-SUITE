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

export const App: React.FC = () => {
  const [lang, setLang] = useState<LanguageCode>('en');
  const [activeModule, setActiveModule] = useState<ModuleKey>('gst2a');
  const [gstin, setGstin] = useState<string>('');
  const [commonPeriod, setCommonPeriod] = useState<Period>(() => periodBounds('monthly'));
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);

  // Start collapsed on phones so the workspace gets the full width
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#F5F8FC] text-[#0F172A] flex flex-col md:flex-row antialiased relative">
      {/* Backdrop while the sidebar overlays the content on small screens */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-40 md:hidden transition-opacity"
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
        onModuleChange={(mod) => { setActiveModule(mod); if (typeof window !== 'undefined' && window.innerWidth < 768) setIsSidebarOpen(false); }}
        gstin={gstin}
        onGstinChange={setGstin}
        commonPeriod={commonPeriod}
        onCommonPeriodChange={setCommonPeriod}
      />

      {/* Main Content Workspace */}
      <main className="flex-1 min-w-0 p-4 sm:p-7 lg:p-10 max-w-[1440px] mx-auto w-full transition-all duration-300">
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
