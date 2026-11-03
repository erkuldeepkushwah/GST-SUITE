import React, { useState, useMemo } from 'react';
import { Search, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { downloadCsv } from '../services/excelEngine';

interface Props {
  data: Array<Record<string, any>>;
  title?: string;
  maxHeight?: string;
  editableColumn?: string;
  editableOptions?: string[];
  onCellEdit?: (rowIndex: number, column: string, newValue: any) => void;
  hideSearch?: boolean;
}

export const DataTable: React.FC<Props> = ({
  data,
  title,
  maxHeight = '480px',
  editableColumn,
  editableOptions = [],
  onCellEdit,
  hideSearch = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const columns = useMemo(() => {
    if (!data || data.length === 0) return [];
    return Object.keys(data[0]);
  }, [data]);

  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return data;
    const term = searchTerm.toLowerCase();
    return data.filter((row) =>
      columns.some((col) => String(row[col] ?? '').toLowerCase().includes(term))
    );
  }, [data, columns, searchTerm]);

  const totalPages = Math.ceil(filteredData.length / pageSize) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage, pageSize]);

  const handleDownloadCsv = () => {
    downloadCsv(data, `${title || 'export'}.csv`);
  };

  const getStatusBadge = (val: any) => {
    const s = String(val).toLowerCase();
    if (s === 'matched' || s === 'tied' || s === 'all tally') {
      return <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">Matched</span>;
    }
    if (s.includes('mismatch') || s === 'difference' || s.includes('not tied')) {
      return <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">{String(val)}</span>;
    }
    if (s.includes('only in 2a') || s.includes('only in portal') || s.includes('negative')) {
      return <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-300">{String(val)}</span>;
    }
    if (s.includes('only in books') || s.includes('in bank')) {
      return <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 border border-sky-300">{String(val)}</span>;
    }
    return String(val);
  };

  const isNumericCol = (colName: string) => {
    const norm = colName.toLowerCase();
    return (
      norm.includes('taxable') ||
      norm.includes('tax') ||
      norm.includes('amount') ||
      norm.includes('count') ||
      norm.includes('diff') ||
      norm.includes('value') ||
      norm.includes('closing') ||
      norm.includes('opening') ||
      norm.includes('inward') ||
      norm.includes('outward') ||
      norm.includes('debit') ||
      norm.includes('credit')
    );
  };

  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-slate-500 text-sm">
        No records available.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden flex flex-col">
      {/* Table toolbar */}
      <div className="p-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
        <div className="flex items-center gap-2">
          {title && <span className="font-semibold text-slate-700 text-sm">{title}</span>}
          <span className="text-xs text-slate-500 font-medium bg-slate-200 px-2 py-0.5 rounded">
            {filteredData.length} row{filteredData.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {!hideSearch && (
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search table..."
                className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-hidden focus:ring-1 focus:ring-[#1f4e79] focus:border-[#1f4e79] w-48 transition-all"
              />
            </div>
          )}

          <button
            onClick={handleDownloadCsv}
            title="Download CSV"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-white text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors font-medium shadow-2xs"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
        </div>
      </div>

      {/* Table container */}
      <div className="overflow-x-auto" style={{ maxHeight }}>
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-100/80 text-slate-700 font-semibold sticky top-0 z-10 border-b border-slate-200 backdrop-blur-xs">
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  className={`px-3.5 py-2.5 whitespace-nowrap tracking-tight ${
                    isNumericCol(col) ? 'text-right' : 'text-left'
                  }`}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800">
            {paginatedData.map((row, rIdx) => {
              const actualRowIndex = (currentPage - 1) * pageSize + rIdx;
              return (
                <tr key={rIdx} className="hover:bg-blue-50/40 transition-colors">
                  {columns.map((col) => {
                    const val = row[col];
                    const isColEditable = editableColumn && col === editableColumn;

                    return (
                      <td
                        key={col}
                        className={`px-3.5 py-2 whitespace-nowrap text-xs ${
                          isNumericCol(col) ? 'text-right font-mono text-[11.5px]' : 'text-left'
                        }`}
                      >
                        {isColEditable ? (
                          <select
                            value={val || ''}
                            onChange={(e) => onCellEdit?.(actualRowIndex, col, e.target.value)}
                            className="bg-white border border-slate-300 rounded px-2 py-0.5 text-xs font-semibold focus:ring-1 focus:ring-blue-500"
                          >
                            {editableOptions.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        ) : col.toLowerCase() === 'status' ? (
                          getStatusBadge(val)
                        ) : typeof val === 'number' ? (
                          val.toLocaleString('en-IN', {
                            minimumFractionDigits: val % 1 !== 0 ? 2 : 0,
                            maximumFractionDigits: 2,
                          })
                        ) : val !== null && val !== undefined ? (
                          String(val)
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      {totalPages > 1 && (
        <div className="p-2.5 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600 bg-slate-50/50">
          <div className="flex items-center gap-1.5">
            <span>Show</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs focus:ring-1 focus:ring-blue-500"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>rows per page</span>
          </div>

          <div className="flex items-center gap-2">
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => p - 1)}
                className="p-1 rounded border border-slate-300 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
                className="p-1 rounded border border-slate-300 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
