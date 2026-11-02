# GST & Accounts Reconciliation Suite

One shared Streamlit application for Desktop (local) and Streamlit Cloud deployment.

## Modules

| Module | Inputs | Output |
|---|---|---|
| GST 2A/2B reco | Portal 2A/2B Excel, Books purchase register | B2B, CN/DN, GSTR-9 ITC summary |
| GSTR-1 & GSTR-3B reco | Portal GSTR-1 JSON, Books GSTR-1 Excel, 3B values | Invoice-level B2B/CDNR/HSN reco, 3B tie-out |
| Bank reco | Bank statement (.xls/.xlsx), Tally bank ledger | Matched, timing, closing reconciliation |
| TDS reco | Tally TDS ledger, CA TDS return | Monthly tie-out, entry classification |
| Stock reco | Tally stock report | Totals tie-out, negative stock, exceptions |

## Languages

The sidebar has a language selector: English, Hindi, Mandarin Chinese, Spanish and French.
Screen text is translated. Excel report contents and engine action notes stay as written.
To add a language, edit `i18n.py`: add a code to `LANGUAGES` and a value in each `_RAW` entry.

## Period controls

- Common reporting period: Monthly, Quarterly, Financial Year, or Custom (From/To). Defaults to the current month.
- Each module can inherit the common period or override it.
- **GST 2A/2B**: filters by the selected period using one of three bases.
  - *Invoice Date*: both portal and Books rows must have an invoice date in the period.
  - *Return Period*: portal rows are filtered by return month, so late-reported invoices from earlier months still appear. Books rows matching those invoices are included for comparison.
  - *Both*: a portal row is kept if either test passes.
  - Books rows are always filtered by invoice date. A "Period filter" row on the dashboard shows how many B2B rows were left out.
  - The GSTR-9 ITC summary is annual and always uses the whole Books file.
- **Bank**: From and To are both applied. Opening balances are rolled forward to the From date. The closing reconciliation includes uncleared Books entries, bank-only entries and any opening difference. "Unexplained difference" should be zero.
- **GSTR-1 & 3B**: filtered by invoice date (B2B/CDNR) and return month (B2CS, HSN, 3B tie-out).
- **TDS**: any date range, with a monthly breakdown for the range.
- **Stock**: Snapshot mode only. Movement mode is still disabled (planned for a later phase).

## Checks built into the reports

- Stock tie-out statuses are computed. A total that does not tie is shown as "NOT TIED", not as "Tied".
- Missing optional columns or sections (for example no credit notes) do not stop a run.

## Tests

```bash
python -m unittest test_period_manager test_gstr1_reco test_reco_regressions -v
```

Tests use generated data, so no client files are needed.

## Run locally

```bash
pip install -r requirements.txt
streamlit run gst_suite_app.py
```

## Desktop (Windows)

Run `build_windows.bat` on Windows. The launcher starts `gst_suite_app.py` locally.
The application data directory is `Documents\GST Reco`.

## Deployment

Streamlit Cloud should point to this repository, branch `main`, and entry file `gst_suite_app.py`.
Push tested code to `main`; Streamlit Cloud will redeploy from that branch.

## Data safety

- Never commit client files (`*.xlsx`, `*.xls`, `*.xlsm`, `*.json`, `*.csv`) or local database files (`*.db`, `*.sqlite`, `*.sqlite3`).
- `.gitignore` blocks these file types and Streamlit secrets.
- Keep the repository private if it contains any business-specific source or sample material.
- Confirmed CN/DN types are stored in `manual_note_types.csv` in the data folder (`Documents\GST Reco` on Desktop).
- GSTR-3B values are typed in from the PDF. The 3B PDF is not parsed automatically.

## Final run checklist

1. Install the pinned versions: `pip install -r requirements.txt` (Streamlit 1.66.1, pandas 3.0.6).
2. Run the tests: `python -m unittest test_period_manager test_gstr1_reco test_reco_regressions -v` (22 tests).
3. Start the app: `streamlit run gst_suite_app.py`, then open the URL shown in the terminal.
4. Enter the 15-character GSTIN in the sidebar, choose the period, and upload the files for the module.
5. Commit the untracked project files (`launcher.py`, `period_manager.py`, `gstr1_multi.py`, tests, `assets/`, `app.ico`, `PHASE1_CHANGELOG.md`) before pushing to `main`.
