import React, { useState, useMemo } from 'react';
import { Search, Download, ChevronLeft, ChevronRight, FileSpreadsheet, FileText } from 'lucide-react';
import { downloadCsv, exportToExcel } from '../services/excelEngine';
import { downloadPdf } from '../services/pdfEngine';
import { validateGstin } from '../services/validation';

/**
 * A GSTIN cell shows the value plus a dot: green when the state code, PAN and
 * check digit all pass, amber when something is off. The tooltip names the
 * exact failure so a typo can be fixed without leaving the table.
 */
const GstinCell: React.FC<{ value: any }> = ({ value }) => {
  const check = validateGstin(value);
  const text = String(value ?? '').trim();
  if (check.status === 'valid') {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono tracking-wide">
        {text}
        <span
          className="w-1.5 h-1.5 rounded-full bg-emerald-500"
          title={`${check.stateCode} - ${check.stateName}`}
        />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 font-mono tracking-wide text-rose-700">
      {text}
      <span
        className="w-1.5 h-1.5 rounded-full bg-rose-500"
        title={check.status === 'invalid' ? check.issue : 'missing'}
      />
    </span>
  );
};

interface Props {
  data: Array<Record<string, any>>;
  title?: string;
  maxHeight?: string;
  editableColumn?: string;
  editableOptions?: string[];
  onCellEdit?: (rowIndex: number, column: string, newValue: any) => void;
  hideSearch?: boolean;
  gstin?: string;
  period?: string;
}

export const DataTable: React.FC<Props> = ({
  data,
  title,
  maxHeight = '480px',
  editableColumn,
  editableOptions = [],
  onCellEdit,
  hideSearch = false,
  gstin = '',
  period = '',
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const columns = useMemo(() => {
    if (!data || data.length === 0) return [];
    // Union of keys from the first rows, so optional fields on later rows are
    // not silently hidden. Capped so a messy sheet cannot explode the table.
    const keys: string[] = Object.keys(data[0]);
    const seen = new Set(keys);
    for (const row of data.slice(0, 100)) {
      for (const k of Object.keys(row || {})) {
        if (!seen.has(k) && keys.length < 60) {
          seen.add(k);
          keys.push(k);
        }
      }
    }
    return keys;
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

  const baseName = (title || 'export').replace(/[\\/:*?"<>|]/g, '_');

  // Every export can fail (blocked blob URL, a stale chunk after a redeploy,
  // an unsupported value). Say so instead of leaving the click with no effect.
  const runExport = async (label: string, task: () => Promise<void> | void) => {
    setExporting(label);
    setExportError(null);
    try {
      await task();
    } catch (e: any) {
      setExportError(`Could not create the file: ${e?.message || String(e)}`);
    } finally {
      setExporting(null);
    }
  };

  const handleDownloadCsv = () => runExport('csv', () => downloadCsv(data, `${baseName}.csv`));

  const handleDownloadExcel = () =>
    runExport('excel', () =>
      exportToExcel({ [title || 'Report']: data }, `${baseName}.xlsx`, {
        gstin,
        period,
        title: title || 'Report',
      })
    );

  const handleDownloadPdf = () =>
    runExport('pdf', () => downloadPdf(data, `${baseName}.pdf`, { title: title || 'Report', gstin, period }));

  const getStatusBadge = (val: any) => {
    const s = String(val).toLowerCase();
    if (s === 'matched' || s === 'match' || s === 'tied' || s === 'all tally') {
      return <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">Matched</span>;
    }
    if (s.includes('possible match')) {
      return <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 border border-sky-300">{String(val)}</span>;
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

  const isGstinCol = (colName: string) => /gstin|ctin/i.test(colName);

  // Reason and Action are sentences, not codes: wrap them instead of letting
  // one long line push every other column off the screen.
  const isTextCol = (colName: string) => /^(reason|action|remark)$/i.test(colName.trim());

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
                className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-hidden focus:ring-1 focus:ring-[#0159D3] focus:border-[#0159D3] w-48 transition-all"
              />
            </div>
          )}

          <div className="flex items-center gap-1">
            <button
              onClick={handleDownloadCsv}
              disabled={exporting !== null}
              title="Download CSV"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-white text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors font-medium shadow-2xs"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>
            <button
              onClick={handleDownloadExcel}
              disabled={exporting !== null}
              title="Download Excel (.xlsx, password protected)"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-white text-emerald-800 border border-emerald-300 rounded-md hover:bg-emerald-50 transition-colors font-medium shadow-2xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Excel
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={exporting !== null}
              title="Download PDF"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-white text-rose-800 border border-rose-300 rounded-md hover:bg-rose-50 transition-colors font-medium shadow-2xs"
            >
              <FileText className="w-3.5 h-3.5" />
              PDF
            </button>
          </div>
        </div>
        {exportError && (
          <div className="w-full text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">
            {exportError}
          </div>
        )}
        {exporting && !exportError && (
          <div className="w-full text-[11px] text-slate-500">Preparing file...</div>
        )}
      </div>

      {/* Table container */}
      <div className="overflow-x-auto" style={{ maxHeight }}>
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-100/80 text-slate-700 font-semibold sticky top-0 z-10 border-b border-slate-200 backdrop-blur-xs">
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  className={`px-3.5 py-2.5 tracking-tight ${
                    isNumericCol(col) ? 'text-right' : 'text-left'
                  } ${isTextCol(col) ? 'min-w-[220px]' : 'whitespace-nowrap'}`}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800">
            {paginatedData.map((row, rIdx) => {
              // Index in the original array, not in the filtered/paged view,
              // so an edit never lands on the wrong row while a search is active.
              const originalRowIndex = data.indexOf(row);
              return (
                <tr key={rIdx} className="hover:bg-blue-50/40 transition-colors">
                  {columns.map((col) => {
                    const val = row[col];
                    const isColEditable = editableColumn && col === editableColumn;

                    return (
                      <td
                        key={col}
                        className={`px-3.5 py-2 text-xs ${
                          isNumericCol(col) ? 'text-right font-mono text-[11.5px]' : 'text-left'
                        } ${
                          isTextCol(col)
                            ? 'whitespace-normal align-top min-w-[220px] max-w-[340px] leading-snug text-slate-600'
                            : 'whitespace-nowrap'
                        }`}
                      >
                        {isColEditable ? (
                          <select
                            value={val || ''}
                            onChange={(e) => onCellEdit?.(originalRowIndex, col, e.target.value)}
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
                        ) : isGstinCol(col) && val !== null && val !== undefined && String(val).trim() !== '' ? (
                          <GstinCell value={val} />
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
