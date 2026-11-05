import React, { useEffect, useState } from 'react';
import { LanguageCode } from '../types';
import { t } from '../i18n/translations';
import { loadHistory, clearHistory, formatHistoryTime, ImportRecord, HISTORY_EVENT } from '../services/importHistory';
import { History, Trash2 } from 'lucide-react';

interface Props {
  lang: LanguageCode;
  limit?: number;
}

export const ImportHistory: React.FC<Props> = ({ lang, limit = 5 }) => {
  const [records, setRecords] = useState<ImportRecord[]>([]);

  useEffect(() => {
    const refresh = () => setRecords(loadHistory());
    refresh();
    window.addEventListener(HISTORY_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(HISTORY_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const shown = records.slice(0, limit);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
          <History className="w-3.5 h-3.5" />
          {t('history_title', lang)}
        </h3>
        {records.length > 0 && (
          <button
            onClick={() => {
              clearHistory();
              setRecords([]);
            }}
            type="button"
            title={t('history_clear', lang)}
            className="text-[11px] text-slate-500 hover:text-rose-600 flex items-center gap-1 cursor-pointer"
          >
            <Trash2 className="w-3 h-3" />
            {t('history_clear', lang)}
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="text-[11px] text-slate-500 bg-white/70 border border-slate-200 rounded-lg p-2.5">
          {t('history_empty', lang)}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {shown.map((r) => (
            <li key={r.id} className="bg-white/80 border border-slate-200 rounded-lg p-2 text-[11px] leading-snug">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-800">{t(`mod_${r.module}`, lang)}</span>
                <span className="text-slate-400 font-mono text-[10px]">{formatHistoryTime(r.at)}</span>
              </div>
              <div className="text-slate-600">{r.period}</div>
              <div className="text-slate-500 truncate" title={r.files.join(', ')}>
                {r.files.join(', ')}
              </div>
              <div className="text-slate-500">
                {t('history_rows', lang, { n: r.rows })}
                {r.gstin ? ` · ${r.gstin}` : ''}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
