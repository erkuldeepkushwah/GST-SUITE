# GST & Accounts Reconciliation Suite

A modern React + TypeScript + Vite web application for GST and accounts reconciliation, built by Fingenuity Associates, Indore.

## Overview

One unified workspace with five core reconciliation modules:

| Module | Inputs | Output |
|---|---|---|
| **GST 2A/2B reco** | Portal 2A/2B Excel, Books purchase register | B2B, CN/DN with possible pair suggestions, GSTR-9 ITC summary, manual note confirmations |
| **GSTR-1 & GSTR-3B reco** | Portal GSTR-1 JSON (multi-month), Books GSTR-1 Excel, 3B values / PDFs | Invoice-level B2B/CDNR reco, month-wise portal figures, 3B tie-out grid |
| **Bank reco** | Bank statement (.xls/.xlsx), Tally bank ledger | Matched, timing/uncleared cheques, unrecorded bank charges, closing reconciliation |
| **TDS reco** | Tally TDS ledger, CA TDS return | Monthly tie-out, entry classification (payment, purchase DN, commission, non-TDS check) |
| **Stock reco** | Tally stock snapshot report, Movement register & closing stock summary | Totals tie-out, opening + inward − outward arithmetic check, negative stock, exceptions |

## Key Features

- **Languages**: 5 UI languages supported out-of-the-box (English, हिन्दी / Hindi, 中文 / Mandarin Chinese, Español / Spanish, Français / French).
- **Flexible Reporting Period**: Common reporting period picker (Monthly, Indian Financial Year Quarters, FY, Custom date range) with optional module-level overrides.
- **GSTIN Validation**: Real-time 15-character GSTIN validation and formatting.
- **Client-Side Spreadsheet Engine**: Fast, in-browser parsing of `.xlsx`, `.xlsm`, `.json` and `.csv` files using SheetJS.
- **Multi-Sheet Excel Reports**: Direct download of formatted `.xlsx` workbooks with firm headers, summary dashboards, and detail tabs.
- **Demo / Sample Data**: One-click demo data loader for each module to immediately test and verify reconciliation workflows.
- **Streamlit-Faithful Design**: Clean signature navy and gold styling, KPI metric cards, and responsive tabbed navigation.

## Development

```bash
# Install dependencies
npm install

# Start development server on port 3000
npm run dev

# Build for production
npm run build
```
