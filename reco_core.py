"""Core reconciliation pipeline shared by the CLI report builder and the Streamlit app."""
import datetime as dt
import io
import re
import os
import pandas as pd
import gst_phase1 as g
import gstr9
from branding import FIRM_NAME, logo_path


def _rewind(src):
    if hasattr(src, "seek"):
        src.seek(0)
    return src

ZERO_TAX_NOTE = "Zero-tax CN: verify GST treatment with CA"
_TODAY = pd.Timestamp.today()
FY_START = pd.Timestamp(_TODAY.year if _TODAY.month >= 4 else _TODAY.year - 1, 4, 1)  # current Indian FY start (default only)
PRIOR_FY_ACTION = "Prior FY (FY 25-26) invoice: ITC claim ki Sec 16(4) time limit verify karein"


def add_prior_fy_flag(df, fy_start=FY_START):
    """Invoices dated before the FY start are prior-year documents reported in this FY."""
    if df is None or len(df) == 0:
        return df
    df = df.copy()
    dates = df["Date_2A"] if "Date_2A" in df.columns else pd.Series(pd.NaT, index=df.index)
    if "Date_BK" in df.columns:
        dates = dates.fillna(df["Date_BK"])
    dates = pd.to_datetime(dates, errors="coerce")
    df["Prior FY Flag"] = ""
    mask = dates < fy_start
    df.loc[mask, "Prior FY Flag"] = "Prior FY"
    if "Action" in df.columns:
        existing = df["Action"].fillna("").astype(str)
        add = mask & ~existing.str.contains("Sec 16", regex=False)
        df.loc[add, "Action"] = existing[add].where(existing[add].eq(""), existing[add] + " | ") + PRIOR_FY_ACTION
    return df


BASIS_INVOICE = "Invoice Date"
BASIS_RETURN = "Return Period"
BASIS_BOTH = "Both (Invoice Date + Return Period)"


def fy_start_of(ts):
    """1 April of the financial year that contains `ts` (Indian FY)."""
    ts = pd.Timestamp(ts)
    return pd.Timestamp(ts.year if ts.month >= 4 else ts.year - 1, 4, 1)


_MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], start=1)}


def _return_month(value):
    """Portal return period as a month Period.

    Accepts 'Apr-26', 'Apr-2026', 'April 2026', '042026' (MMYYYY) or a date. Two-digit years are
    read as 20xx. Anything that does not parse returns None, so it is never guessed.
    """
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, (pd.Timestamp, dt.datetime, dt.date)):
        return pd.Timestamp(value).to_period("M")
    text = str(value).strip()
    m = re.fullmatch(r"([A-Za-z]{3})[A-Za-z]*[-\s]?(\d{2}|\d{4})", text)
    if m and m.group(1).lower() in _MONTHS:
        year = int(m.group(2))
        year = year + 2000 if year < 100 else year
        return pd.Period(year=year, month=_MONTHS[m.group(1).lower()], freq="M")
    m = re.fullmatch(r"(\d{2})(\d{4})", text)  # MMYYYY
    if m and 1 <= int(m.group(1)) <= 12 and 2000 <= int(m.group(2)) <= 2100:
        return pd.Period(year=int(m.group(2)), month=int(m.group(1)), freq="M")
    return None


def _period_mask(df, start, end, basis, has_return=True):
    """Rows to keep for the selected period. Books rows always use invoice date (Books has no return period)."""
    inv = pd.to_datetime(df["Invoice Date"], errors="coerce")
    in_inv = (inv >= start) & (inv <= end)
    if not has_return or basis == BASIS_INVOICE or "Period" not in df.columns:
        return in_inv
    months = df["Period"].map(_return_month)
    lo, hi = start.to_period("M"), end.to_period("M")
    in_ret = months.map(lambda m: m is not None and lo <= m <= hi).astype(bool)
    if basis == BASIS_RETURN:
        return in_ret
    return in_inv | in_ret  # Both: also catches invoices dated earlier but reported in this period


def _doc_key(df):
    return df["GSTIN"].astype(str).str.upper().str.strip() + "|" + df["Invoice No"].astype(str).str.upper().str.replace(r"\s+", "", regex=True)


def _apply_period(p_df, k_df, start, end, basis):
    """Filter portal and Books rows for the period.

    Books rows are kept when their invoice date is in the period, or when the same GSTIN+invoice
    is among the selected portal rows (a late-reported invoice from an earlier month is then still
    compared, instead of showing as a false 'Only in 2A').
    """
    if start is None or end is None:
        return p_df, k_df
    p_out = p_df[_period_mask(p_df, start, end, basis, has_return=True)].copy() if len(p_df) else p_df
    if not len(k_df):
        return p_out, k_df
    in_inv = _period_mask(k_df, start, end, BASIS_INVOICE, has_return=False)
    if len(p_out):
        portal_keys = set(_doc_key(p_out))
        in_inv = in_inv | _doc_key(k_df).isin(portal_keys)
    return p_out, k_df[in_inv].copy()


def _pick(store, typ):
    frames = [v for (s, t), v in store.items() if t == typ]
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame(columns=g.STD_COLUMNS)


def load_sheets(src, want, gstin):
    """Detect and standardize every sheet of one uploaded workbook. src: path or file-like."""
    store = {}
    xl = pd.ExcelFile(src, engine="openpyxl")
    for sh in xl.sheet_names:
        raw = pd.read_excel(xl, sh)
        source, typ = g.detect_sheet(raw.columns)
        if source == want:
            store[(sh, typ)] = g.standardize(raw, source, typ, sh, gstin)
    return store


def run_reconciliation(portal_src, books_src, gstin, manual_types=None, tolerance=1.0,
                       period_start=None, period_end=None, basis=BASIS_BOTH):
    """Return a dict of result frames. manual_types: DataFrame with GSTIN, Note No, Type.

    period_start / period_end (inclusive) limit the B2B and CDN sections. basis decides how the
    portal side is filtered; Books always use invoice date. Without a period, the whole file is used.
    """
    portal = load_sheets(_rewind(portal_src), "GSTR-2A", gstin)
    books = load_sheets(_rewind(books_src), "BOOKS-PURCHASE", gstin)
    p_b2b, k_b2b = _pick(portal, "B2B"), _pick(books, "B2B")
    p_cdn, k_cdn = _pick(portal, "CDNR"), _pick(books, "CDNR")
    p_ba, p_cdna, k_bur = _pick(portal, "B2BA"), _pick(portal, "CDNRA"), _pick(books, "B2BUR")

    fy_start = fy_start_of(period_start) if period_start is not None else FY_START
    scope_rows = []
    if period_start is not None and period_end is not None:
        n_b2b_before = len(p_b2b) + len(k_b2b)  # B2B rows before filtering
        p_b2b, k_b2b = _apply_period(p_b2b, k_b2b, pd.Timestamp(period_start), pd.Timestamp(period_end), basis)
        p_cdn, k_cdn = _apply_period(p_cdn, k_cdn, pd.Timestamp(period_start), pd.Timestamp(period_end), basis)
        scope_rows.append({"Section": "Period filter (B2B rows outside period)", "Status": f"{basis}: {pd.Timestamp(period_start):%d-%b-%Y} to {pd.Timestamp(period_end):%d-%b-%Y}",
                           "Count": int(n_b2b_before - len(p_b2b) - len(k_b2b)), "Taxable as per 2A": 0.0, "Taxable as per Books": 0.0})

    b2b = g.reconcile(p_b2b.copy(), k_b2b.copy(), tolerance=tolerance)
    k_cdn = g.apply_portal_note_types(k_cdn, p_cdn)
    if manual_types is not None and len(manual_types):
        k_cdn = _apply_manual_df(k_cdn, manual_types)
    cdn = g.suggest_pairs(g.reconcile(p_cdn.copy(), k_cdn.copy(), tolerance=tolerance, match_doc_type=False))
    b2b = add_prior_fy_flag(b2b, fy_start=fy_start)
    cdn = add_prior_fy_flag(cdn, fy_start=fy_start)

    amend = pd.DataFrame()
    if len(p_ba):
        amend = p_ba[["GSTIN", "Invoice No", "Original Invoice No", "Invoice Date", "Taxable", "Total Tax", "Period"]].copy()
        amend["Status"] = "Pending: Books FY 25-26 needed"
        amend["Action"] = "Original invoice FY 25-26 ki Books register chahiye, tab reco hoga"

    bur = pd.DataFrame()
    if len(k_bur):
        bur = k_bur.groupby("ITC Eligibility", dropna=False).agg(
            Rows=("Invoice No", "size"), Taxable=("Taxable", "sum"), Tax=("Total Tax", "sum")).reset_index()

    review_mask = k_cdn["Doc Type"].eq("REVIEW") if len(k_cdn) else pd.Series(dtype=bool)
    review_notes = k_cdn[review_mask][["GSTIN", "Invoice No", "Invoice Date", "Reason", "Taxable", "Total Tax"]].rename(
        columns={"Invoice No": "Note No", "Invoice Date": "Note Date", "Reason": "Reason (Books)"}) if len(k_cdn) else pd.DataFrame()
    review_notes["Type (CN / DN)"] = "" if len(review_notes) == 0 else ""

    dash_rows = []
    for name, df in (("B2B (2A vs Books)", b2b), ("CDN (2A vs Books)", cdn)):
        for st in ["Matched", "Mismatch", "Only in 2A", "Only in Books"]:
            m = df["Status"].eq(st) if len(df) else pd.Series(dtype=bool)
            dash_rows.append({"Section": name, "Status": st, "Count": int(m.sum()),
                              "Taxable as per 2A": round(df.loc[m, "Taxable_2A"].sum(), 2) if len(df) else 0.0,
                              "Taxable as per Books": round(df.loc[m, "Taxable_BK"].sum(), 2) if len(df) else 0.0})
    prior_b2b = int((b2b.get("Prior FY Flag", pd.Series(dtype=str)) == "Prior FY").sum()) if len(b2b) else 0
    prior_cdn = int((cdn.get("Prior FY Flag", pd.Series(dtype=str)) == "Prior FY").sum()) if len(cdn) else 0
    dash_rows.append({"Section": "Prior FY invoices (B2B)", "Status": "Reported in FY 26-27, dated FY 25-26",
                      "Count": prior_b2b, "Taxable as per 2A": 0.0, "Taxable as per Books": 0.0})
    dash_rows.append({"Section": "Prior FY notes (CDN)", "Status": "Reported in FY 26-27, dated FY 25-26",
                      "Count": prior_cdn, "Taxable as per 2A": 0.0, "Taxable as per Books": 0.0})
    dash_rows.append({"Section": "Amended B2BA", "Status": "Pending (Books FY 25-26 needed)", "Count": len(amend),
                      "Taxable as per 2A": round(amend["Taxable"].sum(), 2) if len(amend) else 0.0, "Taxable as per Books": 0.0})
    dash_rows.append({"Section": "Amended CDNRA", "Status": "No data in portal file", "Count": len(p_cdna),
                      "Taxable as per 2A": 0.0, "Taxable as per Books": 0.0})
    dash_rows.append({"Section": "CDN type review", "Status": "Books notes still REVIEW", "Count": len(review_notes),
                      "Taxable as per 2A": 0.0, "Taxable as per Books": round(review_notes["Taxable"].sum(), 2) if len(review_notes) else 0.0})
    dash = pd.DataFrame(scope_rows + dash_rows)

    cols = ["Section", "Status", "GSTIN", "Invoice No", "Party", "Taxable_2A", "Taxable_BK", "Reason Code", "Prior FY Flag", "Action"]
    parts = []
    for name, df in (("B2B", b2b), ("CDN", cdn)):
        t = df.copy()
        t["Section"] = name
        for c in cols:
            if c not in t.columns:
                t[c] = ""
        parts.append(t[cols])
    combined = pd.concat(parts, ignore_index=True)

    portal_b2b_tax = round(float(p_b2b["Total Tax"].sum()), 2) if len(p_b2b) else 0.0
    itc9 = gstr9.itc_summary(_rewind(books_src), portal_b2b_total_tax=portal_b2b_tax, gstin=gstin)

    return {"Dashboard": dash, "GSTR-9 ITC": itc9, "B2B Reco": b2b.drop(columns=["_merge"]), "CDN Reco": cdn.drop(columns=["_merge"]),
            "Amended": amend if len(amend) else pd.DataFrame({"Info": ["No amended B2BA rows"]}),
            "B2BUR Books": bur if len(bur) else pd.DataFrame({"Info": ["No B2BUR rows"]}),
            "CDN Review": review_notes, "All Combined": combined}


def _apply_manual_df(books_notes, ov):
    import re
    lookup = {(str(g_).upper(), re.sub(r"\s+", "", str(n)).upper()): t for g_, n, t in zip(ov["GSTIN"], ov["Note No"], ov["Type"])}
    books_notes = books_notes.copy()
    for i, r in books_notes.iterrows():
        k = (r["GSTIN"], re.sub(r"\s+", "", str(r["Invoice No"])).upper())
        if k in lookup:
            books_notes.at[i, "Doc Type"] = lookup[k]
            books_notes.at[i, "Doc Source"] = "User confirmed"
    return books_notes


NAVY = "1F3A5F"
LIGHT_BORDER = "D0D7E2"
STATUS_FILL = {
    "Matched": "D9F2E6",
    "Mismatch": "FFF3CD",
    "Only in 2A": "F8D7DA",
    "Only in Books": "F8D7DA",
}
PRIOR_FILL = "FDE2C4"
# Indian grouping: 3,56,00,504 for crores, 1,23,456 for lakhs, plain for smaller numbers.
AMOUNT_FMT = r"[>=10000000]##\,##\,##\,##0.00;[>=100000]##\,##\,##0.00;##,##0.00"
COUNT_FMT = "#,##0"
DATE_FMT = "dd-mmm-yyyy"
WRAP_COLS = {"Action", "Reason Code", "Reason (Books)", "Basis", "Note"}
COUNT_COLS = {"Count", "Lines", "Rows"}


def _is_amount_col(name):
    n = str(name).lower()
    return any(k in n for k in ["taxable", "tax", "igst", "cgst", "sgst", "cess", "value", "diff",
                                "itc", "paid", "availed", "amount", "total"])


def _add_logo(ws, sheet_protect_password=None):
    """Logo at the top-left (A1) of every sheet, locked by sheet protection (no password unless given)."""
    path = logo_path()
    if not path:
        return
    try:
        from openpyxl.drawing.image import Image as XLImage
        img = XLImage(path)
        img.width, img.height = 56, 56
        ws.add_image(img, "A1")
    except Exception:
        return
    # Protection stops the logo from being moved or deleted. Filter and sort stay allowed.
    ws.protection.sheet = True
    ws.protection.objects = True
    ws.protection.scenarios = True
    ws.protection.autoFilter = False
    ws.protection.sort = False
    ws.protection.selectLockedCells = False
    ws.protection.selectUnlockedCells = False
    if sheet_protect_password:
        ws.protection.password = sheet_protect_password


def _style_sheet(ws, title, subtitle, df, protect_password=None):
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    header_row = 4
    ncols = max(len(df.columns), 1)
    last_col = get_column_letter(ncols)
    thin = Side(style="thin", color=LIGHT_BORDER)
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    ws.sheet_view.showGridLines = False
    # Title sits to the right of the logo (B1/B2), and the logo occupies rows 1-3 in column A.
    ws["B1"] = title
    ws["B1"].font = Font(bold=True, size=16, color=NAVY)
    ws["B2"] = subtitle
    ws["B2"].font = Font(italic=True, size=10, color="5B6675")
    ws.row_dimensions[1].height = 30
    ws.row_dimensions[2].height = 18
    ws.row_dimensions[3].height = 18

    # Header row
    for c in range(1, ncols + 1):
        cell = ws.cell(row=header_row, column=c)
        cell.fill = PatternFill("solid", fgColor=NAVY)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = border
    ws.row_dimensions[header_row].height = 30

    last_row = header_row + len(df)
    status_idx = list(df.columns).index("Status") + 1 if "Status" in df.columns else None
    prior_idx = list(df.columns).index("Prior FY Flag") + 1 if "Prior FY Flag" in df.columns else None

    for j, name in enumerate(df.columns, start=1):
        col_letter = get_column_letter(j)
        values = [ws.cell(row=r, column=j).value for r in range(header_row + 1, last_row + 1)]
        for r_idx, value in enumerate(values, start=header_row + 1):
            cell = ws.cell(row=r_idx, column=j)
            cell.border = border
            cell.alignment = Alignment(vertical="top", wrap_text=(name in WRAP_COLS))
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                if name in COUNT_COLS:
                    cell.number_format = COUNT_FMT
                elif _is_amount_col(name):
                    cell.number_format = AMOUNT_FMT
                    cell.alignment = Alignment(horizontal="right", vertical="top")
            elif hasattr(value, "year"):
                cell.number_format = DATE_FMT
                cell.alignment = Alignment(horizontal="center", vertical="top")
        # Column width from header and content
        sample = [str(name)] + [str(v) for v in values[:300] if v is not None]
        longest = max(len(s) for s in sample)
        width = 60 if name in WRAP_COLS else min(max(longest + 2, 11), 34)
        ws.column_dimensions[col_letter].width = width

    if status_idx:
        for r_idx in range(header_row + 1, last_row + 1):
            cell = ws.cell(row=r_idx, column=status_idx)
            fill = STATUS_FILL.get(cell.value)
            if fill:
                cell.fill = PatternFill("solid", fgColor=fill)
    if prior_idx:
        for r_idx in range(header_row + 1, last_row + 1):
            cell = ws.cell(row=r_idx, column=prior_idx)
            if cell.value == "Prior FY":
                cell.fill = PatternFill("solid", fgColor=PRIOR_FILL)
                cell.font = Font(bold=True, color="8A4B00")

    if len(df.columns) and len(df):
        ws.auto_filter.ref = f"A{header_row}:{last_col}{last_row}"
    ws.freeze_panes = f"A{header_row + 1}"
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_title_rows = f"{header_row}:{header_row}"
    _add_logo(ws, protect_password)


def to_excel_bytes(results, gstin="", period="", protect_password=None):
    """Excel report with formatted sheets: title, styled header, Indian amount format, status colours."""
    from datetime import datetime
    buf = io.BytesIO()
    generated = datetime.now().strftime("%d-%b-%Y %H:%M")
    subtitle = (f"GSTIN: {gstin or '-'}   |   Period: {period}   |   Generated: {generated}"
                f"   |   Prepared by: {FIRM_NAME}")
    with pd.ExcelWriter(buf, engine="openpyxl") as w:
        for name, df in results.items():
            sheet = name[:31]
            out = df.copy()
            out.to_excel(w, sheet_name=sheet, index=False, startrow=3)
            _style_sheet(w.sheets[sheet], f"{name}", subtitle, out, protect_password)
    return buf.getvalue()
