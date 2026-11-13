import React from 'react';
import { KPIItem } from '../types';

interface Props {
  items: KPIItem[];
}

export const KPICards: React.FC<Props> = ({ items }) => {
  const colorStyles: Record<string, string> = {
    green: 'bg-gradient-to-br from-[#1e8e5a] to-[#2fbf7b] text-white',
    amber: 'bg-gradient-to-br from-[#A8841D] to-[#2563eb] text-white',
    red: 'bg-gradient-to-br from-[#b3261e] to-[#e5534b] text-white',
    blue: 'bg-gradient-to-br from-[#1e40af] to-[#2563eb] text-white',
  };

  return (
    <div
      className={`grid grid-cols-1 sm:grid-cols-2 gap-3.5 my-4 ${
        items.length >= 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'
      }`}
    >
      {items.map((kpi, idx) => (
        <div
          key={idx}
          className={`rounded-xl p-4 shadow-sm flex flex-col justify-between min-h-[96px] ${colorStyles[kpi.color] || colorStyles.blue}`}
        >
          <div className="text-[13px] font-medium tracking-wide opacity-90 truncate">
            {kpi.label}
          </div>
          <div className="text-[26px] font-bold leading-tight my-1 tracking-tight">
            {kpi.value}
          </div>
          <div className="text-[12px] opacity-90 truncate font-normal">
            {kpi.sub}
          </div>
        </div>
      ))}
    </div>
  );
};
