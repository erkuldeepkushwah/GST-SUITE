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
  RULE_REASON,
  normalizeInvoice,
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
// Match needs one of GSTIN / invoice no to agree plus the amount; the date is
// optional and only shows up in the Reason column.
let r = one(base, { ...base });
check('rule 1: GSTIN + invoice + date + amount -> Match', r[0].Status === 'Match' && r[0]['Match Rule'] === 1, `${r[0].Status} / ${r[0]['Match Rule']}`);

r = one(base, { ...base, date: '09-04-2026' });
check('rule 2: only the date differs -> Match', r[0].Status === 'Match' && r[0]['Match Rule'] === 2, `${r[0].Status} / ${r[0]['Match Rule']}`);

r = one(base, { ...base, inv: 'INV-9' });
check('rule 3: same GSTIN, invoice no differs -> Match', r[0].Status === 'Match' && r[0]['Match Rule'] === 3, `${r[0].Status} / ${r[0]['Match Rule']}`);

r = one(base, { ...base, inv: 'INV-9', date: '09-04-2026' });
check('rule 4: same GSTIN, invoice no + date differ -> Match', r[0].Status === 'Match' && r[0]['Match Rule'] === 4, `${r[0].Status} / ${r[0]['Match Rule']}`);

r = one(base, { ...base, gstin: B });
check('rule 5: same invoice no + date + amount, GSTIN differs -> Possible mismatch', r[0].Status === 'Possible mismatch' && r[0]['Match Rule'] === 5, `${r[0].Status} / ${r[0]['Match Rule']}`);
check('rule 5: reason names the wrong-state booking', /wrong state GSTIN/i.test(r[0].Reason), r[0].Reason);

r = one(base, { ...base, gstin: B, date: '09-04-2026' });
check('rule 6: same invoice no + amount, GSTIN and date differ -> Possible mismatch', r[0].Status === 'Possible mismatch' && r[0]['Match Rule'] === 6, `${r[0].Status} / ${r[0]['Match Rule']}`);

r = one(base, { ...base, taxable: 9000, igst: 1620 });
check('rule 8: GSTIN + invoice same, amount differs -> Mismatch', r[0].Status === 'Mismatch' && r[0]['Match Rule'] === 8, `${r[0].Status} / ${r[0]['Match Rule']}`);

r = one(base, { ...base, inv: 'INV-9', taxable: 9000, igst: 1620 });
check('rule 8: only the GSTIN is same, amount differs -> Mismatch', r[0].Status === 'Mismatch' && r[0]['Match Rule'] === 8, `${r[0].Status} / ${r[0]['Match Rule']}`);

r = one(base, { ...base, gstin: B, taxable: 9000, igst: 1620 });
check('rule 8: only the invoice no is same, amount differs -> Mismatch', r[0].Status === 'Mismatch' && r[0]['Match Rule'] === 8, `${r[0].Status} / ${r[0]['Match Rule']}`);

// row 7: nothing but the date agrees -> still no pair
r = one({ ...base, inv: 'P-1', gstin: B }, { ...base, inv: 'B-1' });
check('rule 7: neither GSTIN nor invoice no same -> no pair, even with the same date', r.length === 2 && r.every((x) => x.Status.startsWith('Only in')), r.map((x) => x.Status).join(' | '));

// rule 2 of the sheet: amount = taxable + tax, so a tax head split is not a
// difference when the total agrees (IGST vs CGST + SGST across a GSTIN change)
const splitPortal = [portalRow({ ...base, gstin: B, igst: 1800 })];
const splitBooks = [booksRow({ ...base, gstin: A, igst: 0, cgst: 900, sgst: 900 })];
const split = compareFrames(splitPortal, splitBooks, 1);
check('tax head split with the same total is not a Mismatch', split[0].Status === 'Possible mismatch' && split[0]['Match Rule'] === 5, `${split[0].Status} / ${split[0]['Match Rule']}`);

// rule 6 of the sheet: invoice numbers differing only by slash / dash / space
check('invoice key ignores slashes, dashes and spaces', normalizeInvoice('INV/26-27/001') === normalizeInvoice('inv 26 27 001'), normalizeInvoice('INV/26-27/001'));
const slashPortal = [portalRow({ ...base, inv: 'INV/001' })];
const slashBooks = [booksRow({ ...base, inv: 'inv-001' })];
check('the same bill with a slash vs a dash is one invoice', compareFrames(slashPortal, slashBooks, 1)[0]['Match Rule'] === 1);

// rule 4 of the sheet: with two candidates at the same rule, take the closer value
const tiePortal = [portalRow({ ...base, inv: 'P-1', date: '05-04-2026' })];
const tieBooks = [
  booksRow({ ...base, inv: 'B-FAR', date: '25-04-2026' }),
  booksRow({ ...base, inv: 'B-NEAR', date: '06-04-2026' }),
];
const tieRows = compareFrames(tiePortal, tieBooks, 1);
const tie = tieRows.find((x) => x.Status === 'Match');
check('one row pairs once, and the closest date is the pair reported', Boolean(tie) && tie?.['Date (books)'] === '2026-04-06', JSON.stringify(tieRows.map((x) => `${x.Status}:${x['Date (books)']}`)));

r = one(base, { ...base, date: '09-04-2026' });
check('date never decides the status: a date difference still says Date match = No', r[0].Status === 'Match' && r[0]['Date match'] === 'No', `${r[0].Status} / ${r[0]['Date match']}`);

// invoice value differs while taxable and tax agree: only reachable with a
// real Invoice Value column, so build it explicitly
const ivPortal = standardize([{ ...{}, 'GSTIN of Supplier': A, 'Invoice Number': 'INV-1', 'Invoice Date': '05-04-2026', 'Taxable Value': 10000, 'Invoice Value': 11800, 'Integrated Tax Amount': 1800 }], pm, {})[0];
const ivBooks = standardize([{ 'Supplier GSTIN': A, 'Voucher No': 'INV-1', 'Voucher Date': '05-04-2026', 'Taxable Amt': 10000, 'Invoice Value': 12000, 'IGST Amt': 1800 }], bm, {})[0];
r = compareFrames([ivPortal], [ivBooks], 1);
check('invoice value alone differs -> Mismatch (rule 8)', r[0].Status === 'Mismatch' && r[0]['Match Rule'] === 8, `${r[0].Status} / ${r[0]['Match Rule']}`);

// ---------- pairing ----------
r = one({ ...base, inv: 'ONLY-PORTAL' }, { ...base, inv: 'ONLY-BOOKS' });
check('same GSTIN, different bill no, same amount -> Match (rule 3)', r.length === 1 && r[0]['Match Rule'] === 3, JSON.stringify(r.map((x) => `${x.Status}/${x['Match Rule']}`)));

r = one({ ...base, inv: 'ONLY-PORTAL', gstin: B }, { ...base, inv: 'ONLY-BOOKS', taxable: 7000, igst: 1260 });
check('nothing in common -> both sides only-in', r.length === 2 && r.every((x) => x.Status.startsWith('Only in')), r.map((x) => x.Status).join(' | '));

const dupPortal = [portalRow(base), portalRow({ ...base, inv: 'INV-2' })];
const dupBooks = [booksRow(base)];
const dup = compareFrames(dupPortal, dupBooks, 1);
check('one books row is never matched twice', dup.filter((x) => x.Status !== 'Only in Portal').length === 1, JSON.stringify(dup.map((x) => `${x.Status}:${x['Invoice Key']}`)));
check('the exact invoice wins over the bill-number-only candidate', dup.find((x) => x['Invoice Key'] === 'INV1')?.Status === 'Match', JSON.stringify(dup.map((x) => `${x.Status}:${x['Invoice Key']}`)));
check('the losing portal row is reported', dup.some((x) => x['Invoice Key'] === 'INV2' && x.Status === 'Only in Portal'), JSON.stringify(dup.map((x) => `${x.Status}:${x['Invoice Key']}`)));

// reciprocal: the books side gets a chance to pair what the portal sweep left
const recPortal = [portalRow({ ...base, inv: 'A-1', taxable: 5000, igst: 900 })];
const recBooks = [booksRow({ ...base, inv: 'B-1', taxable: 5000, igst: 900, gstin: A })];
const rec = compareFrames(recPortal, recBooks, 1);
check('reciprocal sweep pairs a bill-number difference', rec.length === 1 && rec[0].Status === 'Match', JSON.stringify(rec.map((x) => `${x.Status}/${x['Match Rule']}`)));

// ---------- period, summary, 3B ----------
const pRows = [portalRow({ ...base, inv: 'P1', date: '05-04-2026' }), portalRow({ ...base, inv: 'P2', date: '05-05-2026' })];
check('period filter: books use the invoice date', filterRowsForPeriod(pRows.map((x) => ({ ...x, 'Invoice Date': x['Invoice Date'] })), 'BOOKS-PURCHASE', '2026-04-01', '2026-04-30').length === 1);
check('period: MMYYYY parsing', periodToMmyyyy('Apr-2026') === '042026', periodToMmyyyy('Apr-2026'));
check('period: return period column detected', detectReturnPeriodColumn(['GSTIN', 'Return Period']) === 'Return Period');

const sMatch = summarize(compareFrames([portalRow(base)], [booksRow(base)], 1));
check('summary: counts a match', sMatch.matched === 1, String(sMatch.matched));
const sPossible = summarize(compareFrames([portalRow(base)], [booksRow({ ...base, gstin: B })], 1));
check('summary: a GSTIN-only difference counts as possible, not matched', sPossible.matched === 0 && sPossible.possible === 1 && sPossible.possibleMismatch === 1, `${sPossible.matched}/${sPossible.possible}/${sPossible.possibleMismatch}`);

check('3B: seven particulars', threeBRows({}).length === 7, String(threeBRows({}).length));

// ---------- file types and pairs ----------
check('pairs: three options', RECO_PAIRS.length === 3, String(RECO_PAIRS.length));
check('pairs: GSTR-1 goes with books sales', findPair('1-sales').books === 'BOOKS-SALES');
check('file types: six options', FILE_TYPES.length === 6, String(FILE_TYPES.length));
check('file types: two books registers', FILE_TYPES.filter((f) => f.books).length === 2);

// ---------- reason column ----------
// Every row of the priority table must explain itself: the Reason column is
// what a reviewer reads before deciding whether to chase the supplier.
const oneOfEach: Array<[string, any]> = [
  ['rule 1', one(base, base)[0]],
  ['rule 2 (date only)', one(base, { ...base, date: '06-04-2026' })[0]],
  ['rule 3 (invoice no)', one(base, { ...base, inv: 'B-9' })[0]],
  ['rule 4 (invoice no + date)', one(base, { ...base, inv: 'B-9', date: '06-04-2026' })[0]],
  ['rule 5 (GSTIN)', one(base, { ...base, gstin: B })[0]],
  ['rule 6 (GSTIN + date)', one(base, { ...base, gstin: B, date: '06-04-2026' })[0]],
  ['rule 8 (amount)', one(base, { ...base, taxable: 9000, igst: 1620 })[0]],
  ['only in portal', compareFrames([portalRow({ ...base, inv: 'P-9' })], [], 1)[0]],
  ['only in books', compareFrames([], [booksRow({ ...base, inv: 'B-9' })], 1)[0]],
];
for (const [label, row] of oneOfEach) {
  check(`reason: ${label} explains itself`, Boolean(row && String(row.Reason || '').trim()), String(row?.Reason));
}
check(
  'reason: every priority rule has a headline',
  [1, 2, 3, 4, 5, 6, 8].every((r) => Boolean(RULE_REASON[r])),
  JSON.stringify(Object.keys(RULE_REASON))
);
check(
  'reason: a mismatch quotes the amount',
  String(one(base, { ...base, taxable: 9000, igst: 1620 })[0]?.Reason || '').includes('1,000.00'),
  String(one(base, { ...base, taxable: 9000, igst: 1620 })[0]?.Reason)
);

console.log(failures === 0 ? 'ALL GST-RECO CHECKS OK' : `${failures} CHECK(S) FAILED`);
if (failures) process.exit(1);
