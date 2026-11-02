"""Stock report check (Tally stock summary). No physical count sheet yet, so this is an
internal-consistency reco: totals tie-out, negative stock, missing values, rate outliers, duplicates."""
import pandas as pd
import reco_core as rc

SRC = None  # Pass the uploaded file to build(); no default path.


TIE_TOL = 0.5  # rupee / unit tolerance for the tie-out checks


def load_items(src):
    raw = pd.read_excel(src, header=None)
    df = raw.iloc[5:3158, :9].copy()
    df.columns = ["SN", "ID", "Brand", "Product", "UNT", "Opening", "Closing", "StockValue", "MIS"]
    df = df[df["SN"].astype(str).str.match(r"^\d+\)$")].copy()
    for c in ["Opening", "Closing", "StockValue"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    grand = raw.iloc[3158, 5:8].tolist()
    units = raw.iloc[3160:3167, [0, 1]].dropna()
    units.columns = ["UNT", "Qty"]
    units = units[units["UNT"].astype(str).str.strip().str.match(r"^[A-Z]{2,4}$")].copy()
    units["Qty"] = pd.to_numeric(units["Qty"], errors="coerce")
    return df.reset_index(drop=True), grand, units


def build(src, gstin="", period_label="Stock summary"):
    """Returns (excel_bytes, summary, negative_items, no_value_items). GSTIN/period come from the app."""
    df, grand, units = load_items(src)
    df["Rate"] = (df["StockValue"] / df["Closing"]).where(df["Closing"] > 0).round(2)
    flags = []
    for _, r in df.iterrows():
        f = []
        if pd.notna(r["Closing"]) and r["Closing"] < 0: f.append("NEGATIVE STOCK")
        if pd.notna(r["Closing"]) and r["Closing"] > 0 and pd.isna(r["StockValue"]): f.append("QTY BUT NO VALUE")
        if pd.notna(r["Rate"]) and r["Rate"] < 1: f.append("RATE < ₹1 (check cost)")
        if pd.notna(r["Rate"]) and r["Rate"] > 50000: f.append("HIGH RATE (check)")
        if df["Product"].eq(r["Product"]).sum() > 1: f.append("DUPLICATE PRODUCT NAME")
        flags.append(", ".join(f))
    df["Flags"] = flags

    neg = df[df["Closing"] < 0]
    noval = df[df["Closing"].gt(0) & df["StockValue"].isna()]
    dup = df[df["Product"].duplicated(keep=False)]
    lowr = df[df["Rate"].lt(1)]

    def _status(diff):
        return "Tied" if abs(diff) <= TIE_TOL else "NOT TIED - check"

    unit = units.copy()
    unit["Per items"] = unit["UNT"].map(df.groupby("UNT")["Closing"].sum()).round(2)
    unit["Difference"] = (unit["Per items"] - unit["Qty"]).round(2)
    unit_ok = bool(unit["Difference"].abs().le(TIE_TOL).all()) if len(unit) else False
    unit_names = ", ".join(unit["UNT"].astype(str)) or "none found"

    diff_open = round(df["Opening"].sum() - grand[0], 2)
    diff_qty = round(df["Closing"].sum() - grand[1], 2)
    diff_val = round(df["StockValue"].sum() - grand[2], 2)
    summary = pd.DataFrame([
        {"Check": "Items sum vs grand total: Opening value", "Per items": round(df["Opening"].sum(), 2), "Per report total": round(grand[0], 2),
         "Difference": diff_open, "Status": _status(diff_open)},
        {"Check": "Items sum vs grand total: Closing qty", "Per items": round(df["Closing"].sum(), 2), "Per report total": round(grand[1], 2),
         "Difference": diff_qty, "Status": _status(diff_qty)},
        {"Check": "Items sum vs grand total: Stock value", "Per items": round(df["StockValue"].sum(), 2), "Per report total": round(grand[2], 2),
         "Difference": diff_val, "Status": _status(diff_val)},
        {"Check": f"Unit-wise closing qty ({unit_names})", "Per items": "", "Per report total": "",
         "Difference": round(unit["Difference"].abs().sum(), 2) if len(unit) else 0,
         "Status": "Tied for all units" if unit_ok else "NOT TIED - see Unit Tie-out"},
        {"Check": "Negative stock items", "Per items": int(len(neg)), "Per report total": "", "Difference": round(neg["StockValue"].sum(), 2),
         "Status": "Exception: value column shows the negative amount"},
        {"Check": "Qty present but stock value blank", "Per items": int(len(noval)), "Per report total": "", "Difference": round(noval["Closing"].sum(), 2),
         "Status": "Exception: qty units (value not included in total)"},
        {"Check": "Rate below ₹1 per unit", "Per items": int(len(lowr)), "Per report total": "", "Difference": round(lowr["StockValue"].sum(), 2),
         "Status": "Check cost entry"},
        {"Check": "Duplicate product name (same name, two IDs)", "Per items": int(len(dup)), "Per report total": "", "Difference": "",
         "Status": "Check item master"},
    ])
    exc = df[df["Flags"].ne("")][["ID", "Product", "UNT", "Opening", "Closing", "StockValue", "Rate", "MIS", "Flags"]].copy()
    exc = exc.sort_values("StockValue", na_position="last").reset_index(drop=True)
    unit = unit.rename(columns={"Qty": "Per report"})
    items = df[["ID", "Product", "Brand", "UNT", "Opening", "Closing", "StockValue", "Rate", "MIS", "Flags"]]
    results = {"Summary": summary, "Unit Tie-out": unit, "Exceptions": exc, "All Items": items}
    return rc.to_excel_bytes(results, gstin=gstin, period=period_label), summary, neg, noval


def all_tied(summary):
    """True only if no tie-out row reports a difference (used by the app KPI)."""
    return not summary["Status"].astype(str).str.contains("NOT TIED").any()
