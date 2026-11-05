# Implementation Plan: Excel Report Security, Custom Period Filter & Upload Validation

## Context & Objectives
Based on client review feedback ("Rakesh Uncle"):
1. **Excel Report Security**: Old security/protection in exported reconciliation reports was lost; anyone can modify or tamper with numbers. Restore worksheet protection (read-only audit lock) across all exported Excel workbooks.
2. **Period Type "Custom" Date Filter**: Switching to "Custom" period mode currently fails silently because `periodBounds('custom')` throws an unhandled error when initial dates are missing. Resolve this so selecting Custom retains current active dates and allows seamless date range selection.
3. **Minor Errors & Upload Validation**: Implement clear file validation and mismatch alerts (e.g. if a Bank statement is uploaded into GST 2A/2B or books file is swapped) with friendly bilingual guidance.
4. **Preservation Constraint**: "main app ko modify mat karna ; usme update huye hai" — preserve all core reconciliation calculations, layout, hamburger sidebar toggle, and branding without unintended regressions.

---

## 1. Custom Period Filter Fix

### Problem Analysis
- In `src/components/PeriodPicker.tsx`, `handleModeChange(newMode)` calls `periodBounds(newMode)` without parameters.
- In `src/services/periodManager.ts`, `periodBounds('custom')` checks `if (!options.start || !options.end)` and throws:
  ```ts
  throw new Error("Custom period requires both From and To dates.");
  ```
- The exception is caught by `handleModeChange`, logging to console and aborting `onChange(p)`. As a result, clicking "Custom" in the dropdown does nothing.
- In `handleCustomDateChange`, if typing a date creates a temporary condition where `from > to`, it also throws and blocks updates.

### Proposed Solution
1. **`src/services/periodManager.ts`**:
   - In `periodBounds('custom', options)`:
     - If `options.start` is missing, default to `options.referenceDate` or current date (or first day of current month).
     - If `options.end` is missing, default to current date (or last day of current month).
     - If `start > end`, auto-swap or adjust rather than throwing a blocking fatal error, returning valid ISO strings and formatted label.
2. **`src/components/PeriodPicker.tsx`**:
   - In `handleModeChange`, when `newMode === 'custom'`, pass `{ start: value.start, end: value.end }` (preserving current selected dates as chosen by the user).
   - Ensure `handleCustomDateChange` updates state smoothly while editing.

---

## 2. Excel Report Protection & Security

### Problem Analysis
- `src/services/excelEngine.ts` generates workbooks with `XLSX.utils.book_new()` and `XLSX.writeFile()`, but sheets lack protection properties. Anyone opening the file in Microsoft Excel or Google Sheets can edit, alter, or overwrite reconciliation records and audit summaries.

### Proposed Solution
1. **Worksheet Protection (`ws['!protect']`)**:
   - In `src/services/excelEngine.ts`, apply standard worksheet protection metadata to every worksheet added to the workbook:
     ```ts
     ws['!protect'] = {
       password: '', // Standard audit lock
       selectLockedCells: true,
       selectUnlockedCells: true,
       formatCells: false,
       formatColumns: false,
       formatRows: false,
       insertColumns: false,
       insertRows: false,
       insertHyperlinks: false,
       deleteColumns: false,
       deleteRows: false,
       sort: false,
       autoFilter: false,
       pivotTables: false
     };
     ```
   - In Excel, cells are locked by default when sheet protection is active; users attempting edits will receive Excel's native protection alert: *"The cell or chart you're trying to change is on a protected sheet. To make a change, unprotect the sheet."*
2. **Firm Audit Stamp & Integrity Banner**:
   - Reinforce header metadata in the top rows: `[Fingenuity Associates - Confidential Audit Report - Protected Sheet]`.
   - Ensure all sheets across GSTR-2A/2B, GSTR-1, Bank Reco, TDS Reco, and Stock Reco inherit this protection during single-sheet and multi-sheet exports.

---

## 3. Upload Validation & Mismatch Alerts

### Problem Analysis
- When users accidentally upload the wrong file type (e.g. uploading a Bank statement or Stock ledger into the GST 2A/2B portal uploader, or uploading Books file into the Portal input), the parser either throws an generic error or produces empty results with confusion.

### Proposed Solution
1. **Fast Header & Sheet Content Pre-Validation**:
   - In `src/services/recoCore.ts` (and corresponding engines for Bank, GSTR-1, TDS, Stock):
     - Check file extensions (`.xlsx`, `.xls`, `.csv`).
     - Detect sheet header patterns (e.g., detecting if a sheet has "Withdrawal", "Deposit", "Balance" which indicates a bank statement rather than GSTR-2A).
2. **User-Friendly Error Banners**:
   - If an incompatible file is detected, display a clear, informative error message:
     - *"File format mismatch: The uploaded file appears to be a Bank Statement instead of GSTR-2A Portal data. Please select the correct file."*
     - Include Hindi explanation where applicable: *"कृपया सही फ़ाइल चुनें (GSTR-2A / Books Purchase फ़ाइल आवश्यक है)।"*
3. **Upload Feedback Indicators**:
   - Display a verified checkmark icon with sheet name and detected row count when a valid file is parsed.

---

## 4. Verification & Testing Plan

1. **Compilation & Linting**:
   - Run `compile_applet` to confirm zero TypeScript or React compilation errors.
   - Run `lint_applet` to verify clean imports and syntax.
2. **Functional Verification**:
   - **Period Selector**: Switch between Monthly, Quarterly, Financial Year, and Custom. Verify that Custom activates immediately, pre-populating current start/end dates, and date inputs update the period label and range correctly.
   - **Excel Report Security**: Download reconciliation reports from GST 2A, GSTR-1, Bank, TDS, and Stock modules. Inspect workbook output to verify `!protect` configuration prevents casual editing in spreadsheet software.
   - **File Upload Validation**: Test uploading mismatched files (or non-tabular files) to verify that descriptive warning alerts appear cleanly without crashing the app.
   - **UI & Layout Stability**: Verify that the hamburger sidebar toggle, responsive drawer, KPI cards, and existing reconciliation math remain 100% intact.
