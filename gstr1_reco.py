"""GSTR-1 reconciliation: GST portal (offline JSON) vs Books (GST-template Excel).
Sections: B2B invoices, CDNR (credit/debit notes), B2CS (summary by POS+rate), HSN summary."""
import json
import re
import pandas as pd

TOL = 1.0  # rupee tolerance for amount comparison

# Fixed schemas: parsers always return these columns, even when a section is empty
# (e.g. a GSTR-1 with no credit/debit notes), so downstream code never hits a KeyError.
B2B_COLS = ["GSTIN", "Invoice No", "Date", "Invoice Value", "POS", "Rate", "Taxable", "Tax"]
CDN_COLS = ["GSTIN", "Invoice No", "Date", "Invoice Value", "POS", "Type", "Rate", "Taxable", "Tax"]
B2CS_COLS = ["POS", "Rate", "Type", "Taxable", "Tax"]
HSN_COLS = ["HSN", "UQC", "Qty", "Rate", "Taxable", "Tax"]


def _k(text):
    return re.sub(r"\s+", "", str(text)).upper()


def _num(s):
    return pd.to_numeric(s, errors="coerce").fillna(0.0)


# ---------------- Portal (GST offline JSON) ----------------
def parse_portal(json_src):
    d = json.load(open(json_src, encoding="utf-8")) if isinstance(json_src, str) else json.load(json_src)
    b2b, cdn, b2cs, hsn = [], [], [], []
    for r in d.get("b2b", []):
        for i in r.get("inv", []):
            rates = sorted({it["itm_det"].get("rt", 0) for it in i.get("itms", [])})
            b2b.append({"GSTIN": r["ctin"].upper(), "Invoice No": str(i["inum"]).strip(),
                        "Date": pd.to_datetime(i.get("idt"), dayfirst=True, errors="coerce"),
                        "Invoice Value": float(i.get("val", 0)), "POS": str(i.get("pos", "")),
                        "Rate": ",".join(str(x) for x in rates),
                        "Taxable": sum(float(it["itm_det"].get("txval", 0)) for it in i.get("itms", [])),
                        "Tax": sum(float(it["itm_det"].get("iamt", 0)) + float(it["itm_det"].get("camt", 0))
                                   + float(it["itm_det"].get("samt", 0)) + float(it["itm_det"].get("csamt", 0))
                                   for it in i.get("itms", []))})
    for r in d.get("cdnr", []):
        for n in r.get("nt", []):
            rates = sorted({it["itm_det"].get("rt", 0) for it in n.get("itms", [])})
            cdn.append({"GSTIN": r["ctin"].upper(), "Invoice No": str(n["nt_num"]).strip(),
                        "Date": pd.to_datetime(n.get("nt_dt"), dayfirst=True, errors="coerce"),
                        "Invoice Value": float(n.get("val", 0)), "POS": str(n.get("pos", "")),
                        "Type": n.get("ntty", ""), "Rate": ",".join(str(x) for x in rates),
                        "Taxable": sum(float(it["itm_det"].get("txval", 0)) for it in n.get("itms", [])),
                        "Tax": sum(float(it["itm_det"].get("iamt", 0)) + float(it["itm_det"].get("camt", 0))
                                   + float(it["itm_det"].get("samt", 0)) + float(it["itm_det"].get("csamt", 0))
                                   for it in n.get("itms", []))})
    for x in d.get("b2cs", []):
        b2cs.append({"POS": str(x.get("pos", "")), "Rate": float(x.get("rt", 0)), "Type": x.get("typ", ""),
                     "Taxable": float(x.get("txval", 0)),
                     "Tax": float(x.get("iamt", 0)) + float(x.get("camt", 0)) + float(x.get("samt", 0))})
    for x in d.get("hsn", {}).get("hsn_b2b", []) + d.get("hsn", {}).get("hsn_b2c", []):
        hsn.append({"HSN": str(x.get("hsn_sc", "")).strip(), "UQC": x.get("uqc", ""), "Qty": float(x.get("qty", 0)),
                    "Rate": float(x.get("rt", 0)), "Taxable": float(x.get("txval", 0)),
                    "Tax": float(x.get("iamt", 0)) + float(x.get("camt", 0)) + float(x.get("samt", 0))})
    return {"b2b": pd.DataFrame(b2b, columns=B2B_COLS), "cdnr": pd.DataFrame(cdn, columns=CDN_COLS),
            "b2cs": pd.DataFrame(b2cs, columns=B2CS_COLS), "hsn": pd.DataFrame(hsn, columns=HSN_COLS),
            "period_fp": d.get("fp"), "gstin": d.get("gstin")}


# ---------------- Books (GST template Excel) ----------------
def parse_books(xlsx_src):
    def sheet(name):
        return pd.read_excel(xlsx_src, sheet_name=name, header=3)

    b = sheet("b2b,sez,de")
    b = b[b["Invoice Number"].notna() & b["GSTIN/UIN of Recipient"].notna()].copy()
    b2b = pd.DataFrame({"GSTIN": b["GSTIN/UIN of Recipient"].astype(str).str.upper().str.strip(),
                        "Invoice No": b["Invoice Number"].astype(str).str.strip(),
                        "Date": pd.to_datetime(b["Invoice date"], dayfirst=True, errors="coerce"),
                        "Invoice Value": _num(b["Invoice Value"]), "POS": b["Place Of Supply"].astype(str),
                        "Rate": b["Rate"].astype(str),
                        "Taxable": _num(b["Taxable Value"]),
                        "Cess": _num(b["Cess Amount"])})

    c = sheet("cdnr")
    c = c[c["Note Number"].notna() & c["GSTIN/UIN of Recipient"].notna()].copy()
    cdnr = pd.DataFrame({"GSTIN": c["GSTIN/UIN of Recipient"].astype(str).str.upper().str.strip(),
                         "Invoice No": c["Note Number"].astype(str).str.strip(),
                         "Date": pd.to_datetime(c["Note Date"], dayfirst=True, errors="coerce"),
                         "Invoice Value": _num(c["Note Value"]), "POS": c["Place Of Supply"].astype(str),
                         "Type": c["Note Type"].astype(str), "Rate": c["Rate"].astype(str),
                         "Taxable": _num(c["Taxable Value"])})

    s = sheet("b2cs")
    s = s[s["Rate"].notna()].copy()
    b2cs = pd.DataFrame({"POS": s["Place Of Supply"].astype(str), "Rate": _num(s["Rate"]),
                         "Type": s["Type"].astype(str), "Taxable": _num(s["Taxable Value"])})

    hs = []
    for name in ["hsn(b2b)", "hsn(b2c)"]:
        h = sheet(name)
        h = h[h["HSN"].notna()].copy()
        hs.append(pd.DataFrame({"HSN": h["HSN"].astype(str).str.strip().str.replace(r"\.0$", "", regex=True),
                                "UQC": h["UQC"].astype(str), "Qty": _num(h["Total Quantity"]),
                                "Rate": _num(h["Rate"]), "Taxable": _num(h["Taxable Value"])}))
    hsn = pd.concat(hs, ignore_index=True)
    return {"b2b": b2b, "cdnr": cdnr, "b2cs": b2cs, "hsn": hsn}


# ---------------- Reconciliation ----------------
def _rate_set(values):
    out = set()
    for v in str(values).replace(";", ",").split(","):
        v = v.strip()
        if v in ("", "nan", "None"):
            continue
        try:
            f = float(v)
            out.add(str(int(f)) if f.is_integer() else str(f))
        except ValueError:
            pass
    return ",".join(sorted(out, key=lambda x: float(x)))


def _rate_str(x):
    f = float(x)
    return str(int(f)) if f.is_integer() else str(f)


def _key(df, key_cols):
    return df[key_cols[0]].map(_k) + "|" + df[key_cols[1]].map(_k)



def reco_b2b(portal, books):
    p = portal["b2b"].copy()
    k = books["b2b"].copy()

    p["Key"] = _key(p, ["GSTIN", "Invoice No"])
    k["Key"] = _key(k, ["GSTIN", "Invoice No"])

    # Normalize rate values
    p["Rate"] = p["Rate"].map(_rate_set)
    k["Rate"] = k["Rate"].map(_rate_set)

    # Portal tax is the total tax reported in GSTR-1
    if "Tax" not in p.columns:
        p["Tax"] = 0

    p["Tax"] = pd.to_numeric(p["Tax"], errors="coerce").fillna(0)

    # Estimate Books tax from taxable value, rate and cess
    if "Cess" not in k.columns:
        k["Cess"] = 0

    k["Taxable"] = pd.to_numeric(k["Taxable"], errors="coerce").fillna(0)
    k["Cess"] = pd.to_numeric(k["Cess"], errors="coerce").fillna(0)

    first_rate = k["Rate"].astype(str).str.split(",").str[0]
    k["Rate_Num"] = pd.to_numeric(first_rate, errors="coerce").fillna(0)

    k["Tax_Calc"] = (
        k["Taxable"] * k["Rate_Num"] / 100 + k["Cess"]
    )

    # Group Portal data invoice-wise
    pg = p.groupby("Key").agg(
        GSTIN=("GSTIN", "first"),
        Invoice=("Invoice No", "first"),
        Date_P=("Date", "first"),
        Value_P=("Invoice Value", "sum"),
        Taxable_P=("Taxable", "sum"),
        Tax_P=("Tax", "sum"),
        Rate_P=("Rate", lambda s: ",".join(
            sorted({x for v in s for x in v.split(",") if x},
                   key=float)
        )),
        POS_P=("POS", "first")
    ).reset_index()

    # Group Books data invoice-wise
    kg = k.groupby("Key").agg(
        Invoice_B=("Invoice No", "first"),
        Date_B=("Date", "first"),
        Value_B=("Invoice Value", "max"),
        Taxable_B=("Taxable", "sum"),
        Tax_B=("Tax_Calc", "sum"),
        Rate_B=("Rate", lambda s: ",".join(
            sorted({x for v in s for x in v.split(",") if x},
                   key=float)
        )),
        POS_B=("POS", "first")
    ).reset_index()

    m = pg.merge(kg, on="Key", how="outer", indicator=True)

    status, reason, note = [], [], []

    for _, r in m.iterrows():

        if r["_merge"] == "left_only":
            status.append("Only in Portal")
            reason.append("NOT_IN_BOOKS")
            note.append("Portal me file hai, Books me nahi. Books entry check karein")
            continue

        if r["_merge"] == "right_only":
            status.append("Only in Books")
            reason.append("NOT_IN_PORTAL")
            note.append("Books me hai, portal GSTR-1 me nahi. Filing ya entry check karein")
            continue

        taxable_diff = abs(r["Taxable_P"] - r["Taxable_B"])
        value_diff = abs(r["Value_P"] - r["Value_B"])
        tax_diff = abs(r["Tax_P"] - r["Tax_B"])

        date_same = (
            pd.notna(r["Date_P"])
            and pd.notna(r["Date_B"])
            and str(r["Date_P"]) == str(r["Date_B"])
        )

        rate_same = str(r["Rate_P"]) == str(r["Rate_B"])

        # POS: compare state code (first 2 digits) when available, else full text
        pos_p = str(r["POS_P"]).strip().upper()
        pos_b = str(r["POS_B"]).strip().upper()
        code_p = re.match(r"^\s*(\d{2})", pos_p)
        code_b = re.match(r"^\s*(\d{2})", pos_b)
        if code_p and code_b:
            pos_same = code_p.group(1) == code_b.group(1)
        else:
            pos_same = pos_p == pos_b

        codes = []

        if taxable_diff > TOL:
            codes.append("TAXABLE_DIFF")

        if value_diff > TOL:
            codes.append("VALUE_DIFF")

        if not date_same:
            codes.append("DATE_DIFF")

        if not rate_same:
            codes.append("RATE_DIFF")

        if tax_diff > TOL:
            codes.append("TAX_DIFF")

        if not pos_same:
            codes.append("POS_DIFF")

        # Advance Match:
        # Tax-related details match, but invoice value differs
        advance_match = (
            value_diff > TOL
            and taxable_diff <= TOL
            and tax_diff <= TOL
            and date_same
            and rate_same
            and pos_same
        )

        if advance_match:
            status.append("Advance Match")
            reason.append("VALUE_DIFF_NON_TAXABLE")
            note.append(
                "Tax details match. Invoice value difference ko "
                "non-GST/exempt/other value ke liye verify karein"
            )

        elif not codes:
            status.append("Matched")
            reason.append("")
            note.append("")

        else:
            status.append("Mismatch")
            reason.append(", ".join(codes))
            note.append("Taxable, tax, invoice value, date, rate aur POS check karein")

    out = m.copy()

    out["Invoice"] = out["Invoice"].fillna(out["Invoice_B"])
    out["Status"] = status
    out["Reason Code"] = reason
    out["Action"] = note

    out["Taxable Diff (Books-Portal)"] = (
        out["Taxable_B"].fillna(0) - out["Taxable_P"].fillna(0)
    ).round(2)

    out["Tax Diff (Books-Portal)"] = (
        out["Tax_B"].fillna(0) - out["Tax_P"].fillna(0)
    ).round(2)

    out["Invoice Value Diff (Books-Portal)"] = (
        out["Value_B"].fillna(0) - out["Value_P"].fillna(0)
    ).round(2)

    return out.drop(columns=["_merge"])


def reco_cdnr(portal, books):
    p = portal["cdnr"].copy(); k = books["cdnr"].copy()
    p["Key"] = _key(p, ["GSTIN", "Invoice No"]); k["Key"] = _key(k, ["GSTIN", "Invoice No"])
    m = p.groupby("Key").agg(GSTIN=("GSTIN", "first"), Note=("Invoice No", "first"), Type_P=("Type", "first"),
                             Taxable_P=("Taxable", "sum"), Value_P=("Invoice Value", "sum")).reset_index().merge(
        k.groupby("Key").agg(Type_B=("Type", "first"), Taxable_B=("Taxable", "sum"), Value_B=("Invoice Value", "sum")).reset_index(),
        on="Key", how="outer", indicator=True)
    status, reason = [], []
    for _, r in m.iterrows():
        if r["_merge"] == "left_only": status.append("Only in Portal"); reason.append("NOT_IN_BOOKS")
        elif r["_merge"] == "right_only": status.append("Only in Books"); reason.append("NOT_IN_PORTAL")
        else:
            codes = []
            if abs(r["Taxable_P"] - r["Taxable_B"]) > TOL: codes.append("TAXABLE_DIFF")
            if abs(r["Value_P"] - r["Value_B"]) > TOL: codes.append("VALUE_DIFF")
            status.append("Matched" if not codes else "Mismatch"); reason.append(", ".join(codes))
    m["Status"], m["Reason Code"] = status, reason
    return m.drop(columns=["_merge"])


def reco_b2cs(portal, books):
    p = portal["b2cs"].copy(); k = books["b2cs"].copy()
    p["Key"] = p["POS"].astype(str).str[:2] + "|" + p["Rate"].map(_rate_str)
    k["Key"] = k["POS"].astype(str).str[:2] + "|" + k["Rate"].map(_rate_str)
    pg = p.groupby("Key").agg(Taxable_P=("Taxable", "sum")).reset_index()
    kg = k.groupby("Key").agg(Taxable_B=("Taxable", "sum")).reset_index()
    m = pg.merge(kg, on="Key", how="outer").fillna(0.0)
    m["Diff (Books-Portal)"] = (m["Taxable_B"] - m["Taxable_P"]).round(2)
    m["Status"] = m["Diff (Books-Portal)"].abs().le(TOL).map({True: "Matched", False: "Mismatch"})
    return m


def reco_hsn(portal, books):
    p = portal["hsn"].copy(); k = books["hsn"].copy()
    pg = p.groupby("HSN").agg(Qty_P=("Qty", "sum"), Taxable_P=("Taxable", "sum")).reset_index()
    kg = k.groupby("HSN").agg(Qty_B=("Qty", "sum"), Taxable_B=("Taxable", "sum")).reset_index()
    m = pg.merge(kg, on="HSN", how="outer").fillna(0.0)
    m["Taxable Diff (Books-Portal)"] = (m["Taxable_B"] - m["Taxable_P"]).round(2)
    m["Status"] = m["Taxable Diff (Books-Portal)"].abs().le(TOL).map({True: "Matched", False: "Mismatch"})
    return m


def run_gstr1(portal_json, books_xlsx):
    portal = parse_portal(portal_json)
    books = parse_books(books_xlsx)
    return {"portal": portal, "books": books, "b2b": reco_b2b(portal, books),
            "cdnr": reco_cdnr(portal, books), "b2cs": reco_b2cs(portal, books), "hsn": reco_hsn(portal, books)}


def portal_tax_split(json_src):
    """Net outward tax per head from the portal JSON: B2B + B2CS + CDNR (credit notes negative)."""
    d = json.load(open(json_src, encoding="utf-8")) if isinstance(json_src, str) else json.load(json_src)
    out = {"igst": 0.0, "cgst": 0.0, "sgst": 0.0}
    for r in d.get("b2b", []):
        for i in r.get("inv", []):
            for it in i.get("itms", []):
                t = it.get("itm_det", {})
                out["igst"] += float(t.get("iamt", 0)); out["cgst"] += float(t.get("camt", 0)); out["sgst"] += float(t.get("samt", 0))
    for r in d.get("cdnr", []):
        for n in r.get("nt", []):
            sign = -1 if str(n.get("ntty", "")).upper().startswith("C") else 1
            for it in n.get("itms", []):
                t = it.get("itm_det", {})
                out["igst"] += sign * float(t.get("iamt", 0)); out["cgst"] += sign * float(t.get("camt", 0))
                out["sgst"] += sign * float(t.get("samt", 0))
    for x in d.get("b2cs", []):
        out["igst"] += float(x.get("iamt", 0)); out["cgst"] += float(x.get("camt", 0)); out["sgst"] += float(x.get("samt", 0))
    return {k: round(v, 2) for k, v in out.items()}


def net_taxable(parsed):
    """Net outward taxable: B2B + B2CS - credit notes + debit notes."""
    c = parsed["cdnr"]
    t = c["Type"].astype(str).str.upper() if len(c) else pd.Series(dtype=str)
    cr = c.loc[t.str.startswith("C"), "Taxable"].sum() if len(c) else 0.0
    dr = c.loc[t.str.startswith("D"), "Taxable"].sum() if len(c) else 0.0
    b2b_total = parsed["b2b"]["Taxable"].sum() if len(parsed["b2b"]) else 0.0
    b2cs_total = parsed["b2cs"]["Taxable"].sum() if len(parsed["b2cs"]) else 0.0
    return round(b2b_total + b2cs_total - cr + dr, 2)
