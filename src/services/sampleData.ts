import { StandardRow } from './recoCore';
import { Gstr1PortalFile } from './gstr1Engine';

export const SAMPLE_GSTIN = "23AAOFT2395R1ZA";

export function getSampleGst2aRows(): { portal: StandardRow[]; books: StandardRow[] } {
  const portal: StandardRow[] = [
    {
      source: 'GSTR-2A', sheet: 'B2B', type: 'B2B', gstin: '27AABCT1332L1ZV', party: 'Tata Steel Limited',
      invoiceNo: 'TSL/26/10041', originalInvoiceNo: '', invoiceDate: '2026-04-12', docType: 'INV', docSource: 'Portal note type',
      taxable: 450000, igst: 81000, cgst: 0, sgst: 0, cess: 0, totalTax: 81000, itcEligibility: 'Eligible (portal)', itcClass: '', reason: '', period: '042026'
    },
    {
      source: 'GSTR-2A', sheet: 'B2B', type: 'B2B', gstin: '24AAACB2233M1Z9', party: 'Bharat Petroleum Corp Ltd',
      invoiceNo: 'BPCL/9921', originalInvoiceNo: '', invoiceDate: '2026-04-18', docType: 'INV', docSource: 'Portal note type',
      taxable: 185000, igst: 0, cgst: 16650, sgst: 16650, cess: 0, totalTax: 33300, itcEligibility: 'Eligible (portal)', itcClass: '', reason: '', period: '042026'
    },
    {
      source: 'GSTR-2A', sheet: 'B2B', type: 'B2B', gstin: '23AACCF4455P1ZK', party: 'Fast Logistics Pvt Ltd',
      invoiceNo: 'FL/INV/081', originalInvoiceNo: '', invoiceDate: '2026-04-20', docType: 'INV', docSource: 'Portal note type',
      taxable: 35000, igst: 0, cgst: 3150, sgst: 3150, cess: 0, totalTax: 6300, itcEligibility: 'Eligible (portal)', itcClass: '', reason: '', period: '042026'
    },
    {
      source: 'GSTR-2A', sheet: 'B2B', type: 'B2B', gstin: '29AAACH6789K1Z4', party: 'Infosys Limited',
      invoiceNo: 'INFY/APR/002', originalInvoiceNo: '', invoiceDate: '2026-04-25', docType: 'INV', docSource: 'Portal note type',
      taxable: 120000, igst: 21600, cgst: 0, sgst: 0, cess: 0, totalTax: 21600, itcEligibility: 'Eligible (portal)', itcClass: '', reason: '', period: '042026'
    },
    {
      source: 'GSTR-2A', sheet: 'B2B', type: 'B2B', gstin: '07AAACA5566R1Z1', party: 'Airtel Enterprise Services',
      invoiceNo: 'AIR/26/901', originalInvoiceNo: '', invoiceDate: '2026-04-28', docType: 'INV', docSource: 'Portal note type',
      taxable: 42000, igst: 7560, cgst: 0, sgst: 0, cess: 0, totalTax: 7560, itcEligibility: 'Eligible (portal)', itcClass: '', reason: '', period: '042026'
    },
    // CDN
    {
      source: 'GSTR-2A', sheet: 'CDNR', type: 'CDNR', gstin: '27AABCT1332L1ZV', party: 'Tata Steel Limited',
      invoiceNo: 'CN/TSL/01', originalInvoiceNo: 'TSL/26/10041', invoiceDate: '2026-04-29', docType: 'CN', docSource: 'Portal note type',
      taxable: 25000, igst: 4500, cgst: 0, sgst: 0, cess: 0, totalTax: 4500, itcEligibility: 'Eligible (portal)', itcClass: '', reason: 'Rate difference', period: '042026'
    }
  ];

  const books: StandardRow[] = [
    {
      // Match with Tata Steel
      source: 'BOOKS-PURCHASE', sheet: 'B2B', type: 'B2B', gstin: '27AABCT1332L1ZV', party: 'Tata Steel Ltd',
      invoiceNo: 'TSL/26/10041', originalInvoiceNo: '', invoiceDate: '2026-04-12', docType: 'INV', docSource: 'Invoice (books)',
      taxable: 450000, igst: 81000, cgst: 0, sgst: 0, cess: 0, totalTax: 81000, itcEligibility: 'Inputs', itcClass: 'Goods', reason: '', period: ''
    },
    {
      // Mismatch: BPCL tax diff by 500
      source: 'BOOKS-PURCHASE', sheet: 'B2B', type: 'B2B', gstin: '24AAACB2233M1Z9', party: 'Bharat Petroleum',
      invoiceNo: 'BPCL/9921', originalInvoiceNo: '', invoiceDate: '2026-04-18', docType: 'INV', docSource: 'Invoice (books)',
      taxable: 182000, igst: 0, cgst: 16380, sgst: 16380, cess: 0, totalTax: 32760, itcEligibility: 'Inputs', itcClass: 'Goods', reason: '', period: ''
    },
    {
      // Match: Fast Logistics
      source: 'BOOKS-PURCHASE', sheet: 'B2B', type: 'B2B', gstin: '23AACCF4455P1ZK', party: 'Fast Logistics',
      invoiceNo: 'FL/INV/081', originalInvoiceNo: '', invoiceDate: '2026-04-20', docType: 'INV', docSource: 'Invoice (books)',
      taxable: 35000, igst: 0, cgst: 3150, sgst: 3150, cess: 0, totalTax: 6300, itcEligibility: 'Input services', itcClass: 'Services', reason: '', period: ''
    },
    {
      // Only in Books
      source: 'BOOKS-PURCHASE', sheet: 'B2B', type: 'B2B', gstin: '23AABCS8899Q1ZQ', party: 'Standard Hardware Indore',
      invoiceNo: 'SH/26-27/045', originalInvoiceNo: '', invoiceDate: '2026-04-24', docType: 'INV', docSource: 'Invoice (books)',
      taxable: 54000, igst: 0, cgst: 4860, sgst: 4860, cess: 0, totalTax: 9720, itcEligibility: 'Capital goods', itcClass: 'Capital goods', reason: '', period: ''
    },
    // CDN
    {
      source: 'BOOKS-PURCHASE', sheet: 'CDNR', type: 'CDNR', gstin: '27AABCT1332L1ZV', party: 'Tata Steel Ltd',
      invoiceNo: 'CN/TSL/01', originalInvoiceNo: 'TSL/26/10041', invoiceDate: '2026-04-29', docType: 'CN', docSource: 'Portal note type',
      taxable: 25000, igst: 4500, cgst: 0, sgst: 0, cess: 0, totalTax: 4500, itcEligibility: 'Inputs', itcClass: 'Goods', reason: '', period: ''
    },
    {
      // Review CN in books
      source: 'BOOKS-PURCHASE', sheet: 'CDNR', type: 'CDNR', gstin: '23AABCS8899Q1ZQ', party: 'Standard Hardware Indore',
      invoiceNo: 'HT/DN/02', originalInvoiceNo: 'SH/26-27/045', invoiceDate: '2026-04-30', docType: 'REVIEW', docSource: 'Voucher prefix (verify)',
      taxable: 5000, igst: 0, cgst: 450, sgst: 450, cess: 0, totalTax: 900, itcEligibility: 'Capital goods', itcClass: 'Capital goods', reason: '', period: ''
    }
  ];

  return { portal, books };
}

export function getSampleGstr1Pack(): {
  portalFiles: Gstr1PortalFile[];
  booksFiles: any[];
  threeB: Array<{ 'Return Period': string; Taxable: number; IGST: number; CGST: number; SGST: number }>;
} {
  const portalFiles: Gstr1PortalFile[] = [
    {
      name: 'gstr1_offline_042026.json',
      fp: '042026',
      returnPeriod: 'Apr-2026',
      b2b: [
        {
          GSTIN: '23AAAFR8899C1Z1',
          'Invoice No': 'INV-2026-001',
          Date: '2026-04-05',
          'Invoice Value': 118000,
          POS: '23',
          Rate: '18',
          Taxable: 100000,
          Tax: 18000,
          ReturnPeriod: 'Apr-2026',
        },
        {
          GSTIN: '27AABCS7744K1Z2',
          'Invoice No': 'INV-2026-002',
          Date: '2026-04-14',
          'Invoice Value': 236000,
          POS: '27',
          Rate: '18',
          Taxable: 200000,
          Tax: 36000,
          ReturnPeriod: 'Apr-2026',
        },
        {
          GSTIN: '29AAACM3322E1Z3',
          'Invoice No': 'INV-2026-003',
          Date: '2026-04-22',
          'Invoice Value': 59000,
          POS: '29',
          Rate: '18',
          Taxable: 50000,
          Tax: 9000,
          ReturnPeriod: 'Apr-2026',
        }
      ],
      cdnr: [],
      b2cs: [
        { POS: '23', Rate: 18, Type: 'OE', Taxable: 80000, Tax: 14400 }
      ],
      hsn: [],
      netTaxable: 430000,
      igst: 45000,
      cgst: 16200,
      sgst: 16200,
    }
  ];

  const booksFiles = [
    {
      b2b: [
        {
          GSTIN: '23AAAFR8899C1Z1',
          'Invoice No': 'INV-2026-001',
          Date: '2026-04-05',
          'Invoice Value': 118000,
          POS: '23',
          Rate: '18',
          Taxable: 100000,
          Tax: 18000,
          BooksFile: 'Sales_Register_Apr2026.xlsx'
        },
        {
          GSTIN: '27AABCS7744K1Z2',
          'Invoice No': 'INV-2026-002',
          Date: '2026-04-14',
          'Invoice Value': 236000,
          POS: '27',
          Rate: '18',
          Taxable: 200000,
          Tax: 36000,
          BooksFile: 'Sales_Register_Apr2026.xlsx'
        },
        {
          // Only in Books
          GSTIN: '23AAACE9911B1Z9',
          'Invoice No': 'INV-2026-004',
          Date: '2026-04-28',
          'Invoice Value': 35400,
          POS: '23',
          Rate: '18',
          Taxable: 30000,
          Tax: 5400,
          BooksFile: 'Sales_Register_Apr2026.xlsx'
        }
      ],
      cdnr: [],
      b2cs: [],
      hsn: []
    }
  ];

  const threeB = [
    {
      'Return Period': 'Apr-2026',
      Taxable: 430000,
      IGST: 45000,
      CGST: 16200,
      SGST: 16200,
    }
  ];

  return { portalFiles, booksFiles, threeB };
}
