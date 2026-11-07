import { BankRecoResult } from '../types';
import { readExcelFile, getRawSheetRows } from './excelEngine';
import { asDate, formatDateIso, tryDate } from './periodManager';

const AMT_TOL = 0.5;
const DATE_WINDOW_DAYS = 5;

function toNum(v: any): number {
  if (v === null || v === undefined || v === '') return 0;
  const cleaned = String(v).replace(/,/g, '').replace(/₹/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function normRef(str: any): string {
  return String(str || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function refKey(utr: any): string {
  const k = normRef(utr);
  if (k.length < 6) return '';
  return k.length >= 8 ? k.slice(-8) : k;
}

export async function runBankReconciliation(
  stmtFile: File,
  ledgerFile: File,
  periodStart: string,
  periodEnd: string
): Promise<BankRecoResult> {
  const pStart = asDate(periodStart);
  pStart.setHours(0, 0, 0, 0);
  const pEnd = asDate(periodEnd);
  pEnd.setHours(23, 59, 59, 999);

  // 1. Parse Statement
  const wbStmt = await readExcelFile(stmtFile);
  const stmtRows = getRawSheetRows(wbStmt, wbStmt.SheetNames[0]);

  let stmtHeaderIdx = -1;
  let colDate = 0, colNarr = 1, colRef = 2, colValDate = 3, colDr = 4, colCr = 5, colBal = 6;

  for (let i = 0; i < Math.min(30, stmtRows.length); i++) {
    const row = stmtRows[i];
    if (Array.isArray(row)) {
      const rowNorm = row.map(c => String(c || '').trim().toLowerCase());
      const dIdx = rowNorm.findIndex(c => c === 'date' || c.includes('txn date') || c.includes('transaction date') || c.includes('value date'));
      const drIdx = rowNorm.findIndex(c => c.includes('withdrawal') || c.includes('debit') || c === 'dr');
      const crIdx = rowNorm.findIndex(c => c.includes('deposit') || c.includes('credit') || c === 'cr');

      if (dIdx !== -1 && (drIdx !== -1 || crIdx !== -1)) {
        stmtHeaderIdx = i;
        colDate = dIdx;
        if (drIdx !== -1) colDr = drIdx;
        if (crIdx !== -1) colCr = crIdx;
        const narrIdx = rowNorm.findIndex(c => c.includes('narration') || c.includes('description') || c.includes('particulars'));
        if (narrIdx !== -1) colNarr = narrIdx;
        const refIdx = rowNorm.findIndex(c => c.includes('ref') || c.includes('chq') || c.includes('cheque') || c.includes('utr'));
        if (refIdx !== -1) colRef = refIdx;
        const balIdx = rowNorm.findIndex(c => c.includes('closing') || c.includes('balance'));
        if (balIdx !== -1) colBal = balIdx;
        break;
      }
    }
  }

  // Fallback if header not specifically matched
  if (stmtHeaderIdx === -1) {
    for (let i = 0; i < Math.min(15, stmtRows.length); i++) {
      if (Array.isArray(stmtRows[i]) && String(stmtRows[i][0]).toLowerCase().includes('date')) {
        stmtHeaderIdx = i;
        break;
      }
    }
  }

  const stmtParsed: any[] = [];
  let stmtOpening = 0;
  if (stmtHeaderIdx !== -1) {
    for (let r = stmtHeaderIdx + 1; r < stmtRows.length; r++) {
      const line = stmtRows[r];
      if (!line || !Array.isArray(line) || line[colDate] === undefined) continue;
      const d = tryDate(line[colDate]);
      if (!d) continue;

      const dateStr = formatDateIso(d);
      const narration = String(line[colNarr] || '').trim();
      const ref = String(line[colRef] || '').trim();
      const withdrawal = toNum(line[colDr]);
      const deposit = toNum(line[colCr]);
      const closing = toNum(line[colBal]);
      const amount = deposit - withdrawal;

      stmtParsed.push({
        date: d,
        dateStr,
        narration,
        ref,
        withdrawal,
        deposit,
        closing,
        amount,
        used: false,
      });
    }
  }

  if (stmtParsed.length === 0) {
    const sNames = wbStmt.SheetNames.map(s => s.toLowerCase());
    if (sNames.some(s => s.includes('b2b') || s.includes('cdnr') || s.includes('gstr'))) {
      throw new Error("File Mismatch: You uploaded a GST return file into the Bank Statement slot. Please upload the official Bank Statement (.xlsx, .xls or .csv). (फ़ाइल त्रुटि: बैंक स्टेटमेंट की जगह GST फ़ाइल अपलोड हो गई है)।");
    }
    throw new Error(`No valid transactions found in Bank Statement "${stmtFile.name}". Please ensure the file has Date, Debit/Withdrawal, and Credit/Deposit columns.`);
  }

  // Banks hand out statements newest-first as often as oldest-first, so the
  // opening balance has to come from the earliest dated line, not from row 1.
  const stmtByDate = [...stmtParsed].sort((a, b) => a.date.getTime() - b.date.getTime());
  const hasBalanceColumn = stmtByDate.some(s => s.closing !== 0);
  stmtOpening = hasBalanceColumn ? stmtByDate[0].closing - stmtByDate[0].amount : 0;

  // 2. Parse Ledger
  const wbLedger = await readExcelFile(ledgerFile);
  const ledgerRows = getRawSheetRows(wbLedger, wbLedger.SheetNames[0]);

  let ledgerHeaderIdx = -1;
  let ledgerOpening = 0;
  for (let i = 0; i < Math.min(25, ledgerRows.length); i++) {
    const row = ledgerRows[i];
    if (Array.isArray(row)) {
      const rowNorm = row.map(c => String(c || '').trim().toLowerCase());
      if (rowNorm.some(c => c === 'particulars' || c.includes('particulars'))) {
        ledgerHeaderIdx = i;
      }
      if (rowNorm.some(c => c.includes('opening balance'))) {
        // Take the right-most pure number in the row: the first numeric cell is
        // often the date (20-04-2026 parses as 20), which made the opening
        // balance of the ledger wrong by exactly that date.
        const amountCells = row.filter(c => /^-?[\d,]+(\.\d+)?$/.test(String(c ?? '').trim()));
        if (amountCells.length > 0) ledgerOpening = toNum(amountCells[amountCells.length - 1]);
      }
    }
  }

  const ledgerParsed: any[] = [];
  if (ledgerHeaderIdx !== -1) {
    for (let r = ledgerHeaderIdx + 1; r < ledgerRows.length; r++) {
      const line = ledgerRows[r];
      if (!line || !Array.isArray(line) || !line[0]) continue;
      const d = tryDate(line[0]);
      if (!d) continue;

      const dateStr = formatDateIso(d);
      const particulars = String(line[1] || '').trim();
      const vtype = String(line[2] || '').trim();
      const utr = String(line[3] || '').trim().replace(/\.0$/, '');
      const vno = String(line[4] || '').trim();
      const debit = toNum(line[5]);
      const credit = toNum(line[6]);
      const amount = debit - credit;

      ledgerParsed.push({
        date: d,
        dateStr,
        particulars,
        vtype,
        utr,
        vno,
        debit,
        credit,
        amount,
      });
    }
  }

  if (ledgerParsed.length === 0) {
    const sNames = wbLedger.SheetNames.map(s => s.toLowerCase());
    if (sNames.some(s => s.includes('b2b') || s.includes('cdnr') || s.includes('gstr'))) {
      throw new Error("File Mismatch: You uploaded a GST file into the Tally Bank Ledger slot. Please upload the Tally Bank Ledger. (फ़ाइल त्रुटि: टैली बैंक लेज़र की जगह GST फ़ाइल अपलोड हो गई है)।");
    }
    throw new Error(`No valid entries found in Tally Bank Ledger "${ledgerFile.name}". Please ensure it contains Date, Particulars, and Debit/Credit columns.`);
  }

  // Filter within selected period
  const stmtInPeriod = stmtParsed.filter(s => s.date >= pStart && s.date <= pEnd);
  const ledgerInPeriod = ledgerParsed.filter(l => l.date >= pStart && l.date <= pEnd);

  // Roll both openings forward to the From date, so a mid-year period still reconciles
  const bankOpeningBefore = round(stmtOpening + stmtParsed.filter(s => s.date < pStart).reduce((a, s) => a + s.amount, 0));
  const ledgerOpeningBefore = round(ledgerOpening + ledgerParsed.filter(l => l.date < pStart).reduce((a, l) => a + l.amount, 0));
  const openingDiff = round(bankOpeningBefore - ledgerOpeningBefore);

  // 3. Match
  const allEntries: any[] = [];
  for (const l of ledgerInPeriod) {
    const cands = stmtInPeriod.filter(s => !s.used && Math.abs(s.amount - l.amount) <= AMT_TOL);

    let matched: any = null;
    if (cands.length > 0) {
      const key = refKey(l.utr);
      const refMatches = key ? cands.filter(s => normRef(s.ref).includes(key) || normRef(s.narration).includes(key)) : [];
      const pool = refMatches.length > 0 ? refMatches : cands;

      pool.sort((a, b) => Math.abs(a.date.getTime() - l.date.getTime()) - Math.abs(b.date.getTime() - l.date.getTime()));
      const best = pool[0];
      const dayDiff = Math.abs((best.date.getTime() - l.date.getTime()) / (1000 * 60 * 60 * 24));

      if (dayDiff <= DATE_WINDOW_DAYS || refMatches.length > 0) {
        best.used = true;
        matched = best;
      }
    }

    if (matched) {
      const refKey2 = refKey(l.utr);
      const refHit = refKey2 && (normRef(matched.ref).includes(refKey2) || normRef(matched.narration).includes(refKey2));
      const dayGap = Math.abs((matched.date.getTime() - l.date.getTime()) / (1000 * 60 * 60 * 24));
      allEntries.push({
        Source: 'Tally',
        'Date (Book)': l.dateStr,
        'Date (Bank)': matched.dateStr,
        Particulars: l.particulars,
        Voucher: l.vno,
        'UTR/Ref': l.utr,
        'Amount (Book)': l.amount,
        'Amount (Bank)': matched.amount,
        'Narration (Bank)': matched.narration,
        Status: 'Matched',
        Note: refHit
          ? 'Same UTR/reference, amount matches'
          : `Same amount, ${dayGap === 0 ? 'same date' : `date within ${Math.round(dayGap)} day(s)`}`,
        Action: '',
      });
    } else {
      allEntries.push({
        Source: 'Tally',
        'Date (Book)': l.dateStr,
        'Date (Bank)': '',
        Particulars: l.particulars,
        Voucher: l.vno,
        'UTR/Ref': l.utr,
        'Amount (Book)': l.amount,
        'Amount (Bank)': 0,
        'Narration (Bank)': '',
        Status: 'In Books, not in Bank',
        Note: 'No bank entry with this amount in the selected period (uncleared cheque or timing)',
        Action: 'Entry in Books but missing from Bank statement. Verify cheque clearing status or date window.',
      });
    }
  }

  for (const s of stmtInPeriod) {
    if (!s.used) {
      allEntries.push({
        Source: 'Bank',
        'Date (Book)': '',
        'Date (Bank)': s.dateStr,
        Particulars: '',
        Voucher: '',
        'UTR/Ref': s.ref,
        'Amount (Book)': 0,
        'Amount (Bank)': s.amount,
        'Narration (Bank)': s.narration,
        Status: 'In Bank, not in Books',
        Note: 'No matching Tally entry for this bank amount (unrecorded charge, interest or direct deposit)',
        Action: 'Transaction appears in Bank statement but not recorded in Books. Record journal entry or verify narration.',
      });
    }
  }

  const exceptions = allEntries.filter(r => r.Status !== 'Matched');

  // Closing reconciliation math
  const inBooksNotBankAmt = round(allEntries.filter(r => r.Status === 'In Books, not in Bank').reduce((s, r) => s + (r['Amount (Book)'] || 0), 0));
  const inBankNotBooksAmt = round(allEntries.filter(r => r.Status === 'In Bank, not in Books').reduce((s, r) => s + (r['Amount (Bank)'] || 0), 0));

  // Same ordering trap on the closing side: use the latest dated line in the
  // period, and fall back to opening + movement when the file has no balance column.
  const stmtInPeriodByDate = [...stmtInPeriod].sort((a, b) => a.date.getTime() - b.date.getTime());
  const totalBankClose = hasBalanceColumn
    ? (stmtInPeriodByDate.length > 0 ? stmtInPeriodByDate[stmtInPeriodByDate.length - 1].closing : bankOpeningBefore)
    : round(bankOpeningBefore + stmtInPeriod.reduce((s, r) => s + r.amount, 0));
  const totalLedgerNet = round(ledgerInPeriod.reduce((s, r) => s + r.amount, 0));
  const ledgerClose = round(ledgerOpeningBefore + totalLedgerNet);

  const calculatedBankClose = round(ledgerClose + inBankNotBooksAmt - inBooksNotBankAmt + openingDiff);
  const unexplainedDiff = round(totalBankClose - calculatedBankClose);

  const closingReconciliation = [
    { Item: 'Closing Balance as per Books (Tally)', Amount: ledgerClose, Remark: 'Ledger balance at period end' },
    { Item: 'Add: In Bank, not in Books', Amount: inBankNotBooksAmt, Remark: 'Direct deposits / bank charges to be recorded' },
    { Item: 'Add: Opening difference (bank minus Tally)', Amount: openingDiff, Remark: 'Difference carried from an earlier period' },
    { Item: 'Less: In Books, not in Bank', Amount: -inBooksNotBankAmt, Remark: 'Uncleared cheques / timing differences' },
    { Item: 'Reconciled Bank Balance', Amount: calculatedBankClose, Remark: 'Adjusted balance' },
    { Item: 'Closing Balance as per Bank Statement', Amount: totalBankClose, Remark: 'Statement balance at period end' },
    { Item: 'Unexplained Difference', Amount: unexplainedDiff, Remark: unexplainedDiff === 0 ? 'Fully reconciled' : 'Difference to investigate' },
  ];

  const summary = [
    { Check: 'Total Ledger Entries', Value: ledgerInPeriod.length },
    { Check: 'Total Statement Transactions', Value: stmtInPeriod.length },
    { Check: 'Matched Entries', Value: allEntries.filter(r => r.Status === 'Matched').length },
    { Check: 'Uncleared Books Entries', Value: allEntries.filter(r => r.Status === 'In Books, not in Bank').length },
    { Check: 'Unrecorded Bank Transactions', Value: allEntries.filter(r => r.Status === 'In Bank, not in Books').length },
    { Check: 'Closing Difference', Value: unexplainedDiff },
  ];

  return {
    summary,
    closingReconciliation,
    exceptions,
    allEntries,
  };
}

function round(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}
