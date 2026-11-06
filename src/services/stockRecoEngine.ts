import { StockSnapshotResult, StockMovementResult } from '../types';
import { readExcelFile, getRawSheetRows } from './excelEngine';

const TIE_TOL = 0.5;

function toNum(v: any): number {
  if (v === null || v === undefined || v === '') return 0;
  const cleaned = String(v).replace(/,/g, '').replace(/₹/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

export async function runStockSnapshot(file: File): Promise<StockSnapshotResult> {
  const wb = await readExcelFile(file);
  const rows = getRawSheetRows(wb, wb.SheetNames[0]);

  // Find rows where item number starts (e.g. "1)" or numeric)
  const items: any[] = [];
  let grandOpening = 0, grandClosing = 0, grandValue = 0;
  let hasGrand = false;
  const unitTotals: Record<string, number> = {};

  // Every cell comes back as text from the sheet reader, so numbers are spotted
  // by their content, not by typeof. The old typeof check never matched, which
  // is why the unit-wise tie-out always reported "tied".
  const isNumCell = (v: any): boolean => {
    if (v === null || v === undefined) return false;
    const s = String(v).trim();
    return s !== '' && /^-?[\d,]+(\.\d+)?$/.test(s);
  };
  const HEADER_WORDS = ['s.no', 's no', 'sr', 'sr no', 'sn', 'item id', 'item', 'item name', 'particulars', 'product', 'brand', 'description', 'unit', 'unt'];

  for (let i = 0; i < rows.length; i++) {
    const line = rows[i];
    if (!Array.isArray(line) || line.length === 0) continue;

    const col0 = String(line[0] || '').trim();
    const col1 = String(line[1] || '').trim();

    // Check grand total row
    if (col0.toLowerCase().includes('total') || col1.toLowerCase().includes('total') || col1.toLowerCase().includes('grand total')) {
      grandOpening = toNum(line[5]);
      grandClosing = toNum(line[6]);
      grandValue = toNum(line[7]);
      hasGrand = true;
      continue;
    }

    // Unit summary row (e.g. "PCS", "NOS", "KGS" with the unit's quantity next
    // to it and no item identity columns). Its value column is a subtotal of the
    // items above, so it must never be counted as an item a second time.
    const unitCode = col0.toUpperCase();
    if (
      /^[A-Z]{2,5}$/.test(unitCode) &&
      isNumCell(line[1]) &&
      !String(line[2] ?? '').trim() &&
      !String(line[3] ?? '').trim() &&
      !String(line[4] ?? '').trim()
    ) {
      unitTotals[unitCode] = round((unitTotals[unitCode] || 0) + toNum(line[1]));
      continue;
    }

    // Title, header, blank and footer rows carry no quantity or value at all
    if (!isNumCell(line[5]) && !isNumCell(line[6]) && !isNumCell(line[7])) continue;
    if (HEADER_WORDS.includes(col0.toLowerCase()) || HEADER_WORDS.includes(col1.toLowerCase())) continue;
    if (!col1) continue;

    // Normal item line
    if (/^\d+\)?$/.test(col0) || (col1 && !col0.toLowerCase().includes('particulars') && line.length >= 6)) {
      const id = String(line[1] || '').trim();
      const brand = String(line[2] || '').trim();
      const product = String(line[3] || '').trim() || id;
      const unt = String(line[4] || '').trim().toUpperCase();
      const opening = toNum(line[5]);
      const closing = toNum(line[6]);
      const stockValue = line[7] !== undefined && line[7] !== '' ? toNum(line[7]) : NaN;
      const mis = String(line[8] || '').trim();

      const rate = (!isNaN(stockValue) && closing > 0) ? round(stockValue / closing) : NaN;

      const flags: string[] = [];
      if (!isNaN(closing) && closing < 0) flags.push("NEGATIVE STOCK");
      if (!isNaN(closing) && closing > 0 && isNaN(stockValue)) flags.push("QTY BUT NO VALUE");
      if (!isNaN(rate) && rate < 1) flags.push("RATE < ₹1 (check cost)");
      if (!isNaN(rate) && rate > 50000) flags.push("HIGH RATE (check)");

      items.push({
        SN: col0,
        ID: id,
        Brand: brand,
        Product: product,
        UNT: unt,
        Opening: opening,
        Closing: closing,
        StockValue: isNaN(stockValue) ? null : stockValue,
        Rate: isNaN(rate) ? null : rate,
        MIS: mis,
        FlagsList: flags,
      });
    }
  }

  // Check duplicate product names
  const productCount: Record<string, number> = {};
  for (const it of items) {
    if (it.Product) {
      productCount[it.Product] = (productCount[it.Product] || 0) + 1;
    }
  }
  for (const it of items) {
    if (it.Product && productCount[it.Product] > 1) {
      it.FlagsList.push("DUPLICATE PRODUCT NAME");
    }
    it.Flags = it.FlagsList.join(", ");
  }

  const sumOpening = round(items.reduce((s, it) => s + (it.Opening || 0), 0));
  const sumClosing = round(items.reduce((s, it) => s + (it.Closing || 0), 0));
  const sumStockValue = round(items.reduce((s, it) => s + (it.StockValue || 0), 0));

  if (!hasGrand) {
    grandOpening = sumOpening;
    grandClosing = sumClosing;
    grandValue = sumStockValue;
  }

  const diffOpen = round(sumOpening - grandOpening);
  const diffQty = round(sumClosing - grandClosing);
  const diffVal = round(sumStockValue - grandValue);

  // Unit tie out
  const unitGroups: Record<string, number> = {};
  for (const it of items) {
    if (it.UNT) {
      unitGroups[it.UNT] = round((unitGroups[it.UNT] || 0) + (it.Closing || 0));
    }
  }

  const unitTieOut: any[] = [];
  let unitOk = true;
  const allUnits = Array.from(new Set([...Object.keys(unitGroups), ...Object.keys(unitTotals)])).sort();
  for (const u of allUnits) {
    const qty = unitGroups[u];
    const reportQty = unitTotals[u];

    // Comparing a unit against itself (the old `unitTotals[u] ?? qty` fallback)
    // reported "tied" even when the report had no subtotal for that unit at all.
    if (reportQty === undefined || qty === undefined) {
      unitOk = false;
      unitTieOut.push({
        UNT: u,
        'Per items': qty ?? '',
        'Per report': reportQty ?? '',
        Difference: '',
        Status: qty === undefined ? 'Unit in report, no item lines' : 'No unit subtotal in file',
        Reason:
          qty === undefined
            ? 'Unit appears in the report totals but no item line carries it'
            : 'Item lines use this unit but the report has no subtotal for it',
      });
      continue;
    }

    const diff = round(qty - reportQty);
    if (Math.abs(diff) > TIE_TOL) unitOk = false;

    unitTieOut.push({
      UNT: u,
      'Per items': qty,
      'Per report': reportQty,
      Difference: diff,
      Status: Math.abs(diff) <= TIE_TOL ? 'Tied' : 'NOT TIED - check',
      Reason:
        Math.abs(diff) <= TIE_TOL
          ? `Unit quantity ties with the report subtotal (difference ${diff})`
          : `Item lines and report subtotal differ by ${diff} for this unit`,
    });
  }

  const neg = items.filter(it => it.Closing < 0);
  const noval = items.filter(it => it.Closing > 0 && it.StockValue === null);
  const lowRate = items.filter(it => it.Rate !== null && it.Rate < 1);
  const dupProducts = items.filter(it => it.FlagsList.includes("DUPLICATE PRODUCT NAME"));

  const summary = [
    {
      Check: "Items sum vs grand total: Opening value",
      'Per items': sumOpening,
      'Per report total': grandOpening,
      Difference: diffOpen,
      Status: Math.abs(diffOpen) <= TIE_TOL ? "Tied" : "NOT TIED - check",
      Reason:
        Math.abs(diffOpen) <= TIE_TOL
          ? 'Item opening values add up to the report total'
          : `Item opening values miss the report total by ${diffOpen}`,
    },
    {
      Check: "Items sum vs grand total: Closing qty",
      'Per items': sumClosing,
      'Per report total': grandClosing,
      Difference: diffQty,
      Status: Math.abs(diffQty) <= TIE_TOL ? "Tied" : "NOT TIED - check",
      Reason:
        Math.abs(diffQty) <= TIE_TOL
          ? 'Item closing quantities add up to the report total'
          : `Item closing quantities miss the report total by ${diffQty}`,
    },
    {
      Check: "Items sum vs grand total: Stock value",
      'Per items': sumStockValue,
      'Per report total': grandValue,
      Difference: diffVal,
      Status: Math.abs(diffVal) <= TIE_TOL ? "Tied" : "NOT TIED - check",
      Reason:
        Math.abs(diffVal) <= TIE_TOL
          ? 'Item stock values add up to the report total'
          : `Item stock values miss the report total by ${diffVal}`,
    },
    {
      Check: `Unit-wise closing qty (${Object.keys(unitGroups).join(", ") || "none"})`,
      'Per items': '',
      'Per report total': '',
      Difference: unitTieOut.reduce((s, u) => s + Math.abs(u.Difference), 0),
      Status: unitOk ? "Tied for all units" : "NOT TIED - see Unit Tie-out",
      Reason: unitOk
        ? 'Every unit in the file agrees with its report subtotal'
        : `One or more units do not agree with the report subtotal (${allUnits.length} unit(s) checked)`,
    },
    {
      Check: "Negative stock items",
      'Per items': neg.length,
      'Per report total': '',
      Difference: round(neg.reduce((s, it) => s + (it.StockValue || 0), 0)),
      Status: "Exception: value column shows the negative amount",
      Reason: `${neg.length} item(s) have closing stock below zero - check issue entries`,
    },
    {
      Check: "Qty present but stock value blank",
      'Per items': noval.length,
      'Per report total': '',
      Difference: round(noval.reduce((s, it) => s + (it.Closing || 0), 0)),
      Status: "Exception: qty units (value not included in total)",
      Reason: `${noval.length} item(s) carry quantity but no stock value - rate missing in the item master`,
    },
    {
      Check: "Rate below ₹1 per unit",
      'Per items': lowRate.length,
      'Per report total': '',
      Difference: round(lowRate.reduce((s, it) => s + (it.StockValue || 0), 0)),
      Status: "Check cost entry",
      Reason: `${lowRate.length} item(s) have a rate below \u20b91 per unit - likely a cost-entry error`,
    },
    {
      Check: "Duplicate product name (same name, two IDs)",
      'Per items': dupProducts.length,
      'Per report total': '',
      Difference: '',
      Status: "Check item master",
      Reason: `${dupProducts.length} name(s) appear under two item IDs - merge or rename in the item master`,
    },
  ];

  const exceptions = items.filter(it => it.FlagsList.length > 0);
  const tied = Math.abs(diffOpen) <= TIE_TOL && Math.abs(diffQty) <= TIE_TOL && Math.abs(diffVal) <= TIE_TOL && unitOk;

  return {
    summary,
    unitTieOut,
    exceptions,
    allItems: items,
    tied,
  };
}

export async function runStockMovement(movementFile: File, closingSummaryFile?: File): Promise<StockMovementResult> {
  const wb = await readExcelFile(movementFile);
  const rows = getRawSheetRows(wb, wb.SheetNames[0]);

  // Aliases lookup
  const ALIASES: Record<string, string[]> = {
    Item: ["item", "item name", "stock item", "product", "particulars", "description", "name of item"],
    Unit: ["unit", "uom", "unit (uom)", "units", "base unit", "unit name"],
    Opening: ["opening", "opening balance", "opening stock", "opening qty", "opening quantity", "balance b/f", "op bal", "opening qty."],
    Inward: ["inward", "inwards", "inward qty", "inward quantity", "receipts", "received", "inward qty.", "purchase qty"],
    Outward: ["outward", "outwards", "outward qty", "outward quantity", "issues", "issued", "sales qty", "outward qty."],
    Closing: ["closing", "closing balance", "closing stock", "closing qty", "closing quantity", "balance c/f", "cl bal", "closing qty."],
    Value: ["value", "closing value", "stock value", "amount", "closing amount"],
  };

  let headerIdx = -1;
  const colMap: Record<string, number> = {};

  for (let i = 0; i < Math.min(25, rows.length); i++) {
    const line = rows[i];
    if (!Array.isArray(line)) continue;
    const found: Record<string, number> = {};

    line.forEach((cell, idx) => {
      const norm = String(cell || '').trim().toLowerCase();
      for (const [key, options] of Object.entries(ALIASES)) {
        if (options.some(opt => norm === opt || (norm.includes(opt) && opt.length > 3))) {
          found[key] = idx;
        }
      }
    });

    if (Object.keys(found).length >= 3 && found.Item !== undefined) {
      headerIdx = i;
      Object.assign(colMap, found);
      break;
    }
  }

  const items: any[] = [];
  if (headerIdx !== -1) {
    for (let r = headerIdx + 1; r < rows.length; r++) {
      const line = rows[r];
      if (!line || !Array.isArray(line)) continue;
      const itemName = String(line[colMap.Item] || '').trim();
      if (!itemName || ['total', 'grand total'].includes(itemName.toLowerCase())) continue;

      const unit = colMap.Unit !== undefined ? String(line[colMap.Unit] || '').trim() : '';
      const opening = colMap.Opening !== undefined ? toNum(line[colMap.Opening]) : 0;
      const inward = colMap.Inward !== undefined ? toNum(line[colMap.Inward]) : 0;
      const outward = colMap.Outward !== undefined ? toNum(line[colMap.Outward]) : 0;
      const closing = colMap.Closing !== undefined ? toNum(line[colMap.Closing]) : 0;
      const value = colMap.Value !== undefined ? toNum(line[colMap.Value]) : null;

      const calcClosing = round(opening + inward - outward);
      const diff = round(closing - calcClosing);

      const flags: string[] = [];
      if (Math.abs(diff) > TIE_TOL) {
        flags.push("MOVEMENT DOES NOT TALLY");
      }
      if (closing < 0) {
        flags.push("NEGATIVE CLOSING");
      }

      items.push({
        Item: itemName,
        Unit: unit,
        Opening: opening,
        Inward: inward,
        Outward: outward,
        Closing: closing,
        'Calculated Closing': calcClosing,
        Difference: diff,
        Value: value,
        Flags: flags.join(", "),
      });
    }
  }

  // Cross check with closing summary if provided
  let crossCheckDiff = 0;
  if (closingSummaryFile) {
    try {
      const wbClose = await readExcelFile(closingSummaryFile);
      const closeRows = getRawSheetRows(wbClose, wbClose.SheetNames[0]);
      // find closing items
      const summaryCloseMap = new Map<string, number>();
      for (const row of closeRows) {
        if (Array.isArray(row) && row.length >= 2) {
          const name = String(row[0] || '').trim().toLowerCase();
          const val = toNum(row[row.length - 1]);
          if (name && val) summaryCloseMap.set(name, val);
        }
      }
      for (const it of items) {
        const match = summaryCloseMap.get(it.Item.toLowerCase());
        if (match !== undefined && Math.abs(match - it.Closing) > TIE_TOL) {
          it.Flags += (it.Flags ? ", " : "") + "DIFFERS FROM CLOSING SUMMARY";
          crossCheckDiff++;
        }
      }
    } catch (e) {
      console.warn("Failed to crosscheck closing summary", e);
    }
  }

  const movementErrors = items.filter(it => it.Flags.includes("MOVEMENT DOES NOT TALLY")).length;
  const negClosing = items.filter(it => it.Closing < 0).length;

  const summary = [
    { Check: "Total items in movement register", 'Per items': items.length, Status: "Complete" },
    { Check: "Items where Opening + Inward - Outward == Closing", 'Per items': items.length - movementErrors, Status: movementErrors === 0 ? "All Tally" : `${movementErrors} Mismatches` },
    { Check: "Items with negative closing stock", 'Per items': negClosing, Status: negClosing === 0 ? "None" : "Action Required" },
    { Check: "Discrepancy with closing stock summary", 'Per items': crossCheckDiff, Status: crossCheckDiff === 0 ? "Tied" : "Check items" },
  ];

  const exceptions = items.filter(it => it.Flags !== "");

  return {
    summary,
    exceptions,
    allItems: items,
  };
}

function round(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}
