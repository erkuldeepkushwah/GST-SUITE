import React from 'react';
import { Period, PeriodMode, LanguageCode } from '../types';
import { periodBounds, availableFyYears, fyLabel } from '../services/periodManager';
import { t } from '../i18n/translations';

interface Props {
  prefix: string;
  value: Period;
  onChange: (p: Period) => void;
  lang: LanguageCode;
}

export const PeriodPicker: React.FC<Props> = ({ value, onChange, lang }) => {
  const fyYears = availableFyYears();
  const currentMode = (value.mode.toLowerCase() === 'financial year' ? 'fy' : value.mode.toLowerCase()) as PeriodMode;

  const handleModeChange = (newMode: PeriodMode) => {
    try {
      if (newMode === 'custom') {
        const p = periodBounds('custom', { start: value.start, end: value.end });
        onChange(p);
      } else {
        const p = periodBounds(newMode);
        onChange(p);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value; // YYYY-MM
    if (!val) return;
    const [year, month] = val.split('-').map(Number);
    const dateObj = new Date(year, month - 1, 1);
    onChange(periodBounds('monthly', { month: dateObj }));
  };

  const handleQuarterChange = (fyStart: number, q: number) => {
    onChange(periodBounds('quarterly', { fyStartYear: fyStart, quarter: q }));
  };

  const handleFyChange = (fyStart: number) => {
    onChange(periodBounds('fy', { fyStartYear: fyStart }));
  };

  const handleCustomDateChange = (fromVal?: string, toVal?: string) => {
    let start = fromVal !== undefined ? fromVal : value.start;
    let end = toVal !== undefined ? toVal : value.end;
    // Empty input: keep the current range instead of jumping back to today
    if (!start || !end) return;
    // Editing one end pulls the other along, so the range never silently swaps
    if (fromVal !== undefined && start > end) end = start;
    if (toVal !== undefined && end < start) start = end;
    try {
      onChange(periodBounds('custom', { start, end }));
    } catch {
      // ignore transient invalid dates
    }
  };

  // Determine active FY from current start date
  const startD = new Date(value.start);
  const activeFy = startD.getMonth() >= 3 ? startD.getFullYear() : startD.getFullYear() - 1;

  // Active Quarter
  const activeQ = Math.floor(((startD.getMonth() - 3 + 12) % 12) / 3) + 1;

  return (
    <div className="space-y-2.5">
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          {t('period_type', lang)}
        </label>
        <select
          value={currentMode}
          onChange={(e) => handleModeChange(e.target.value as PeriodMode)}
          className="w-full text-xs bg-white border border-slate-300 rounded-md px-2.5 py-1.5 font-medium text-slate-800 focus:ring-1 focus:ring-[#1f4e79] focus:border-[#1f4e79]"
        >
          <option value="monthly">{t('mode_monthly', lang)}</option>
          <option value="quarterly">{t('mode_quarterly', lang)}</option>
          <option value="fy">{t('mode_fy', lang)}</option>
          <option value="custom">{t('mode_custom', lang)}</option>
        </select>
      </div>

      {currentMode === 'monthly' && (
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            {t('select_month', lang)}
          </label>
          <input
            type="month"
            value={value.start.slice(0, 7)}
            onChange={handleMonthChange}
            className="w-full text-xs bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-800 font-medium focus:ring-1 focus:ring-[#1f4e79]"
          />
        </div>
      )}

      {currentMode === 'quarterly' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('financial_year', lang)}
            </label>
            <select
              value={activeFy}
              onChange={(e) => handleQuarterChange(Number(e.target.value), activeQ)}
              className="w-full text-xs bg-white border border-slate-300 rounded-md px-2 py-1.5 text-slate-800 font-medium focus:ring-1 focus:ring-[#1f4e79]"
            >
              {fyYears.map((yr) => (
                <option key={yr} value={yr}>
                  {fyLabel(yr)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('quarter', lang)}
            </label>
            <select
              value={activeQ}
              onChange={(e) => handleQuarterChange(activeFy, Number(e.target.value))}
              className="w-full text-xs bg-white border border-slate-300 rounded-md px-2 py-1.5 text-slate-800 font-medium focus:ring-1 focus:ring-[#1f4e79]"
            >
              <option value={1}>Q1 (Apr-Jun)</option>
              <option value={2}>Q2 (Jul-Sep)</option>
              <option value={3}>Q3 (Oct-Dec)</option>
              <option value={4}>Q4 (Jan-Mar)</option>
            </select>
          </div>
        </div>
      )}

      {currentMode === 'fy' && (
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            {t('financial_year', lang)}
          </label>
          <select
            value={activeFy}
            onChange={(e) => handleFyChange(Number(e.target.value))}
            className="w-full text-xs bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-800 font-medium focus:ring-1 focus:ring-[#1f4e79]"
          >
            {fyYears.map((yr) => (
              <option key={yr} value={yr}>
                {fyLabel(yr)}
              </option>
            ))}
          </select>
        </div>
      )}

      {currentMode === 'custom' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('from_date', lang)}
            </label>
            <input
              type="date"
              value={value.start}
              onChange={(e) => handleCustomDateChange(e.target.value, undefined)}
              className="w-full text-xs bg-white border border-slate-300 rounded-md px-2 py-1.5 text-slate-800 font-medium focus:ring-1 focus:ring-[#1f4e79]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('to_date', lang)}
            </label>
            <input
              type="date"
              value={value.end}
              onChange={(e) => handleCustomDateChange(undefined, e.target.value)}
              className="w-full text-xs bg-white border border-slate-300 rounded-md px-2 py-1.5 text-slate-800 font-medium focus:ring-1 focus:ring-[#1f4e79]"
            />
          </div>
        </div>
      )}
    </div>
  );
};
