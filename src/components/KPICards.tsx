import React from 'react';
import { KPIItem } from '../types';

interface Props {
  items: KPIItem[];
}

export const KPICards: React.FC<Props> = ({ items }) => {
  const colorStyles: Record<string, string> = {
    green: 'bg-gradient-to-br from-[#1e8e5a] to-[#2fbf7b] text-white',
    amber: 'bg-gradient-to-br from-[#A8841D] to-[#0159D3] text-white',
    red: 'bg-gradient-to-br from-[#b3261e] to-[#e5534b] text-white',
    blue: 'bg-gradient-to-br from-[#00347D] to-[#0159D3] text-white',
  };

  return (
    <div
      className={`grid grid-cols-1 sm:grid-cols-2 gap-4 my-5 ${
        items.length >= 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'
      }`}
    >
      {items.map((kpi, idx) => (
        <div
          key={idx}
          className={`rounded-2xl p-5 shadow-[0_8px_20px_rgba(15,23,42,.08)] flex flex-col justify-between min-h-[120px] border border-white/10 transition-transform duration-200 hover:-translate-y-0.5 ${colorStyles[kpi.color] || colorStyles.blue}`}
        >
          <div className="text-[12px] font-semibold tracking-wide opacity-95">
            {kpi.label}
          </div>
          <div className="text-[27px] font-extrabold leading-tight my-2 tracking-tight">
            {kpi.value}
          </div>
          <div className="text-[11px] opacity-90 font-medium">
            {kpi.sub}
          </div>
        </div>
      ))}
    </div>
  );
};
