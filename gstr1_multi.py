"""Multi-month GSTR-1 reconciliation with period filter.
- Many portal JSON files (each has its period in 'fp', e.g. 042026 = Apr-2026).
- Many Books GST-template Excel files (each invoice is placed in a month by its invoice date).
- Period filter: Monthly, Quarterly (Indian FY quarters), Yearly (FY), Custom date range.
- Valid range: 01-04-2020 to 31-03-2027.
"""
import io
import pandas as pd
import gstr1_reco as g1

RANGE_START = pd.Timestamp("2020-04-01")
RANGE_END = pd.Timestamp("2027-03-31")


def fy_label(ts):
    y = ts.year if ts.month >= 4 else ts.year - 1
    return f"{y}-{str(y + 1)[-2:]}"


def quarter_label(ts):
    q = ((ts.month - 4) % 12) // 3 + 1
    return f"Q{q} {fy_label(ts)}"


def _rewind(x):
    if hasattr(x, "getvalue"):
        return io.BytesIO(x.getvalue())
    if hasattr(x, "seek"):
        x.seek(0)
    return x


def load_portal(files):
    """files: list of (name, file-like or bytes). Returns per-file info and combined section frames."""
    secs = {"b2b": [], "cdnr": [], "b2cs": [], "hsn": []}
    info = []
    for name, f in files:
        raw = f if isinstance(f, bytes) else _rewind(f).read()
        parsed = g1.parse_portal(io.BytesIO(raw))
        fp = parsed.get("period_fp")
        if not fp or len(str(fp)) != 6:
            raise ValueError(f"{name}: period (fp) nahi mila, ye GSTR-1 JSON nahi lag rahi")
        month = pd.to_datetime(str(fp), format="%m%Y")
        tax = g1.portal_tax_split(io.BytesIO(raw))
        net = g1.net_taxable(parsed)
        info.append({"File": name, "Return Period": month.strftime("%b-%Y"), "Period Start": month,
                     "Net Taxable (portal)": net, "IGST": tax["igst"], "CGST": tax["cgst"], "SGST": tax["sgst"]})
        for sec in secs:
            df = parsed[sec].copy()
            if len(df):
                df["Return Period"] = month.strftime("%b-%Y")
                df["Return Month"] = month
            secs[sec].append(df)
    combined = {k: (pd.concat(v, ignore_index=True) if v else pd.DataFrame()) for k, v in secs.items()}
    return pd.DataFrame(info), combined


def load_books(files):
    secs = {"b2b": [], "cdnr": [], "b2cs": [], "hsn": []}
    for name, f in files:
        raw = f if isinstance(f, bytes) else _rewind(f).read()
        parsed = g1.parse_books(io.BytesIO(raw))
        for sec in secs:
            df = parsed[sec].copy()
            df["Books File"] = name
            secs[sec].append(df)
    return {k: (pd.concat(v, ignore_index=True) if v else pd.DataFrame()) for k, v in secs.items()}


def _dt(df, col):
    if col in df.columns:
        return pd.to_datetime(df[col], errors="coerce")
    return pd.Series(pd.NaT, index=df.index)


def in_period(dates, start, end):
    dates = pd.to_datetime(dates, errors="coerce")
    return (dates >= start) & (dates <= end)


def run(portal_files, books_files, start, end, tol=1.0):
    """Reconcile all uploaded data, then keep rows whose invoice date (or return period) is in the selected period."""
    start, end = pd.Timestamp(start), pd.Timestamp(end)
    pinfo, P = load_portal(portal_files)
    B = load_books(books_files)

    # Keys include FY so the same invoice number in another year is not matched by mistake.
    for df in (P["b2b"], B["b2b"]):
        if len(df):
            df["FY"] = df["Date"].map(lambda d: fy_label(d) if pd.notna(d) else "")
            df["Invoice No"] = df["Invoice No"] + "@" + df["FY"]
    for df in (P["cdnr"], B["cdnr"]):
        if len(df):
            df["FY"] = df["Date"].map(lambda d: fy_label(d) if pd.notna(d) else "")
            df["Invoice No"] = df["Invoice No"] + "@" + df["FY"]

    pb = P["b2b"].copy()
    bb = B["b2b"].copy()
    b2b = g1.reco_b2b({"b2b": pb, "cdnr": P["cdnr"], "b2cs": P["b2cs"], "hsn": P["hsn"]},
                      {"b2b": bb, "cdnr": B["cdnr"], "b2cs": B["b2cs"], "hsn": B["hsn"]})
    b2b["Invoice"] = b2b["Invoice"].astype(str).str.split("@").str[0]
    cdn = g1.reco_cdnr({"cdnr": P["cdnr"]}, {"cdnr": B["cdnr"]}) if len(P["cdnr"]) or len(B["cdnr"]) else pd.DataFrame()
    if len(cdn):
        # reco_cdnr drops dates, so take them back from the source rows by key (portal first, then Books).
        dmap = {}
        for src in (B["cdnr"], P["cdnr"]):
            if len(src):
                for k, d in zip(g1._key(src, ["GSTIN", "Invoice No"]), pd.to_datetime(src["Date"], errors="coerce")):
                    if k not in dmap or pd.isna(dmap[k]):
                        dmap[k] = d
        cdn["Invoice Date"] = cdn["Key"].map(dmap) if "Key" in cdn.columns else pd.NaT
        cdn["Note"] = cdn["Note"].astype(str).str.split("@").str[0].replace("nan", "")

    # Period filter on the reconciled B2B: date from portal if present, else from Books.
    b2b["Invoice Date"] = _dt(b2b, "Date_P").fillna(_dt(b2b, "Date_B"))
    if len(pb):
        pkey = g1._key(pb, ["GSTIN", "Invoice No"])
        ret_map = pd.Series(pb["Return Period"].values, index=pkey.values).groupby(level=0).first()
        b2b["Return Period"] = b2b["Key"].map(ret_map)
    else:
        b2b["Return Period"] = None
    sel = in_period(b2b["Invoice Date"], start, end)
    b2b_sel = b2b[sel].copy()

    # Period-check: portal filed in a different month than the invoice month.
    b2b_sel["Filed in other month"] = ""
    mask = b2b_sel["Return Period"].notna() & b2b_sel["Invoice Date"].notna()
    same = pd.to_datetime(b2b_sel["Return Period"], format="%b-%Y", errors="coerce").dt.to_period("M") == b2b_sel["Invoice Date"].dt.to_period("M")
    b2b_sel.loc[mask & ~same, "Filed in other month"] = "Yes"

    # B2CS / HSN are summary sections: portal side by return period, Books side as one total per file.
    pinfo_sel = pinfo[(pinfo["Period Start"] >= start.replace(day=1)) & (pinfo["Period Start"] <= end)].copy()
    cdn_sel = cdn
    if len(cdn):
        cdn_sel = cdn[in_period(_dt(cdn, "Invoice Date"), start, end)].copy()

    # Month-wise summary (portal side), from the portal files in the period.
    month_sum = pinfo_sel[["Return Period", "Net Taxable (portal)", "IGST", "CGST", "SGST"]].copy()

    dash = []
    # "Advance Match" = tax matches but invoice value differs (non-taxable part) - must not be dropped.
    for st in ["Matched", "Advance Match", "Mismatch", "Only in Portal", "Only in Books"]:
        m = b2b_sel["Status"].eq(st)
        dash.append({"Section": "B2B", "Status": st, "Count": int(m.sum()),
                     "Taxable (portal)": round(b2b_sel.loc[m, "Taxable_P"].fillna(0).sum(), 2),
                     "Taxable (Books)": round(b2b_sel.loc[m, "Taxable_B"].fillna(0).sum(), 2),
                     "Tax (portal)": round(b2b_sel.loc[m, "Tax_P"].fillna(0).sum(), 2),
                     "Tax (Books)": round(b2b_sel.loc[m, "Tax_B"].fillna(0).sum(), 2)})
    if len(cdn_sel):
        for st in ["Matched", "Advance Match", "Mismatch", "Only in Portal", "Only in Books"]:
            m = cdn_sel["Status"].eq(st)
            dash.append({"Section": "CDNR", "Status": st, "Count": int(m.sum()),
                         "Taxable (portal)": round(cdn_sel.loc[m, "Taxable_P"].fillna(0).sum(), 2),
                         "Taxable (Books)": round(cdn_sel.loc[m, "Taxable_B"].fillna(0).sum(), 2)})
    dash = pd.DataFrame(dash)
    return {"Dashboard": dash, "Month-wise (portal)": month_sum, "Portal files": pinfo_sel,
            "B2B Reco": b2b_sel.drop(columns=["_merge", "Key"], errors="ignore"),
            "CDNR Reco": cdn_sel.drop(columns=["_merge", "Key"], errors="ignore") if len(cdn_sel) else pd.DataFrame()}


def tie_out(portal_files, three_b_rows, start=None, end=None):
    """Compare GSTR-1 and GSTR-3B only for the selected reporting months."""
    pinfo, _ = load_portal(portal_files)

    if start is not None and end is not None:
        start_month = pd.Timestamp(start).to_period("M")
        end_month = pd.Timestamp(end).to_period("M")

        pinfo["Period Start"] = pd.to_datetime(pinfo["Period Start"], errors="coerce")
        portal_months = pinfo["Period Start"].dt.to_period("M")
        pinfo = pinfo[portal_months.between(start_month, end_month)].copy()

        if "Return Period" in three_b_rows.columns:
            entered_months = pd.to_datetime(
                three_b_rows["Return Period"], format="%b-%Y", errors="coerce"
            ).dt.to_period("M")
            three_b_rows = three_b_rows.loc[
                entered_months.between(start_month, end_month)
            ].copy()

    per = pinfo.groupby("Return Period", as_index=False)[
        ["Net Taxable (portal)", "IGST", "CGST", "SGST"]
    ].sum()

    per = per.rename(columns={
        "Net Taxable (portal)": "GSTR1 Taxable",
        "IGST": "GSTR1 IGST",
        "CGST": "GSTR1 CGST",
        "SGST": "GSTR1 SGST"
    })

    t = three_b_rows.rename(columns={
        "Taxable": "3B Taxable",
        "IGST": "3B IGST",
        "CGST": "3B CGST",
        "SGST": "3B SGST"
    })

    out = t.merge(per, on="Return Period", how="outer")

    out["Taxable diff (3B - GSTR1)"] = (
        out["3B Taxable"].fillna(0) - out["GSTR1 Taxable"].fillna(0)
    ).round(2)
    out["IGST diff"] = (
        out["3B IGST"].fillna(0) - out["GSTR1 IGST"].fillna(0)
    ).round(2)
    out["CGST diff"] = (
        out["3B CGST"].fillna(0) - out["GSTR1 CGST"].fillna(0)
    ).round(2)
    out["SGST diff"] = (
        out["3B SGST"].fillna(0) - out["GSTR1 SGST"].fillna(0)
    ).round(2)

    return out
