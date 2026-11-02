"""Stock movement reconciliation (Tally movement register).

Snapshot mode in stock_reco.py checks one report against itself. Movement mode adds the
opening + inward - outward = closing arithmetic per item, and can cross-check the closing
quantity against the closing stock summary when both files are uploaded.

The loader is column-name driven, so Tally's default headings and the usual renamed ones
both work. Unknown headings are ignored.
"""
import pandas as pd

import reco_core as rc

TIE_TOL = 0.5

ALIASES = {
    "Item": ["item", "item name", "stock item", "product", "particulars", "description", "name of item"],
    "Unit": ["unit", "uom", "unit (uom)", "units", "base unit", "unit name"],
    "Opening": ["opening", "opening balance", "opening stock", "opening qty", "opening quantity",
                "balance b/f", "op bal", "opening qty."],
    "Inward": ["inward", "inwards", "inward qty", "inward quantity", "receipts", "received",
               "inward qty.", "purchase qty"],
    "Outward": ["outward", "outwards", "outward qty", "outward quantity", "issues", "issued",
                "sales qty", "outward qty."],
    "Closing": ["closing", "closing balance", "closing stock", "closing qty", "closing quantity",
                "balance c/f", "cl bal", "closing qty."],
    "Value": ["value", "closing value", "stock value", "amount", "closing amount"],
}
TOTAL_WORDS = ("total", "grand total", "opening balance", "closing balance")


def _norm(value):
    return " ".join(str(value).strip().lower().split())


def _match(header_cell):
    """Canonical column name for a heading cell, or None."""
    key = _norm(header_cell)
    if not key:
        return None
    for name, options in ALIASES.items():
        if key in options:
            return name
    for name, options in ALIASES.items():
        if any(key.startswith(o) or o in key for o in options if len(o) > 3):
            return name
    return None


def _find_header(raw, limit=40):
    """First row that names at least three known columns -> (row index, {col index: name})."""
    best = None
    for i in range(min(limit, len(raw))):
        cells = [_match(c) for c in raw.iloc[i].tolist()]
        found = {j: name for j, name in enumerate(cells) if name}
        if len(set(found.values())) >= 3 and "Item" in found.values():
            return i, found
        if best is None or len(found) > len(best[1]):
            best = (i, found)
    if best and len(set(best[1].values())) >= 2:
        return best
    raise ValueError("Stock movement file me heading row nahi mili (Item / Opening / Inward / Outward / Closing)")


def load_movement(src):
    """Movement register -> DataFrame[Item, Unit, Opening, Inward, Outward, Closing, Value?]."""
    raw = pd.read_excel(src, header=None)
    head, cols = _find_header(raw)
    body = raw.iloc[head + 1:].copy()
    out = pd.DataFrame()
    for idx, name in cols.items():
        if name in out.columns:
            continue
        out[name] = body[idx]
    if "Item" not in out.columns:
        raise ValueError("Stock movement file me item column nahi mila")
    out["Item"] = out["Item"].astype(str).str.strip()
    keep = out["Item"].ne("") & ~out["Item"].str.lower().isin(TOTAL_WORDS)
    out = out[keep].copy()
    for col in ["Opening", "Inward", "Outward", "Closing", "Value"]:
        if col in out.columns:
            out[col] = pd.to_numeric(
                out[col].astype(str).str.replace(",", "", regex=False).str.strip(),
                errors="coerce")
    for col in ["Opening", "Inward", "Outward"]:
        if col not in out.columns:
            out[col] = 0.0
        out[col] = out[col].fillna(0.0)
    if "Closing" not in out.columns:
        raise ValueError("Stock movement file me closing column nahi mila")
    if "Unit" not in out.columns:
        out["Unit"] = ""
    return out.reset_index(drop=True)


def load_closing_summary(src):
    """Closing stock summary -> DataFrame[Item, Closing (and Value when present)]."""
    raw = pd.read_excel(src, header=None)
    head, cols = _find_header(raw)
    body = raw.iloc[head + 1:].copy()
    out = pd.DataFrame()
    for idx, name in cols.items():
        if name in out.columns:
            continue
        out[name] = body[idx]
    if "Item" not in out.columns or "Closing" not in out.columns:
        raise ValueError("Closing stock file me Item aur Closing columns chahiye")
    out["Item"] = out["Item"].astype(str).str.strip()
    out = out[out["Item"].ne("") & ~out["Item"].str.lower().isin(TOTAL_WORDS)].copy()
    out["Closing"] = pd.to_numeric(
        out["Closing"].astype(str).str.replace(",", "", regex=False).str.strip(), errors="coerce")
    return out.reset_index(drop=True)


def _key(name):
    return _norm(name)


def build(src, closing_src=None, gstin="", period_label="Stock movement"):
    """Returns (excel_bytes, summary, exceptions, all_items)."""
    items = load_movement(src)
    items["Computed closing"] = (items["Opening"] + items["Inward"] - items["Outward"]).round(2)
    items["Difference"] = (items["Computed closing"] - items["Closing"]).round(2)

    flags = []
    for _, r in items.iterrows():
        f = []
        if pd.notna(r["Difference"]) and abs(r["Difference"]) > TIE_TOL:
            f.append("MOVEMENT DOES NOT TALLY")
        if pd.notna(r["Closing"]) and r["Closing"] < 0:
            f.append("NEGATIVE CLOSING")
        if float(r["Inward"]) == 0.0 and float(r["Outward"]) == 0.0:
            f.append("NO MOVEMENT IN PERIOD")
        if pd.notna(r["Closing"]) and r["Closing"] > 0 and "Value" in items.columns and pd.isna(r.get("Value")):
            f.append("QTY BUT NO VALUE")
        flags.append(", ".join(f))
    items["Flags"] = flags

    cross = None
    if closing_src is not None:
        summary_file = load_closing_summary(closing_src)
        summary_file["Key"] = summary_file["Item"].map(_key)
        items["Key"] = items["Item"].map(_key)
        cross = items.merge(
            summary_file[["Key", "Item", "Closing"]].rename(
                columns={"Item": "Item (stock summary)", "Closing": "Closing (stock summary)"}),
            on="Key", how="outer", indicator=True)
        cross["Difference"] = (cross["Closing"] - cross["Closing (stock summary)"]).round(2)
        cross["Match"] = cross["Difference"].abs().le(TIE_TOL).map({True: "Match", False: "Differs"})
        cross.loc[cross["_merge"].eq("left_only"), "Match"] = "Missing in stock summary"
        cross.loc[cross["_merge"].eq("right_only"), "Match"] = "Missing in movement file"
        cross["Match"] = cross["Match"].fillna("Differs")
        cross = cross.drop(columns=["Key", "_merge"]).reset_index(drop=True)
        mism = cross[~cross["Match"].eq("Match")]
    else:
        mism = items.iloc[0:0]

    err = items[items["Difference"].abs().gt(TIE_TOL)]
    neg = items[items["Closing"].lt(0)]
    idle = items[items["Inward"].eq(0) & items["Outward"].eq(0)]

    def status(diff):
        return "Tied" if abs(diff) <= TIE_TOL else "NOT TIED - check"

    total_diff = round(float(items["Difference"].sum()), 2)
    summary = pd.DataFrame([
        {"Check": "Items with opening + inward - outward not equal to closing",
         "Per items": int(len(err)), "Per report total": "",
         "Difference": round(float(err["Difference"].abs().sum()), 2),
         "Status": "All rows tally" if not len(err) else "NOT TIED - see Exceptions"},
        {"Check": "Total: opening + inward - outward vs closing",
         "Per items": round(float(items["Computed closing"].sum()), 2),
         "Per report total": round(float(items["Closing"].sum()), 2),
         "Difference": total_diff, "Status": status(total_diff)},
        {"Check": "Negative closing stock items", "Per items": int(len(neg)),
         "Per report total": "", "Difference": round(float(neg["Closing"].sum()), 2),
         "Status": "Exception: check issue entries" if len(neg) else "None"},
        {"Check": "Items with no movement in the period", "Per items": int(len(idle)),
         "Per report total": "", "Difference": "",
         "Status": "Informational: carried forward"},
        {"Check": "Items checked", "Per items": int(len(items)), "Per report total": "",
         "Difference": "", "Status": "From the movement register"},
    ])
    if cross is not None:
        summary = pd.concat([summary, pd.DataFrame([
            {"Check": "Closing vs closing stock summary: items differing",
             "Per items": int(len(mism)), "Per report total": "",
             "Difference": round(float(cross["Difference"].abs().sum()), 2),
             "Status": "All items match" if not len(mism) else "NOT TIED - see Cross-check"},
        ])], ignore_index=True)

    # "No movement" is informational, so it stays out of the exceptions sheet.
    exc = items[items["Flags"].ne("") & ~items["Flags"].eq("NO MOVEMENT IN PERIOD")][
        ["Item", "Unit", "Opening", "Inward", "Outward", "Closing", "Computed closing",
         "Difference", "Flags"]].copy()
    exc = exc.sort_values("Difference", key=lambda s: s.abs(), ascending=False).reset_index(drop=True)
    cols = ["Item", "Unit", "Opening", "Inward", "Outward", "Closing", "Computed closing", "Difference", "Flags"]
    results = {"Summary": summary, "Exceptions": exc, "All Items": items[cols]}
    if cross is not None:
        results["Cross-check"] = cross
    return rc.to_excel_bytes(results, gstin=gstin, period=period_label), summary, exc, items


def all_tied(summary):
    """True only if no tie-out row reports a difference."""
    return not summary["Status"].astype(str).str.contains("NOT TIED").any()
