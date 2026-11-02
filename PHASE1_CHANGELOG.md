# Phase 1 change log

## Added
- `period_manager.py`: shared, UI-independent Indian financial-period engine.
- Common reporting period selector in the Streamlit sidebar.
- Per-module period override controls (hybrid design).
- GST 2A/2B period-basis selector: Invoice Date, Return Period, or Both.
- Stock report mode selector: Snapshot or Movement.
- Unit tests for monthly, quarterly, FY, and custom date boundaries.

## Integrated in this phase
- GSTR-1 module receives selected period start/end.
- TDS module receives selected period start/end.
- Bank module receives selected period end; its current engine is still end-date based.
- Stock snapshot remains available; movement calculation is intentionally disabled pending Phase 6.
- GST 2A/2B dual-basis selection is UI-only pending Phase 2 engine integration.

## Safety
- Expanded `.gitignore` to exclude accounting workbooks, JSON exports, CSV client data,
  SQLite databases, backups, virtual environments, and Streamlit secrets.
- Desktop launcher imports the new period module for packaging.

## Validation
- All Python files passed `py_compile`.
- Period-manager unit tests: 4 passed.
- Full Streamlit interactive/runtime and sample-file reconciliation testing remains pending.

## Review fixes (pre-release pass)
- `gstr1_reco.py`: fixed broken indentation in the B2B POS-match block. The module
  did not compile, so the whole Streamlit app failed to start.
- `gstr1_reco.py`: parsers now always return fixed column schemas. A GSTR-1 with no
  credit/debit notes (or no B2B invoices) previously crashed with KeyError.
- `gstr1_reco.py`: CDNR portal tax now includes CSAMT, consistent with B2B.
- `gstr1_multi.py`: B2B dashboard now shows "Advance Match" rows (they were dropped
  silently). Dashboard also shows Tax (portal) and Tax (Books).
- `gstr1_multi.py`: removed a duplicate `period_bounds` that duplicated `period_manager`.
- `stock_reco.py`, `gstr1_report.py`: removed hardcoded GSTIN and "April 2026" labels.
  Reports now use the GSTIN and period selected in the app.
- `gst_suite_app.py`: removed hardcoded 2026-10-31 default dates; defaults now follow
  today's date. Invalid custom period no longer crashes the stock page. GST 2A/2B run
  shows an error message instead of crashing on unexpected file formats.
- `gst_suite_app.py`: `use_container_width` replaced with `width="stretch"`.
- New `test_gstr1_reco.py` regression tests (B2B statuses, CDNR, empty sections).

## Round 2 improvements
- `stock_reco.py`: tie-out statuses are now computed. Previously they were hardcoded "Tied",
  so a wrong grand total still showed as tied. The app KPI uses the same check.
- `bank_reco.py`: From and To dates both apply. Opening balances roll forward to the From date.
  Closing reconciliation now includes bank-only entries and the opening difference, so
  "Unexplained" is zero for complete files. Removed the unused April-2026 `summary()`.
  Short UTR values (under 6 characters) no longer match on reference alone.
- `reco_core.py`: GST 2A/2B period filter with Invoice Date / Return Period / Both basis.
  Books rows matching selected portal invoices are kept, so late-reported invoices are not
  shown as false "Only in 2A". Prior-FY flag uses the selected period's FY.
- `reco_core.py`, `gst_phase1.py`: a missing CDNR or B2B section gives an empty frame with the
  standard schema instead of a KeyError.
- `gstr9.py`: a missing "Availed ITC" column counts as 0 instead of crashing. Blocked
  (ineligible) ITC is excluded from the gross eligible ITC total. Previously it was included.
- `tds_reco.py`: "Quarter total" renamed to "Period total". `run_tds` requires explicit dates.
  Quarter selector defaults to the current quarter.
- `reco_core.to_excel_bytes`: no hardcoded "FY 2026-27" default. Download file names include the period.
- `README.md`: updated for the current period behaviour and test command.
- New `test_reco_regressions.py` (bank, stock, 2A/2B basis, GSTR-9): 20 tests in total with the earlier files.

## Round 3: real GSTR-2A check
- `reco_core._return_month`: rewritten with a strict pattern. 'Apr-26' (two-digit year, as in the
  GSTR-2A consolidated export) was parsed as year 0026, so Return Period filtering would drop
  every portal row. Now parsed as April 2026. Invalid values return None instead of a guess.
- Verified on the real files (GSTR-2A consolidated Apr-Oct 2026 vs Books register FY 26-27):
  full run, Apr-2026 and Apr-Oct 2026 across all three bases, and Excel export.
- Regression test added for two-digit return periods.

## Round 4: languages
- New `i18n.py`: all screen text in English, Hindi, Mandarin Chinese, Spanish and French.
  These are the five largest languages by total speakers, with Hindi included.
- Language selector at the top of the sidebar. The choice is kept for the session.
- `gst_suite_app.py`: every label, button, tab, KPI, error and note goes through `t()`.
  Radio and dropdown values are language-independent keys, so changing language does not
  change the selected module, basis or period.
- Not translated: Excel report contents and column headers, and the reconciliation
  engine's action notes (they stay in the language they were written in).

## Round 5: firm branding
- `branding.py`: firm name, tagline and location are defined in one place (FIRM_NAME, FIRM_TAGLINE, FIRM_LOCATION).
- App: firm name and tagline line above each module title; About block at the bottom of the sidebar.
- Excel reports: subtitle line ends with "Prepared by: Fingenuity Associates".

## Round 6: desktop build fix
- `launcher.py`: added `import i18n`. The desktop build copies gst_suite_app.py as data, so
  PyInstaller only bundles modules the launcher imports. Without this, the .exe failed with
  "ModuleNotFoundError: No module named 'i18n'".
- New `test_build_bundle.py`: fails if the app imports a local module that the launcher does not.

## Round 7: firm name in titles
- Browser tab title and desktop window title now include the firm name.

## Round 8: sidebar logo banner
- New `assets/logo_banner.png`: the logo with the firm name beside it. Used only as the sidebar logo.
- `branding.sidebar_banner_path()` picks the banner, falling back to the plain logo.
- Removed the separate firm-name line under the sidebar logo.

## Still pending (by design, not regressions)
- Stock movement mode is disabled until Phase 6 (needs a sample of the movement report). `stock_reco.load_items` still uses the
  fixed Tally row layout (rows 5 to 3158); a different export layout needs a parser update.
