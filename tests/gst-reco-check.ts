/**
 * Checks for the GST-Reconciliation module ported from the GST-Reconciliation
 * app: column auto-mapping, standardisation and invoice comparison.
 */
import {
  RECO_PAIRS,
  FILE_TYPES,
  findPair,
  fileTypeOption,
  filterRowsForPeriod,
  periodToMmyyyy,
  detectReturnPeriodColumn,
  autoMapColumns,
  standardize,
  compareFrames,
  summarize,
  threeBRows,
  NOT_MAPPED,
  parseDateValue,
  toNumber,
} from '../src/services/gstReco';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`);
}

// ---------- 1. auto-mapping on messy Tally / portal headings ----------
const tallyHeaders = ['Supplier GSTIN', 'Voucher No', 'Voucher Date', 'Taxable Amt', 'IGST Amt', 'Party Name'];
const m1 = autoMapColumns(tallyHeaders);
check('tally: GSTIN', m1['GSTIN'] === 'Supplier GSTIN', m1['GSTIN']);
check('tally: invoice no from "Voucher No"', m1['Invoice No'] === 'Voucher No', m1['Invoice No']);
check('tally: date from "Voucher Date"', m1['Invoice Date'] === 'Voucher Date', m1['Invoice Date']);
check('tally: taxable from "Taxable Amt"', m1['Taxable Value'] === 'Taxable Amt', m1['Taxable Value']);
check('tally: IGST from "IGST Amt"', m1['IGST'] === 'IGST Amt', m1['IGST']);
check('tally: party', m1['Party Name'] === 'Party Name', m1['Party Name']);
check('tally: CGST unmapped', m1['CGST'] === NOT_MAPPED, m1['CGST']);
check('tally: Total Tax not stolen from the IGST column', m1['Total Tax'] === NOT_MAPPED, m1['Total Tax']);

const portalHeaders = ['GSTIN of Supplier', 'Invoice Number', 'Invoice Date', 'Taxable Value', 'Integrated Tax Amount'];
const m2 = autoMapColumns(portalHeaders);
check('portal: GSTIN of Supplier', m2['GSTIN'] === 'GSTIN of Supplier', m2['GSTIN']);
check('portal: Integrated Tax Amount -> IGST', m2['IGST'] === 'Integrated Tax Amount', m2['IGST']);
check('portal: Total Tax left to be derived', m2['Total Tax'] === NOT_MAPPED, m2['Total Tax']);

// ---------- 2. value + date normalisation ----------
check('toNumber: commas and currency', toNumber('₹1,23,456.50') === 123456.5, String(toNumber('₹1,23,456.50')));
check('toNumber: bracketed negative', toNumber('(1,000)') === -1000, String(toNumber('(1,000)')));
check('toNumber: blank', toNumber(' - ') === 0);
check('date: dd-mm-yyyy', parseDateValue('05-04-2026') === '2026-04-05', parseDateValue('05-04-2026'));
check('date: 05-Apr-2026', parseDateValue('05-Apr-2026') === '2026-04-05', parseDateValue('05-Apr-2026'));
check('date: excel serial', parseDateValue(46117) === '2026-04-05', parseDateValue(46117));

// ---------- 3. standardisation derives total tax and invoice key ----------
const booksRows = [
  { 'Supplier GSTIN': '27aabct1332l1ze', 'Voucher No': 'inv 001', 'Voucher Date': '05-04-2026', 'Taxable Amt': 100000, 'IGST Amt': 18000 },
];
const std = standardize(booksRows, m1, { gstin: '23AAOFT2395R1ZA', period: 'Apr-2026' });
check('standardise: GSTIN upper', std[0]['GSTIN'] === '27AABCT1332L1ZE', std[0]['GSTIN']);
check('standardise: invoice key compacted', std[0]['Invoice Key'] === 'INV001', std[0]['Invoice Key']);
check('standardise: total tax from parts', std[0]['Total Tax'] === 18000, String(std[0]['Total Tax']));

// ---------- 4. comparison: matched, mismatch, one-sided ----------
const portalRows = [
  { 'GSTIN of Supplier': '27AABCT1332L1ZE', 'Invoice Number': 'INV-001', 'Invoice Date': '05-04-2026', 'Taxable Value': 100000, 'Integrated Tax Amount': 18000 },
  { 'GSTIN of Supplier': '24AAACB2233M1ZZ', 'Invoice Number': 'INV-002', 'Invoice Date': '12-04-2026', 'Taxable Value': 50000, 'Integrated Tax Amount': 9000 },
  { 'GSTIN of Supplier': '23AACCF4455P1ZD', 'Invoice Number': 'INV-003', 'Invoice Date': '20-04-2026', 'Taxable Value': 25000, 'Integrated Tax Amount': 4500 },
];
const bookRows2 = [
  { 'Supplier GSTIN': '27AABCT1332L1ZE', 'Voucher No': 'INV-001', 'Voucher Date': '05-04-2026', 'Taxable Amt': 100000, 'IGST Amt': 18000 },
  { 'Supplier GSTIN': '24AAACB2233M1ZZ', 'Voucher No': 'INV-002', 'Voucher Date': '12-04-2026', 'Taxable Amt': 48000, 'IGST Amt': 8640 },
  { 'Supplier GSTIN': '23AABCS8899Q1ZB', 'Voucher No': 'INV-004', 'Voucher Date': '25-04-2026', 'Taxable Amt': 30000, 'IGST Amt': 5400 },
];
const p = standardize(portalRows, m2, {});
const b = standardize(bookRows2, m1, {});
const reco = compareFrames(p, b, 1);

const byKey = Object.fromEntries(reco.map((r) => [r['Invoice Key'], r]));
check('reco: row count', reco.length === 4, String(reco.length));
check('reco: INV001 matched', byKey['INV-001']?.Status === 'Matched', String(byKey['INV-001']?.Status));
check('reco: INV002 is a mismatch', byKey['INV-002']?.Status === 'Not Mismatch', String(byKey['INV-002']?.Status));
check('reco: no reason column is emitted', byKey['INV-002']?.['Mismatch Reason'] === undefined);
check('reco: no per-field columns are emitted', !Object.keys(byKey['INV-002'] || {}).some((k) => k.endsWith(' match')), Object.keys(byKey['INV-002'] || {}).join(', '));
check('reco: INV003 only in portal', byKey['INV-003']?.Status === 'Only in Portal', String(byKey['INV-003']?.Status));
check('reco: INV004 only in books', byKey['INV-004']?.Status === 'Only in Books', String(byKey['INV-004']?.Status));
check('reco: matched rows sort last', reco[reco.length - 1]['Status'] === 'Matched', reco[reco.length - 1]['Status']);

// tolerance of 2500 must absorb the 2000 taxable / 360 tax difference
const loose = compareFrames(p, b, 2500);
check('reco: tolerance absorbs small diff', loose.find((r) => r['Invoice Key'] === 'INV-002')?.Status === 'Matched');

const s = summarize(reco);
check('summary: matched 1', s.matched === 1, String(s.matched));
check('summary: mismatch 1', s.mismatch === 1, String(s.mismatch));
check('summary: only portal 1', s.onlyPortal === 1, String(s.onlyPortal));
check('summary: only books 1', s.onlyBooks === 1, String(s.onlyBooks));
check('summary: portal taxable total', s.portalTaxable === 175000, String(s.portalTaxable));

// ---------- 5. GSTR-3B summary ----------
const threeB = threeBRows({ igst: { portal: 90000, books: 86400 } });
check('3B: seven particulars', threeB.length === 7, String(threeB.length));
check('3B: difference is books minus portal', threeB[1].Difference === -3600, String(threeB[1].Difference));

// ---------- 6. dropdowns: file types and reconciliation pairs ----------
check('pairs: three options', RECO_PAIRS.length === 3, String(RECO_PAIRS.length));
check('pairs: 2A -> books purchase', findPair('2A-purchase').portal === 'GSTR-2A' && findPair('2A-purchase').books === 'BOOKS-PURCHASE');
check('pairs: 2B -> books purchase', findPair('2B-purchase').portal === 'GSTR-2B' && findPair('2B-purchase').books === 'BOOKS-PURCHASE');
check('pairs: 1 -> books sales', findPair('1-sales').portal === 'GSTR-1' && findPair('1-sales').books === 'BOOKS-SALES');
check('pairs: unknown id falls back to 2B', findPair('nonsense').id === '2B-purchase');
check('file types: six options', FILE_TYPES.length === 6, String(FILE_TYPES.length));
check('file types: labels match the source app', fileTypeOption('BOOKS-SALES').label === 'Books - Sales Register', fileTypeOption('BOOKS-SALES').label);
check('file types: GSTR-3B is a summary type', fileTypeOption('GSTR-3B').summary === true);

// ---------- 7. period filtering ----------
check('period: 042026', periodToMmyyyy('042026') === '042026', periodToMmyyyy('042026'));
check('period: Apr-2026', periodToMmyyyy('Apr-2026') === '042026', periodToMmyyyy('Apr-2026'));
check('period: 2026-04', periodToMmyyyy('2026-04') === '042026', periodToMmyyyy('2026-04'));
check('period: blank', periodToMmyyyy('') === '');

const periodRows = [
  { ...standardize([{ 'GSTIN of Supplier': '27AABCT1332L1ZE', 'Invoice Number': 'A1', 'Invoice Date': '05-04-2026', 'Taxable Value': 100 }], m2, {})[0], 'Return Period': '042026' },
  { ...standardize([{ 'GSTIN of Supplier': '27AABCT1332L1ZE', 'Invoice Number': 'A2', 'Invoice Date': '05-05-2026', 'Taxable Value': 100 }], m2, {})[0], 'Return Period': '052026' },
];
const inApril = filterRowsForPeriod(periodRows, 'GSTR-2B', '2026-04-01', '2026-04-30');
check('filter: portal keeps only the April return period', inApril.length === 1 && inApril[0]['Invoice Key'] === 'A1', String(inApril.length));

const bookRows3 = standardize([
  { 'Supplier GSTIN': '27AABCT1332L1ZE', 'Voucher No': 'B1', 'Voucher Date': '05-04-2026', 'Taxable Amt': 100 },
  { 'Supplier GSTIN': '27AABCT1332L1ZE', 'Voucher No': 'B2', 'Voucher Date': '05-05-2026', 'Taxable Amt': 100 },
], m1, {});
const booksApril = filterRowsForPeriod(bookRows3, 'BOOKS-PURCHASE', '2026-04-01', '2026-04-30');
check('filter: books keep only April invoice dates', booksApril.length === 1 && booksApril[0]['Invoice Key'] === 'B1', String(booksApril.length));

const noPeriodColumn = periodRows.map((r) => ({ ...r, 'Return Period': '' }));
const fallback = filterRowsForPeriod(noPeriodColumn, 'GSTR-2B', '2026-04-01', '2026-04-30');
check('filter: portal without a return period falls back to invoice date', fallback.length === 1 && fallback[0]['Invoice Key'] === 'A1', String(fallback.length));

check('detect: return period column', detectReturnPeriodColumn(['GSTIN', 'Return Period', 'Taxable Value']) === 'Return Period');
check('detect: none present', detectReturnPeriodColumn(['GSTIN', 'Taxable Value']) === '');


// ---------- 8. match key: GSTIN + bill no, date only when asked ----------
const datePortal = standardize([
  { 'GSTIN of Supplier': '27AABCT1332L1ZE', 'Invoice Number': 'INV-9', 'Invoice Date': '05-04-2026', 'Taxable Value': 1000, 'Integrated Tax Amount': 180 },
], m2, {});
const dateBooks = standardize([
  { 'Supplier GSTIN': '27AABCT1332L1ZE', 'Voucher No': 'INV-9', 'Voucher Date': '07-04-2026', 'Taxable Amt': 1000, 'IGST Amt': 180 },
], m1, {});

const looseDate = compareFrames(datePortal, dateBooks, 1);
check('key: same GSTIN + bill no matches even with a different date', looseDate.length === 1 && looseDate[0].Status === 'Matched', String(looseDate[0]?.Status));
check('key: both dates are still shown', looseDate[0]['Date (portal)'] !== looseDate[0]['Date (books)'], `${looseDate[0]['Date (portal)']} / ${looseDate[0]['Date (books)']}`);
check('key: both dates are shown', looseDate[0]['Date (portal)'] === '2026-04-05' && looseDate[0]['Date (books)'] === '2026-04-07', `${looseDate[0]['Date (portal)']} / ${looseDate[0]['Date (books)']}`);


const strictDate = compareFrames(datePortal, dateBooks, 1, { matchOnDate: true });
check('key: with date matching the same invoice becomes a mismatch', strictDate.length === 1 && strictDate[0].Status === 'Not Mismatch', String(strictDate[0]?.Status));
check('key: date-only difference is a Not Mismatch', strictDate[0].Status === 'Not Mismatch', String(strictDate[0]?.Status));

const sameDateBooks = standardize([
  { 'Supplier GSTIN': '27AABCT1332L1ZE', 'Voucher No': 'INV-9', 'Voucher Date': '05-04-2026', 'Taxable Amt': 1000, 'IGST Amt': 180 },
], m1, {});
const strictSame = compareFrames(datePortal, sameDateBooks, 1, { matchOnDate: true });
check('key: with date matching, equal dates still match', strictSame.length === 1 && strictSame[0].Status === 'Matched', String(strictSame[0]?.Status));
check('key: same-date row is Matched', strictSame[0].Status === 'Matched', String(strictSame[0]?.Status));


// ---------- 9. possible pairs and mismatch reasons ----------
const mkPortal = (gstin: string, inv: string, taxable: number, igst: number, date = '05-04-2026') =>
  standardize([{ 'GSTIN of Supplier': gstin, 'Invoice Number': inv, 'Invoice Date': date, 'Taxable Value': taxable, 'Integrated Tax Amount': igst }], m2, {});
const mkBooks = (gstin: string, inv: string, taxable: number, igst: number, date = '05-04-2026') =>
  standardize([{ 'Supplier GSTIN': gstin, 'Voucher No': inv, 'Voucher Date': date, 'Taxable Amt': taxable, 'IGST Amt': igst }], m1, {});

// GSTIN typed differently, everything else agrees -> possible match
const gstinCase = compareFrames(
  mkPortal('27AABCT1332L1ZE', 'INV-100', 10000, 1800),
  mkBooks('27AABCT1332L1ZZ', 'INV-100', 10000, 1800),
  1
);
check('possible: different GSTIN pairs up', gstinCase.length === 1 && gstinCase[0].Status === 'Possible Match', String(gstinCase[0]?.Status));
check('possible: classified as Possible Match', gstinCase[0].Status === 'Possible Match', String(gstinCase[0]?.Status));
check('possible: no field columns on the row', !Object.keys(gstinCase[0]).some((k) => k.endsWith(' match')));
check('possible: no Matched With column', gstinCase[0]['Matched With'] === undefined);

// Same GSTIN, bill number differs, money agrees -> possible match
const billCase = compareFrames(
  mkPortal('27AABCT1332L1ZE', 'INV-200', 10000, 1800),
  mkBooks('27AABCT1332L1ZE', 'INV-201', 10000, 1800),
  1
);
check('bill no: different bill no is a Mismatch, not a possible match', billCase.length === 1 && billCase[0].Status === 'Not Mismatch', String(billCase[0]?.Status));
check('bill no: classified as Not Mismatch', billCase[0].Status === 'Not Mismatch', String(billCase[0]?.Status));


// Same GSTIN + bill no, only the date differs, and dates are part of the key
const dateCase = compareFrames(
  mkPortal('27AABCT1332L1ZE', 'INV-300', 10000, 1800, '05-04-2026'),
  mkBooks('27AABCT1332L1ZE', 'INV-300', 10000, 1800, '09-04-2026'),
  1,
  { matchOnDate: true }
);
check('date: date-only difference is a Mismatch', dateCase.length === 1 && dateCase[0].Status === 'Not Mismatch', String(dateCase[0]?.Status));
check('date: date-only difference is a Not Mismatch', dateCase[0].Status === 'Not Mismatch', String(dateCase[0]?.Status));

// Money that does not agree must not become a possible match
const noPair = compareFrames(
  mkPortal('27AABCT1332L1ZE', 'INV-400', 10000, 1800),
  mkBooks('27AABCT1332L1ZZ', 'INV-400', 12000, 2160),
  1
);
check('possible: different money is not paired', noPair.length === 2 && noPair.every((r) => r.Status.startsWith('Only in')), noPair.map((r) => r.Status).join(' | '));
check('possible: unpaired rows stay one-sided', noPair.every((r) => r.Status.startsWith('Only in')), noPair.map((r) => r.Status).join(' | '));

// Value reasons: tax only, and invoice value only
const taxOnly = compareFrames(
  mkPortal('27AABCT1332L1ZE', 'INV-500', 10000, 1800),
  mkBooks('27AABCT1332L1ZE', 'INV-500', 10000, 1900),
  1
);
check('tax difference is a Not Mismatch', taxOnly[0].Status === 'Not Mismatch', String(taxOnly[0]?.Status));

const summaryPossible = summarize(gstinCase);
check('summary: counts possible matches', summaryPossible.possible === 1, String(summaryPossible.possible));


// ---------- 10. invoice value as its own field ----------
const ivPortalRow = { 'GSTIN of Supplier': '27AABCT1332L1ZE', 'Invoice Number': 'INV-700', 'Invoice Date': '05-04-2026', 'Taxable Value': 10000, 'Invoice Value': 11800, 'Integrated Tax Amount': 1800 };
const ivBooksRow = { 'Supplier GSTIN': '27AABCT1332L1ZE', 'Voucher No': 'INV-700', 'Voucher Date': '05-04-2026', 'Taxable Amt': 10000, 'Invoice Value': 12000, 'IGST Amt': 1800 };
// Map from each file's own headers, the way the module does it.
const ivPortal = standardize([ivPortalRow], autoMapColumns(Object.keys(ivPortalRow)), {});
const ivBooks = standardize([ivBooksRow], autoMapColumns(Object.keys(ivBooksRow)), {});
const ivCase = compareFrames(ivPortal, ivBooks, 1);
check('invoice value: taken from the file when present', ivPortal[0]['Invoice Value'] === 11800, String(ivPortal[0]['Invoice Value']));
check('invoice value: a difference makes it a Mismatch', ivCase[0].Status === 'Not Mismatch', String(ivCase[0]?.Status));
check('invoice value: still a Not Mismatch', ivCase[0].Status === 'Not Mismatch', String(ivCase[0]?.Status));

// ---------- 11. never Matched when anything differs ----------
const multi = compareFrames(
  mkPortal('27AABCT1332L1ZE', 'INV-800', 10000, 1800),
  mkBooks('27AABCT1332L1ZE', 'INV-800', 11000, 2000),
  1
);
check('multi: two fields differ, still Not Mismatch', multi[0].Status === 'Not Mismatch', String(multi[0]?.Status));
check('multi: not Matched', multi[0].Status !== 'Matched');

console.log(failures === 0 ? 'ALL GST-RECO CHECKS OK' : `${failures} CHECK(S) FAILED`);
if (failures) process.exit(1);
