import * as XLSX from 'xlsx';
import { periodBounds, tryDate, formatDateIso } from '../src/services/periodManager';
import { isValidGstin, gstinChecksum, validateGstin, normalizeGstin } from '../src/services/validation';
import { auditGstins, gstinAuditRows } from '../src/services/gstinAudit';
import { parseGstr1JsonFile, parseBooksGstr1File, runGstr1MultiReconciliation } from '../src/services/gstr1Engine';
import { parseWorkbookSheets, runGst2aReconciliation } from '../src/services/recoCore';
import { getSampleGst2aRows } from '../src/services/sampleData';
import { runStockSnapshot, runStockMovement } from '../src/services/stockRecoEngine';
import { runBankReconciliation } from '../src/services/bankRecoEngine';
import { runTdsReconciliation } from '../src/services/tdsRecoEngine';

function mkFile(data: any, name: string, type: string): File {
  return new File([data], name, { type });
}
function xlsxFile(aoa: any[][], name: string): File {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Sheet1');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new File([buf], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** Every reconciliation row carries a Reason, so no table shows a blank cell. */
function requireReason(label: string, rows: Array<Record<string, any>>) {
  const missing = (rows || []).filter((r) => !String(r?.Reason ?? '').trim());
  if (missing.length > 0) {
    throw new Error(`${label}: ${missing.length} row(s) without a Reason`);
  }
  console.log(`Reasons present: ${label} (${(rows || []).length} rows)`);
}

async function engineChecks() {
  // ---------- 1. GSTIN checksum ----------
  const known = ['27AAPFU0939F1ZV', '29AAGCB7383J1Z4', '23AAOFT2395R1ZA'];
  console.log('GSTIN check:', known.map(g => `${g}=${isValidGstin(g)}`).join(' '));

  // ---------- 1b. GSTIN validation reasons ----------
  const good = '23AAOFT2395R1ZA';
  const badCheck = good.slice(0, 14) + (good[14] === 'A' ? 'B' : 'A');
  const badState = '39' + good.slice(2);
  const badPan = good.slice(0, 5) + 'X' + good.slice(6);
  const cases: Array<[string, string]> = [
    [good, 'valid'],
    ['23 aa oft 2395 r1za', 'valid (spaces/lowercase normalised)'],
    [badCheck, 'checksum'],
    [badState, 'state'],
    [badPan, 'pan'],
    ['23AAOFT', 'length'],
    [good + '-EXTRA', 'length'],
    ['', 'empty'],
  ];
  console.log('GSTIN reasons:');
  for (const [input, expected] of cases) {
    const res = validateGstin(input);
    const got = res.status === 'invalid' ? res.issue : res.status;
    console.log(`  ${JSON.stringify(input)} -> ${got} (expected ${expected})`);
  }
  console.log('  normalise:', normalizeGstin(' 27-aapfu-0939f-1zv '));

  // ---------- 1c. GSTIN audit over imported rows ----------
  const okGstin = '27AABCT1332L1ZE';
  const typo = okGstin.slice(0, 13) + (okGstin[13] === 'Z' ? 'Y' : 'Z') + okGstin[14];
  const audit = auditGstins([
    {
      label: 'portal.xlsx',
      rows: [
        { 'Supplier GSTIN': okGstin },
        { 'Supplier GSTIN': okGstin },
        { 'Supplier GSTIN': typo },                 // one character off the valid one
        { 'Supplier GSTIN': badCheck },              // bad check digit, no near match
        { 'Supplier GSTIN': '' },                    // missing
        { 'Supplier GSTIN': 'URP' },                 // unregistered
      ],
    },
    {
      label: 'books.xlsx',
      rows: [{ GSTIN: '29AAACH6789K1ZU' }, { gstin: '24AAACB2233M1ZZ' }],
    },
  ]);
  console.log('GSTIN audit:', JSON.stringify({
    rows: audit.totalRows,
    checked: audit.checkedRows,
    validRows: audit.validRows,
    invalidRows: audit.invalidRows,
    missing: audit.missingRows,
    unregistered: audit.unregisteredRows,
    unique: audit.unique,
    invalidGstins: audit.invalid,
  }));
  console.log('  expected: 8 rows, 6 checked, 4 valid rows, 2 invalid rows, 1 missing, 1 unregistered');
  console.log('  expected: 5 unique GSTINs, 2 of them invalid; the typo suggests', okGstin);
  for (const row of gstinAuditRows(audit)) console.log('  ', JSON.stringify(row));

  // ---------- 2. Period bounds ----------
  console.log('Q4 of FY26-27:', JSON.stringify(periodBounds('quarterly', { fyStartYear: 2026, quarter: 4 })));
  console.log('Q1 of FY26-27:', JSON.stringify(periodBounds('quarterly', { fyStartYear: 2026, quarter: 1 })));
  console.log('FY 26-27:', JSON.stringify(periodBounds('fy', { fyStartYear: 2026 })));

  // ---------- 3. GSTR-1 real portal JSON ----------
  const realJson = {
    gstin: '23AAOFT2395R1ZA',
    fp: '042026',
    version: 'GSTR1_1.1.0',
    b2b: [
      {
        ctin: '27AABCT1332L1ZE',
        inv: [
          {
            inum: 'INV-001', idt: '05-04-2026', val: 118000, pos: '23', rchrg: 'N', inv_typ: 'R', etin: '',
            itms: [{ num: 1, itm_det: { rt: 18, txval: 100000, iamt: 0, camt: 9000, samt: 9000, csamt: 0 } }],
          },
        ],
      },
    ],
    b2cl: [
      { pos: '29', inv: [{ inum: 'B2CL-01', idt: '10-04-2026', val: 590000, itms: [{ num: 1, itm_det: { rt: 18, txval: 500000, iamt: 90000, csamt: 0 } }] }] },
    ],
    b2cs: [{ sply_ty: 'INTER', pos: '27', typ: 'OE', rt: 18, txval: 50000, iamt: 9000, camt: 0, samt: 0, csamt: 0 }],
    cdnr: [
      {
        ctin: '27AABCT1332L1ZE',
        nt: [
          { ntty: 'C', nt_num: 'CN-01', nt_dt: '12-04-2026', val: 11800, pos: '23', typ: 'C', itms: [{ num: 1, itm_det: { rt: 18, txval: 10000, iamt: 0, camt: 900, samt: 900, csamt: 0 } }] },
          { ntty: 'D', nt_num: 'DN-01', nt_dt: '14-04-2026', val: 5900, pos: '23', typ: 'D', itms: [{ num: 1, itm_det: { rt: 18, txval: 5000, iamt: 0, camt: 450, samt: 450, csamt: 0 } }] },
        ],
      },
    ],
    hsn: { data: [{ num: 1, hsn_sc: '7208', uqc: 'KGS', qty: 1000, txval: 100000, iamt: 0, camt: 9000, samt: 9000, csamt: 0 }] },
  };
  const p = await parseGstr1JsonFile(mkFile(JSON.stringify(realJson), 'gstr1_042026.json', 'application/json'));
  console.log('GSTR1 parsed: netTaxable=%s igst=%s cgst=%s sgst=%s hsnLines=%s cdnr=%s',
    p.netTaxable, p.igst, p.cgst, p.sgst, p.hsn.length, p.cdnr.length);
  console.log('  expected: netTaxable = 100000 + 500000(b2cl) + 50000 - 10000 + 5000 = 645000');
  console.log('  expected tax: cgst = 9000 + 9000(b2cl is igst) ... igst=90000+9000=99000; cgst=9000-900+450=8550; sgst=8550');

  // ---------- 4. GSTR-1 reco with 3B labels typed differently ----------
  const booksGstr1 = {
    b2b: [{ GSTIN: '27AABCT1332L1ZE', 'Invoice No': 'INV-001', Date: '05-04-2026', 'Invoice Value': 118000, POS: '23', Rate: '18', Taxable: 100000, Tax: 18000 }],
    cdnr: [], b2cs: [], hsn: [],
  };
  const r1 = runGstr1MultiReconciliation([p], [booksGstr1], '2026-04-01', '2026-04-30',
    [{ 'Return Period': 'apr 2026', Taxable: 645000, IGST: 99000, CGST: 8550, SGST: 8550 }]);
  requireReason('GSTR-1 b2bReco', r1.b2bReco);
  requireReason('GSTR-1 cdnrReco', r1.cdnrReco);
  requireReason('GSTR-1 hsnReco', r1.hsnReco);
  requireReason('GSTR-1 tieOut', r1.tieOut);
  console.log('GSTR1 tie-out row:', JSON.stringify(r1.tieOut[0]));

  // ---------- 5. GST 2A sample ----------
  const { portal, books } = getSampleGst2aRows();
  const r2 = runGst2aReconciliation(portal, books, '23AAOFT2395R1ZA', {
    startDate: '2026-04-01', endDate: '2026-04-30', basis: 'both', manualTypes: [],
  });
  requireReason('2A b2bReco', r2.b2bReco);
  requireReason('2A cdnReco', r2.cdnReco);
  console.log('2A dashboard:');
  for (const d of r2.dashboard) console.log('  ', d.Section, d.Status, d.Count, d['Taxable as per 2A'], d['Taxable as per Books']);
  console.log('2A gstr9 rows:', JSON.stringify(r2.gstr9Itc.filter((x: any) => x.Category.startsWith('ITC eligible') || x.Category.startsWith('Net'))));

  // ---------- 6. Stock snapshot ----------
  const stockAoa = [
    ['Standard Hardware - Indore'],
    ['Stock Summary', '', '', '', '', '', ''],
    ['S.No', 'Item ID', 'Brand', 'Product', 'UNT', 'Opening', 'Closing', 'Stock Value', 'Rate'],
    ['1)', 'STK-001', 'Standard', 'Steel Rod 12mm', 'KGS', 12000, 15400, 770000, 50],
    ['2)', 'STK-002', 'Standard', 'Steel Angle 50x5', 'KGS', 8500, 6200, 341000, 55],
    ['3)', 'STK-003', 'Fastener', 'Hex Bolt M10x50', 'PCS', 50000, 42000, 126000, 3],
    ['4)', 'STK-004', 'Chemical', 'Industrial Primer 20L', 'NOS', 150, -5, -4500, 900],
    ['', '', '', '', '', '', '', '', ''],
    ['KGS', 21600, '', '', '', '', '', 1111000, ''],
    ['PCS', 42000, '', '', '', '', '', 126000, ''],
    ['NOS', 75, '', '', '', '', '', -4500, ''],
    ['', '', '', '', '', '', '', '', ''],
    ['Total', '', '', '', '', 70650, 63595, 1232500, ''],
  ];
  const st = await runStockSnapshot(xlsxFile(stockAoa, 'stock.xlsx'));
  requireReason('stock summary', st.summary);
  requireReason('stock unitTieOut', st.unitTieOut);
  console.log('Stock items=%s tied=%s', st.allItems.length, st.tied);
  console.log('  unitTieOut:', JSON.stringify(st.unitTieOut));
  console.log('  summary:', JSON.stringify(st.summary.map((s: any) => [s.Check, s['Per items'], s['Per report total'], s.Status])));

  // ---------- 7. Bank statement newest-first ----------
  const stmt = [
    ['Date', 'Narration', 'Chq/Ref No', 'Value Date', 'Withdrawal Amt', 'Deposit Amt', 'Closing Balance'],
    ['30-04-2026', 'NEFT RECEIVED', 'UTR998877', '30-04-2026', '', 25000, 125000],
    ['25-04-2026', 'CHQ PAID', '000123', '25-04-2026', 15000, '', 100000],
    ['20-04-2026', 'OPENING', '', '20-04-2026', '', '', 115000],
  ];
  const ledger = [
    ['Date', 'Particulars', 'Vch Type', 'Inst No', 'Vch No', 'Debit', 'Credit'],
    ['20-04-2026', 'Opening Balance', '', '', '', '', ''],
    ['25-04-2026', 'Vendor payment', 'Payment', '000123', '1', '', 15000],
    ['30-04-2026', 'Customer receipt', 'Receipt', 'UTR998877', '2', 25000, ''],
  ];
  const bank = await runBankReconciliation(xlsxFile(stmt, 'stmt.xlsx'), xlsxFile(ledger, 'ledger.xlsx'), '2026-04-01', '2026-04-30');
  requireReason('bank entries', bank.allEntries);
  console.log('Bank closing reco:', JSON.stringify(bank.closingReconciliation.map((x: any) => [x.Item, x.Amount])));
  console.log('Bank matched:', bank.summary.map((s: any) => `${s.Check}=${s.Value}`).join(' | '));
}

async function parserChecks() {
  const xlsxSheets = (sheets: Record<string, any[][]>, name: string): File => {
    const wb = XLSX.utils.book_new();
    for (const [n, aoa] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), n);
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    return new File([buf], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  };
  // GSTR-2A style sheet: title rows, headers with a trailing blank column
  const portal = [
    ['GSTR-2A B2B', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', ''],
    ['Supplier GSTIN', 'Supplier Name', 'Invoice No', 'Invoice Date', 'Invoice Type', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Cess', 'Return Period', ''],
    ['27AABCT1332L1ZE', 'Tata Steel Ltd', 'TSL/26/10041', '12-04-2026', 'Regular', 450000, 81000, 0, 0, 0, 'Apr-2026', ''],
    ['24AAACB2233M1ZZ', 'BPCL', 'BPCL/9921', '18-04-2026', 'Regular', 185000, 0, 16650, 16650, 0, 'Apr-2026', ''],
    ['', '', '', '', '', '', '', '', '', '', '', ''],
    ['Total', '', '', '', '', 635000, 81000, 16650, 16650, 0, '', ''],
  ];
  const books = [
    ['Purchase Register'],
    ['GSTIN of Supplier', 'Supplier Name', 'Invoice Number', 'Invoice date', 'Taxable Value', 'Integrated Tax Paid', 'Central Tax Paid', 'State UT Tax Paid', 'Cess Paid', 'Eligibility For ITC'],
    ['27AABCT1332L1ZE', 'Tata Steel Ltd', 'TSL/26/10041', '12-04-2026', 450000, 81000, 0, 0, 0, 'Inputs'],
    ['24AAACB2233M1ZZ', 'BPCL', 'BPCL/9921', '18-04-2026', 185000, 0, 16650, 16650, 0, 'Inputs'],
    ['23AABCS8899Q1ZB', 'Standard Hardware', 'SH/26-27/045', '24-04-2026', 54000, 0, 4860, 4860, 0, 'Capital goods'],
  ];

  const pRows = await parseWorkbookSheets(xlsxSheets({ 'B2B': portal }, 'portal.xlsx'), 'GSTR-2A');
  console.log('2A rows:', pRows.length);
  for (const r of pRows) console.log('  ', r.gstin, r.invoiceNo, r.invoiceDate, r.taxable, r.igst, r.cgst, r.period);

  const bRows = await parseWorkbookSheets(xlsxSheets({ 'Purchase': books }, 'books.xlsx'), 'BOOKS-PURCHASE');
  console.log('Books rows:', bRows.length);
  for (const r of bRows) console.log('  ', r.gstin, r.invoiceNo, r.invoiceDate, r.taxable, r.totalTax, r.itcEligibility, r.itcClass);

  // GSTR-1 books file (Tally export: 4 title rows, header on row 5)
  const g1books = {
    'B2B': [
      ['Tally GSTR-1'],
      ['Company: Standard Hardware'],
      ['Period: Apr-2026'],
      [''],
      ['GSTIN/UIN of Recipient', 'Receiver Name', 'Invoice Number', 'Invoice date', 'Invoice Value', 'Place Of Supply', 'Rate', 'Taxable Value'],
      ['27AABCT1332L1ZE', 'Tata Steel', 'INV-001', '05-04-2026', 118000, '23', 18, 100000],
      ['', '', '', '', '', '', '', ''],
    ],
    'HSN Summary': [
      ['Tally HSN'],
      [''],
      [''],
      [''],
      ['HSN', 'Description', 'UQC', 'Total Quantity', 'Rate', 'Taxable Value', 'Integrated Tax Amount', 'Central Tax Amount', 'State Tax Amount'],
      ['7208', 'Steel', 'KGS', 1000, 18, 100000, 0, 9000, 9000],
    ],
  };
  const g1 = await parseBooksGstr1File(xlsxSheets(g1books, 'books_gstr1.xlsx'));
  console.log('GSTR1 books: b2b=%s hsn=%s', g1.b2b.length, g1.hsn.length);
  console.log('  ', JSON.stringify(g1.b2b[0]), JSON.stringify(g1.hsn[0]));

  // TDS: tally ledger + CA sheet
  const tally = [
    ['Date', 'Particulars', 'Vch Type', 'Vch No', 'Debit', 'Credit'],
    ['30-04-2026', 'TDS on contractor', 'Journal', 'JV-1', '', 25000],
    ['31-05-2026', 'TDS on rent', 'Journal', 'JV-2', '', 10000],
    ['10-05-2026', 'TDS payment Apr', 'Payment', 'PMT-1', 25000, ''],
    ['15-04-2026', 'Partner remuneration', 'Journal', 'JV-3', '', 50000],
  ];
  const ca = [
    ['TDS Working Apr-Jun 2026'],
    ['Month', 'TDS Payable', 'TDS Paid'],
    ['Apr-2026', 25000, 25000],
    ['May-2026', 10000, 0],
    ['Jun-2026', 0, 0],
  ];
  const tds = await runTdsReconciliation(xlsxSheets({ Tally: tally }, 'tally.xlsx'), xlsxSheets({ CA: ca }, 'ca.xlsx'), '2026-04-01', '2026-06-30');
  requireReason('TDS monthlyReco', tds.monthlyReco);
  console.log('TDS monthly:');
  for (const m of tds.monthlyReco) console.log('  ', JSON.stringify(m));
  console.log('TDS summary:', JSON.stringify(tds.summary));
}

async function main() {
  await engineChecks();
  await parserChecks();
}

main().catch(e => { console.error('FAILED', e); process.exit(1); });
