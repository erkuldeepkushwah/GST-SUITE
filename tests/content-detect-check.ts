/**
 * Checks for content-based column detection and the matching that follows it.
 */
import {
  detectColumns,
  buildDetectedRows,
  compareByContent,
  summarizeContent,
  splitGstinInvoice,
  toDisplayDate,
  invoiceKey,
  cleanGstin,
} from '../src/services/contentDetect';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`);
}

// ---------- cleaning ----------
check('gstin: spaces and case', cleanGstin(' 27aabct1332l1ze ') === '27AABCT1332L1ZE', cleanGstin(' 27aabct1332l1ze '));
check('invoice key: separators and leading zeros', invoiceKey('inv/0001') === 'INV1', invoiceKey('inv/0001'));
check('invoice key: two spellings agree', invoiceKey('INV-001') === invoiceKey('inv 1'), `${invoiceKey('INV-001')} vs ${invoiceKey('inv 1')}`);

// ---------- dates ----------
check('date: DD-MM-YYYY', toDisplayDate('05-11-2026') === '05-11-2026', toDisplayDate('05-11-2026'));
check('date: DD/MM/YYYY', toDisplayDate('5/11/2026') === '05-11-2026', toDisplayDate('5/11/2026'));
check('date: YYYY-MM-DD', toDisplayDate('2026-11-05') === '05-11-2026', toDisplayDate('2026-11-05'));
check('date: DD-MMM-YYYY', toDisplayDate('05-Nov-2026') === '05-11-2026', toDisplayDate('05-Nov-2026'));
check('date: excel serial', toDisplayDate(46331) === '05-11-2026', toDisplayDate(46331));

// ---------- combined gstin + bill no ----------
const split = splitGstinInvoice('07AACCW5595K1ZP/INV-101');
check('split: gstin', split.gstin === '07AACCW5595K1ZP', split.gstin);
check('split: invoice', split.invoice === 'INV-101', split.invoice);

// ---------- detection on a sheet with wrong headers ----------
// Deliberately unhelpful headers: no gstin/invoice/date hints anywhere.
const headers = ['Sr', 'Dt', 'Party & Bill', 'Narration', 'Taxable', 'CGST', 'SGST', 'IGST'];
const rows = [
  [1, 46331, '27AABCT1332L1ZE/INV-1', 'Purchase', 10000, 0, 0, 1800],
  [2, 46332, '24AAACB2233M1ZZ/INV-2', 'Purchase', 20000, 3600, 3600, 0],
  [3, 46333, '23AACCF4455P1ZD/INV-3', 'Purchase', 5000, 900, 900, 0],
];
const g = detectColumns(headers, rows);
const role = (i: number) => g[i].role;
check('detect: row number column ignored', role(0) === 'unknown', role(0));
check('detect: date column', role(1) === 'date', role(1));
check('detect: combined gstin + bill no', role(2) === 'gstin_invoice', role(2));
check('detect: narration is not a bill number', role(3) !== 'invoice', role(3));
check('detect: tax columns by header', role(5) === 'cgst' && role(6) === 'sgst' && role(7) === 'igst', `${role(5)}/${role(6)}/${role(7)}`);
check('detect: widest amount becomes taxable', role(4) === 'taxable', role(4));

const built = buildDetectedRows(rows, g);
check('build: gstin from the combined cell', built[0].GSTIN === '27AABCT1332L1ZE', built[0].GSTIN);
check('build: invoice from the combined cell', built[0]['Invoice No'] === 'INV-1', built[0]['Invoice No']);
check('build: serial date normalised', built[0].Date === '05-11-2026', built[0].Date);
check('build: total = taxable + taxes', built[1].Total === 27200, String(built[1].Total));

// ---------- matching ----------
const portal = [
  { GSTIN: '27AABCT1332L1ZE', 'Invoice No': 'INV-1', Date: '05-11-2026', Taxable: 10000, IGST: 1800, CGST: 0, SGST: 0, Cess: 0, Total: 11800 },
  { GSTIN: '24AAACB2233M1ZZ', 'Invoice No': 'INV-2', Date: '06-11-2026', Taxable: 20000, IGST: 3600, CGST: 0, SGST: 0, Cess: 0, Total: 23600 },
  { GSTIN: '23AACCF4455P1ZD', 'Invoice No': 'INV-3', Date: '07-11-2026', Taxable: 5000, IGST: 900, CGST: 0, SGST: 0, Cess: 0, Total: 5900 },
  { GSTIN: '29AAACH6789K1ZU', 'Invoice No': 'INV-4', Date: '08-11-2026', Taxable: 7000, IGST: 1260, CGST: 0, SGST: 0, Cess: 0, Total: 8260 },
];
const books = [
  { ...portal[0] },                                                        // same everything
  { ...portal[1], Date: '09-11-2026' },                                    // date only differs
  { ...portal[2], GSTIN: '23AABCS8899Q1ZB', 'Invoice No': 'INV-99' },      // both keys differ, amount same
  { ...portal[3], Total: 8500, IGST: 1500 },                               // amount differs
];
const res = compareByContent(books, portal, 1);
const byInv = (k: string) => res.find((r) => r['Invoice No'] === k || r.Note.includes(k));

const inv1 = res.find((r) => r['Total (Books)'] === 11800 && r.Status === 'Match');
check('match: identical row', !!inv1 && inv1.Note === '', JSON.stringify(inv1));

const dateOnly = res.find((r) => r.Status === 'Match' && r.Note.includes('Date different'));
check('match: date only differs -> Match with a date note', !!dateOnly, JSON.stringify(dateOnly));

const possible = res.find((r) => r.Status === 'Possible Match');
check('possible: both keys differ, amount same', !!possible && possible.Note.includes('both differ'), JSON.stringify(possible));

const mismatch = res.find((r) => r.Status === 'Mismatch');
check('mismatch: amount differs', !!mismatch && mismatch.Note.includes('Amount diff'), JSON.stringify(mismatch));

const s = summarizeContent(res);
check('summary: counts add up', s.match + s.possible + s.mismatch + s.notInBooks + s.notIn2B === res.length,
  JSON.stringify(s));

// not-in cases
const lonely = compareByContent([{ ...portal[0] }], [{ ...portal[1] }], 1);
check('not in: nothing shared -> Not in 2B and Not in Books', lonely.filter((r) => r.Status.startsWith('Not in')).length === 2,
  lonely.map((r) => r.Status).join(' | '));

// one-to-one
const dup = compareByContent([{ ...portal[0] }], [{ ...portal[0] }, { ...portal[0], 'Invoice No': 'INV-1B' }], 1);
check('one-to-one: a books row pairs once', dup.filter((r) => r.Status === 'Match').length === 1,
  JSON.stringify(dup.map((r) => `${r.Status}:${r['Invoice No']}`)));

console.log(failures === 0 ? 'ALL CONTENT-DETECT CHECKS OK' : `${failures} CHECK(S) FAILED`);
if (failures) process.exit(1);
