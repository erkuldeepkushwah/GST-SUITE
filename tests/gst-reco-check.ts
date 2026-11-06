/**
 * Checks for the GST-Reconciliation module ported from the GST-Reconciliation
 * app: column auto-mapping, standardisation and invoice comparison.
 */
import {
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
check('reco: INV002 value mismatch', String(byKey['INV-002']?.Status).startsWith('Value mismatch'), String(byKey['INV-002']?.Status));
check('reco: INV003 only in portal', byKey['INV-003']?.Status === 'Only in Portal', String(byKey['INV-003']?.Status));
check('reco: INV004 only in books', byKey['INV-004']?.Status === 'Only in Books', String(byKey['INV-004']?.Status));
check('reco: matched rows sort last', reco[reco.length - 1]['Status'] === 'Matched', reco[reco.length - 1]['Status']);

// tolerance of 2500 must absorb the 2000 taxable / 360 tax difference
const loose = compareFrames(p, b, 2500);
check('reco: tolerance absorbs small diff', loose.find((r) => r['Invoice Key'] === 'INV-002')?.Status === 'Matched');

const s = summarize(reco);
check('summary: matched 1', s.matched === 1, String(s.matched));
check('summary: mismatch 1', s.mismatched === 1, String(s.mismatched));
check('summary: only portal 1', s.onlyPortal === 1, String(s.onlyPortal));
check('summary: only books 1', s.onlyBooks === 1, String(s.onlyBooks));
check('summary: portal taxable total', s.portalTaxable === 175000, String(s.portalTaxable));

// ---------- 5. GSTR-3B summary ----------
const threeB = threeBRows({ igst: { portal: 90000, books: 86400 } });
check('3B: seven particulars', threeB.length === 7, String(threeB.length));
check('3B: difference is books minus portal', threeB[1].Difference === -3600, String(threeB[1].Difference));

console.log(failures === 0 ? 'ALL GST-RECO CHECKS OK' : `${failures} CHECK(S) FAILED`);
if (failures) process.exit(1);
