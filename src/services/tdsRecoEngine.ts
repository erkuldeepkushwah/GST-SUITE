import { TdsRecoResult } from '../types';
import { readExcelFile, getRawSheetRows } from './excelEngine';
import { asDate, formatDateIso, tryDate } from './periodManager';

const NON_TDS_KEYWORDS = ["partner remuneration", "profit and loss", "sundry balances written off"];
const COMMISSION_KEYWORDS = ["commission"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toNum(v: any): number {
  if (v === null || v === undefined || v === '') return 0;
  const cleaned = String(v).replace(/,/g, '').replace(/₹/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

export function classifyTallyRow(particulars: string, voucherType: string, credit: number): string {
  const p = particulars.toLowerCase();
  const vt = voucherType.toLowerCase();

  if (NON_TDS_KEYWORDS.some(k => p.includes(k))) return "NOT TDS - check";
  if (vt === "payment") return "Payment to govt";
  if (vt === "debit note") return "TDS - purchase (DN)";
  if (COMMISSION_KEYWORDS.some(k => p.includes(k))) return "TDS - commission (JV)";
  if (/^[a-z]{3}-\d{4}$/.test(p)) return "TDS - purchase summary (JV)";
  if (vt === "journal" && credit > 0) return "Check - journal credit";
  return "Check";
}

export async function runTdsReconciliation(
  tallyFile: File,
  caFile: File,
  quarterStart: string,
  quarterEnd: string
): Promise<TdsRecoResult> {
  const qStart = asDate(quarterStart);
  qStart.setHours(0, 0, 0, 0);
  const qEnd = asDate(quarterEnd);
  qEnd.setHours(23, 59, 59, 999);

  // 1. Parse Tally
  const wbTally = await readExcelFile(tallyFile);
  const tallyRows = getRawSheetRows(wbTally, wbTally.SheetNames[0]);

  let tallyHdrIdx = -1;
  for (let i = 0; i < Math.min(20, tallyRows.length); i++) {
    const row = tallyRows[i];
    if (Array.isArray(row) && String(row[0] || '').trim().toLowerCase().includes('date')) {
      tallyHdrIdx = i;
      break;
    }
  }

  const tallyEntries: any[] = [];
  if (tallyHdrIdx !== -1) {
    for (let r = tallyHdrIdx + 1; r < tallyRows.length; r++) {
      const line = tallyRows[r];
      if (!line || !Array.isArray(line) || !line[0]) continue;
      const d = tryDate(line[0]);
      if (!d) continue;

      const particulars = String(line[1] || '').trim();
      const vtype = String(line[2] || '').trim();
      const vno = String(line[3] || '').trim();
      const debit = toNum(line[4]);
      const credit = toNum(line[5]);
      const classification = classifyTallyRow(particulars, vtype, credit);

      tallyEntries.push({
        Date: formatDateIso(d),
        rawDate: d,
        Particulars: particulars,
        'Voucher Type': vtype,
        'Voucher No': vno,
        Debit: debit,
        Credit: credit,
        Classification: classification,
      });
    }
  }

  // 2. Parse CA file
  const wbCa = await readExcelFile(caFile);
  const caEntries: any[] = [];

  for (const sheetName of wbCa.SheetNames) {
    const table = getRawSheetRows(wbCa, sheetName);
    let caHdrIdx = -1;
    let colMap: Record<string, number> = {};

    for (let i = 0; i < Math.min(15, table.length); i++) {
      const line = table[i];
      if (Array.isArray(line)) {
        const heads = line.map(c => String(c || '').trim().toLowerCase());
        const monthIdx = heads.findIndex(h => h.includes('month'));
        const payIdx = heads.findIndex(h => h.includes('tds payable'));
        if (monthIdx !== -1 && payIdx !== -1) {
          caHdrIdx = i;
          colMap = {
            month: monthIdx,
            payable: payIdx,
            paid: heads.findIndex(h => h.includes('tds paid')),
          };
          break;
        }
      }
    }

    if (caHdrIdx !== -1) {
      for (let r = caHdrIdx + 1; r < table.length; r++) {
        const line = table[r];
        if (!line || !line[colMap.month]) continue;
        const d = tryDate(line[colMap.month]);
        if (!d) continue;

        caEntries.push({
          Month: d,
          'TDS Payable': toNum(line[colMap.payable]),
          'TDS Paid': colMap.paid !== -1 ? toNum(line[colMap.paid]) : 0,
        });
      }
      break;
    }
  }

  // Filter within period
  const tQuarter = tallyEntries.filter(t => t.rawDate >= qStart && t.rawDate <= qEnd);
  const tdsRows = tQuarter.filter(t => t.Classification !== "NOT TDS - check" && t.Classification !== "Payment to govt");
  const payRows = tQuarter.filter(t => t.Classification === "Payment to govt");

  // Build monthly intervals
  const monthlyReco: any[] = [];
  const curr = new Date(qStart.getFullYear(), qStart.getMonth(), 1);
  const endMonth = new Date(qEnd.getFullYear(), qEnd.getMonth(), 1);

  while (curr <= endMonth) {
    const moLabel = `${MONTH_NAMES[curr.getMonth()]}-${curr.getFullYear()}`;
    const currYear = curr.getFullYear();
    const currMonth = curr.getMonth();

    const caMatch = caEntries.filter(c => c.Month.getFullYear() === currYear && c.Month.getMonth() === currMonth);
    const caPayable = round(caMatch.reduce((s, c) => s + c['TDS Payable'], 0));
    const caPaid = round(caMatch.reduce((s, c) => s + c['TDS Paid'], 0));

    const tMatch = tdsRows.filter(t => t.rawDate.getFullYear() === currYear && t.rawDate.getMonth() === currMonth);
    const tCredited = round(tMatch.reduce((s, t) => s + t.Credit, 0));

    const pMatch = payRows.filter(t => t.rawDate.getFullYear() === currYear && t.rawDate.getMonth() === currMonth);
    const tPayments = round(pMatch.reduce((s, t) => s + t.Debit, 0));

    const monthDiff = round(tCredited - caPayable);
    monthlyReco.push({
      Month: moLabel,
      'CA TDS payable': caPayable,
      'Tally TDS credited': tCredited,
      Difference: monthDiff,
      'CA TDS paid': caPaid,
      'Tally payments (same month)': tPayments,
      Note:
        monthDiff === 0
          ? 'Tally TDS credited matches CA payable'
          : monthDiff > 0
          ? `Tally TDS credited is ${inr(monthDiff)} more than CA payable`
          : `Tally TDS credited is ${inr(Math.abs(monthDiff))} less than CA payable`,
    });

    curr.setMonth(curr.getMonth() + 1);
  }

  const periodDiff = round(monthlyReco.reduce((s, m) => s + m.Difference, 0));
  const periodTotal = {
    Month: 'Period total',
    'CA TDS payable': round(monthlyReco.reduce((s, m) => s + m['CA TDS payable'], 0)),
    'Tally TDS credited': round(monthlyReco.reduce((s, m) => s + m['Tally TDS credited'], 0)),
    Difference: periodDiff,
    'CA TDS paid': round(monthlyReco.reduce((s, m) => s + m['CA TDS paid'], 0)),
    'Tally payments (same month)': round(monthlyReco.reduce((s, m) => s + m['Tally payments (same month)'], 0)),
    Note:
      periodDiff === 0
        ? 'Tally TDS and CA working sheet agree for the period'
        : periodDiff > 0
        ? `Tally shows ${inr(periodDiff)} more TDS than the CA working sheet`
        : `Tally shows ${inr(Math.abs(periodDiff))} less TDS than the CA working sheet`,
  };
  monthlyReco.push(periodTotal);

  // Summary Table
  const totalTallyCredits = round(tQuarter.reduce((s, t) => s + t.Credit, 0));
  const nonTdsCredits = round(tQuarter.filter(t => t.Classification === 'NOT TDS - check').reduce((s, t) => s + t.Credit, 0));
  const tdsTypeCredits = round(tdsRows.reduce((s, t) => s + t.Credit, 0));

  const summary = [
    { Item: 'Total credits in Tally TDS ledger (period)', Amount: totalTallyCredits, Remark: '' },
    { Item: 'Less: credits flagged NOT TDS', Amount: -nonTdsCredits, Remark: 'Partner remuneration, P&L, write-off entries. Check.' },
    { Item: 'TDS-type credits in Tally', Amount: tdsTypeCredits, Remark: '' },
    { Item: 'Less: CA TDS payable', Amount: -periodTotal['CA TDS payable'], Remark: 'As per CA working sheet' },
    { Item: 'Net difference (Tally TDS - CA TDS)', Amount: periodTotal.Difference, Remark: periodTotal.Difference === 0 ? 'Tied' : 'Difference to verify' },
  ];

  return {
    summary,
    monthlyReco,
    tallyEntries: tQuarter.map(({ rawDate, ...rest }) => rest),
  };
}

/** Rupee amount for the Note column. */
function inr(num: number): string {
  return `\u20b9${round(num).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function round(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}
