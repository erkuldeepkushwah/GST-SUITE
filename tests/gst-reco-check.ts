/**
 * Checks for the GST-Reconciliation module: column mapping, standardisation,
 * period filtering and the priority matching table.
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

const PORTAL_HEADERS = ['GSTIN of Supplier', 'Invoice Number', 'Invoice Date', 'Taxable Value', 'Invoice Value', 'Integrated Tax Amount', 'Central Tax Amount', 'State/UT Tax Amount'];
const BOOKS_HEADERS = ['Supplier GSTIN', 'Voucher No', 'Voucher Date', 'Taxable Amt', 'Invoice Value', 'IGST Amt', 'CGST Amt', 'SGST Amt'];
const pm = autoMapColumns(PORTAL_HEADERS);
const bm = autoMapColumns(BOOKS_HEADERS);

type Row = { gstin: string; inv: string; date: string; taxable: number; igst?: number; cgst?: number; sgst?: number };

const portalRow = (r: Row) => standardize([{
  'GSTIN of Supplier': r.gstin, 'Invoice Number': r.inv, 'Invoice Date': r.date,
  'Taxable Value': r.taxable,
  'Invoice Value': r.taxable + (r.igst || 0) + (r.cgst || 0) + (r.sgst || 0),
  'Integrated Tax Amount': r.igst || 0, 'Central Tax Amount': r.cgst || 0, 'State/UT Tax Amount': r.sgst || 0,
}], pm, {})[0];

const booksRow = (r: Row) => standardize([{
  'Supplier GSTIN': r.gstin, 'Voucher No': r.inv, 'Voucher Date': r.date,
  'Taxable Amt': r.taxable,
  'Invoice Value': r.taxable + (r.igst || 0) + (r.cgst || 0) + (r.sgst || 0),
  'IGST Amt': r.igst || 0, 'CGST Amt': r.cgst || 0, 'SGST Amt': r.sgst || 0,
}], bm, {})[0];

const one = (p: Row, b: Row) => compareFrames([portalRow(p)], [booksRow(b)], 1);

const A = '27AABCT1332L1ZE';
const B = '24AAACB2233M1ZZ';
const base: Row = { gstin: A, inv: 'INV-1', date: '05-04-2026', taxable: 10000, igst: 1800 };

// ---------- mapping ----------
const tallyHeaders = ['Supplier GSTIN', 'Voucher No', 'Voucher Date', 'Taxable Amt', 'IGST Amt', 'Party Name'];
const m1 = autoMapColumns(tallyHeaders);
check('mapping: voucher no -> invoice no', m1['Invoice No'] === 'Voucher No', m1['Invoice No']);
check('mapping: taxable amt -> taxable value', m1['Taxable Value'] === 'Taxable Amt', m1['Taxable Value']);
check('mapping: one column feeds one field', m1['Total Tax'] === NOT_MAPPED, m1['Total Tax']);
check('mapping: IGST / CGST picked up', pm['IGST'] === 'Integrated Tax Amount' && pm['CGST'] === 'Central Tax Amount', JSON.stringify({ i: pm['IGST'], c: pm['CGST'] }));
// Known gap at this commit: "State/UT Tax Amount" is taken by Total Tax and SGST
// stays unmapped. Fixing it needs the SGST alias + component guard.
console.log('note: SGST maps to', pm['SGST'], '| Total Tax maps to', pm['Total Tax']);

// ---------- values and dates ----------
check('toNumber: commas and currency', toNumber('₹1,23,456.50') === 123456.5, String(toNumber('₹1,23,456.50')));
check('date: DD-MM-YYYY', parseDateValue('05-04-2026') === '2026-04-05', parseDateValue('05-04-2026'));
check('date: YYYY-MM-DD', parseDateValue('2026-04-05') === '2026-04-05', parseDateValue('2026-04-05'));
check('date: same day in both formats is one value',
  parseDateValue('05-04-2026') === parseDateValue('2026-04-05'));

// ---------- priority table ----------
let r = one(base, { ...base });
check('rule 1: everything matches -> Match', r[0].Status === 'Match' && r[0]['Match Rule'] === 1, `${r[0].Status} / ${r[0]['Match Rule']}`);

r = one(base, { ...base, gstin: B });
check('rule 2: GSTIN differs, rest matches -> Possible Match', r[0].Status === 'Possible Match' && r[0]['Match Rule'] === 2, `${r[0].Status} / ${r[0]['Match Rule']}`);

r = one(base, { ...base, gstin: B, date: '09-04-2026' });
check('rule 3: GSTIN + date differ, invoice + taxable match -> Match', r[0].Status === 'Match' && r[0]['Match Rule'] === 3, `${r[0].Status} / ${r[0]['Match Rule']}`);

r = one(base, { ...base, gstin: B, date: '09-04-2026', inv: 'INV-9' });
check('rule 4: GSTIN + date + invoice differ, money matches -> Possible Match', r[0].Status === 'Possible Match' && r[0]['Match Rule'] === 4, `${r[0].Status} / ${r[0]['Match Rule']}`);

r = one(base, { ...base, date: '09-04-2026', inv: 'INV-9' });
check('rule 5: same GSTIN, date + invoice differ -> Mismatch', r[0].Status === 'Mismatch' && r[0]['Match Rule'] === 5, `${r[0].Status} / ${r[0]['Match Rule']}`);

r = one(base, { ...base, inv: 'INV-9' });
check('rule 6: same GSTIN, invoice differs -> Mismatch', r[0].Status === 'Mismatch' && r[0]['Match Rule'] === 6, `${r[0].Status} / ${r[0]['Match Rule']}`);

r = one(base, { ...base, taxable: 9000 });
check('rule 7: same GSTIN, taxable differs -> Mismatch', r[0].Status === 'Mismatch' && r[0]['Match Rule'] === 7, `${r[0].Status} / ${r[0]['Match Rule']}`);

// invoice value differs while taxable and tax agree: only reachable with a
// real Invoice Value column, so build it explicitly
const ivPortal = standardize([{ ...{}, 'GSTIN of Supplier': A, 'Invoice Number': 'INV-1', 'Invoice Date': '05-04-2026', 'Taxable Value': 10000, 'Invoice Value': 11800, 'Integrated Tax Amount': 1800 }], pm, {})[0];
const ivBooks = standardize([{ 'Supplier GSTIN': A, 'Voucher No': 'INV-1', 'Voucher Date': '05-04-2026', 'Taxable Amt': 10000, 'Invoice Value': 12000, 'IGST Amt': 1800 }], bm, {})[0];
r = compareFrames([ivPortal], [ivBooks], 1);
check('rule 8: same GSTIN, invoice value differs -> Mismatch', r[0].Status === 'Mismatch' && r[0]['Match Rule'] === 8, `${r[0].Status} / ${r[0]['Match Rule']}`);

r = one(base, { ...base, igst: 1900 });
check('rule 9: same GSTIN, a tax amount differs -> Mismatch', r[0].Status === 'Mismatch' && r[0]['Match Rule'] === 9, `${r[0].Status} / ${r[0]['Match Rule']}`);

r = one(base, { ...base, date: '09-04-2026' });
check('same GSTIN + invoice, only date differs -> Match (date shown as No)', r[0].Status === 'Match' && r[0]['Date match'] === 'No', `${r[0].Status} / ${r[0]['Date match']}`);

// ---------- pairing ----------
r = one({ ...base, inv: 'ONLY-PORTAL' }, { ...base, inv: 'ONLY-BOOKS' });
check('same GSTIN, different bill no -> Mismatch (rule 6)', r.length === 1 && r[0]['Match Rule'] === 6, JSON.stringify(r.map((x) => `${x.Status}/${x['Match Rule']}`)));

r = one({ ...base, inv: 'ONLY-PORTAL', gstin: B }, { ...base, inv: 'ONLY-BOOKS', taxable: 7000, igst: 1260 });
check('nothing in common -> both sides only-in', r.length === 2 && r.every((x) => x.Status.startsWith('Only in')), r.map((x) => x.Status).join(' | '));

const dupPortal = [portalRow(base), portalRow({ ...base, inv: 'INV-2' })];
const dupBooks = [booksRow(base)];
const dup = compareFrames(dupPortal, dupBooks, 1);
check('one books row is never matched twice', dup.filter((x) => x.Status !== 'Only in Portal').length === 1, JSON.stringify(dup.map((x) => `${x.Status}:${x['Invoice Key']}`)));
check('the exact invoice wins over the bill-number-only candidate', dup.find((x) => x['Invoice Key'] === 'INV-1')?.Status === 'Match', JSON.stringify(dup.map((x) => `${x.Status}:${x['Invoice Key']}`)));
check('the losing portal row is reported', dup.some((x) => x['Invoice Key'] === 'INV-2' && x.Status === 'Only in Portal'), JSON.stringify(dup.map((x) => `${x.Status}:${x['Invoice Key']}`)));

// reciprocal: the books side gets a chance to pair what the portal sweep left
const recPortal = [portalRow({ ...base, inv: 'A-1', taxable: 5000, igst: 900 })];
const recBooks = [booksRow({ ...base, inv: 'B-1', taxable: 5000, igst: 900, gstin: A })];
const rec = compareFrames(recPortal, recBooks, 1);
check('reciprocal sweep pairs a bill-number difference', rec.length === 1 && rec[0].Status === 'Mismatch', JSON.stringify(rec.map((x) => `${x.Status}/${x['Match Rule']}`)));

// ---------- period, summary, 3B ----------
const pRows = [portalRow({ ...base, inv: 'P1', date: '05-04-2026' }), portalRow({ ...base, inv: 'P2', date: '05-05-2026' })];
check('period filter: books use the invoice date', filterRowsForPeriod(pRows.map((x) => ({ ...x, 'Invoice Date': x['Invoice Date'] })), 'BOOKS-PURCHASE', '2026-04-01', '2026-04-30').length === 1);
check('period: MMYYYY parsing', periodToMmyyyy('Apr-2026') === '042026', periodToMmyyyy('Apr-2026'));
check('period: return period column detected', detectReturnPeriodColumn(['GSTIN', 'Return Period']) === 'Return Period');

const sMatch = summarize(compareFrames([portalRow(base)], [booksRow(base)], 1));
check('summary: counts a match', sMatch.matched === 1, String(sMatch.matched));
const sPossible = summarize(compareFrames([portalRow(base)], [booksRow({ ...base, gstin: B })], 1));
check('summary: counts a possible match', sPossible.possible === 1, String(sPossible.possible));

check('3B: seven particulars', threeBRows({}).length === 7, String(threeBRows({}).length));

// ---------- file types and pairs ----------
check('pairs: three options', RECO_PAIRS.length === 3, String(RECO_PAIRS.length));
check('pairs: GSTR-1 goes with books sales', findPair('1-sales').books === 'BOOKS-SALES');
check('file types: six options', FILE_TYPES.length === 6, String(FILE_TYPES.length));
check('file types: two books registers', FILE_TYPES.filter((f) => f.books).length === 2);

console.log(failures === 0 ? 'ALL GST-RECO CHECKS OK' : `${failures} CHECK(S) FAILED`);
if (failures) process.exit(1);
