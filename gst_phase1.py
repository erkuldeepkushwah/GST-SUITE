"""
Phase 1: auto-detect GST portal (GSTR-2A / 2B) and Books sheets, convert them to one
standard layout, and run B2B reconciliation with short reason codes.
"""
import re
import pandas as pd

TAX_COLS = ["IGST", "CGST", "SGST", "Cess"]
# Columns every standardized frame has; empty sections use this so downstream code never hits a KeyError.
STD_COLUMNS = ["Source", "Sheet", "Type", "GSTIN", "Party", "Invoice No", "Original Invoice No", "Invoice Date",
               "Doc Type", "Doc Source", "Taxable", "IGST", "CGST", "SGST", "Cess", "Total Tax",
               "ITC Eligibility", "ITC Class", "Reason", "Period"]
ITC_CLASS = {"Inputs": "Goods", "Input services": "Services", "Capital goods": "Capital goods", "Ineligible": "Ineligible"}


def _n(text):
    return re.sub(r"[^a-z0-9]+", " ", str(text).lower()).strip()


def detect_sheet(columns):
    """Return (source, sheet_type) from header names only, so sheet names do not matter."""
    n = {_n(c) for c in columns}
    if "original invoice no" in n and "invoice no revised" in n:
        return "GSTR-2A", "B2BA"
    if "orig note no" in n:
        return "GSTR-2A", "CDNRA"
    if "note no" in n and "supplier gstin" in n:
        return "GSTR-2A", "CDNR"
    if "supplier gstin" in n and "invoice no" in n:
        return "GSTR-2A", "B2B"
    if "gstin of supplier" in n and "note refund voucher number" in n:
        return "BOOKS-PURCHASE", "CDNR"
    if "gstin of supplier" in n and "invoice number" in n:
        return "BOOKS-PURCHASE", "B2B"
    if "invoice number" in n and "supply type" in n:
        return "BOOKS-PURCHASE", "B2BUR"
    return None, None  # Suppliers, Notes, ISD, etc.


def _col(df, *candidates):
    lookup = {_n(c): c for c in df.columns}
    for cand in candidates:
        if _n(cand) in lookup:
            return lookup[_n(cand)]
    return None


def _num(series):
    return pd.to_numeric(series.astype(str).str.replace(",", "", regex=False).str.replace("₹", "", regex=False), errors="coerce").fillna(0.0)


def standardize(df, source, sheet_type, sheet_name, gstin):
    """Map one raw sheet into the standard layout. Rows without an invoice/note number are dropped."""
    if source == "GSTR-2A" and sheet_type == "B2BA":
        inv = _col(df, "Invoice no. (revised)")
        orig = _col(df, "Original invoice no.")
        party = _col(df, "Supplier name")
        gst = _col(df, "Supplier GSTIN")
        dt = _col(df, "Invoice date (revised)")
        doc_raw = _col(df, "Invoice type (revised)")
        period = _col(df, "Return period")
    elif source == "GSTR-2A" and sheet_type == "CDNRA":
        inv = _col(df, "Note no. (revised)")
        orig = _col(df, "Orig. note no.")
        party = _col(df, "Supplier name")
        gst = _col(df, "Supplier GSTIN")
        dt = _col(df, "Note date (revised)")
        doc_raw = _col(df, "Note type (revised)")
        period = _col(df, "Return period")
    elif source == "GSTR-2A" and sheet_type == "CDNR":
        inv = _col(df, "Note no.")
        orig = None
        party = _col(df, "Supplier name")
        gst = _col(df, "Supplier GSTIN")
        dt = _col(df, "Note date")
        doc_raw = _col(df, "Note type")
        period = _col(df, "Return period")
    elif source == "GSTR-2A":  # B2B
        inv = _col(df, "Invoice no.")
        orig = None
        party = _col(df, "Party name")
        gst = _col(df, "Supplier GSTIN")
        dt = _col(df, "Invoice date")
        doc_raw = _col(df, "Invoice type")
        period = _col(df, "Return period")
    elif sheet_type == "CDNR":  # Books credit/debit notes
        inv = _col(df, "Note/Refund Voucher Number")
        orig = _col(df, "Invoice/Advance Payment Voucher Number")
        party = None
        gst = _col(df, "GSTIN of Supplier")
        dt = _col(df, "Note/Refund Voucher date")
        doc_raw = _col(df, "Document Type")
        period = None
    else:  # Books B2B / B2BUR
        inv = _col(df, "Invoice Number")
        orig = None
        party = _col(df, "Supplier Name")
        gst = _col(df, "GSTIN of Supplier")
        dt = _col(df, "Invoice date")
        doc_raw = None
        period = None

    out = pd.DataFrame(index=df.index)
    out["Source"] = source
    out["Sheet"] = sheet_name
    out["Type"] = sheet_type
    out["GSTIN"] = df[gst].fillna("").astype(str).str.strip().str.upper() if gst else ""
    out["Party"] = df[party].fillna("").astype(str).str.strip() if party else ""
    out["Invoice No"] = df[inv].fillna("").astype(str).str.strip() if inv else ""
    out["Original Invoice No"] = df[orig].fillna("").astype(str).str.strip() if orig else ""
    out["Invoice Date"] = pd.to_datetime(df[dt], errors="coerce", dayfirst=True) if dt else pd.NaT

    # Document class: CN / DN from note-type text, otherwise invoice.
    doc_text = df[doc_raw].fillna("").astype(str).str.lower() if doc_raw else pd.Series("", index=df.index)
    out["Doc Type"] = "INV"
    out.loc[doc_text.str.contains("credit"), "Doc Type"] = "CN"
    out.loc[doc_text.str.contains("debit"), "Doc Type"] = "DN"
    if source == "BOOKS-PURCHASE" and sheet_type == "CDNR":
        # Source 'Document Type' is 'D' for every row, so it is not usable. Fallback: voucher prefix.
        # The portal note type (if the note exists in GSTR-2A) overrides this later in apply_portal_note_types().
        prefix = out["Invoice No"].str.extract(r"^([A-Za-z]+)")[0].fillna("")
        out["Doc Type"] = "REVIEW"
        out.loc[prefix.str.upper().isin(["CN", "C", "CIDL", "HT"]), "Doc Type"] = "CN"
        out.loc[prefix.str.upper().eq("DN"), "Doc Type"] = "DN"
        out["Doc Source"] = "Voucher prefix (verify)"
    if "Doc Source" not in out.columns:
        out["Doc Source"] = "Portal note type" if source == "GSTR-2A" else "Invoice (books)"

    if source == "GSTR-2A":
        taxable_col, igst_col, cgst_col, sgst_col, cess_col = (
            "Taxable value (₹)", "IGST (₹)", "CGST (₹)", "SGST/UTGST (₹)", "Cess (₹)")
        if sheet_type == "CDNR":
            taxable_col = "Taxable value (₹)"
        if sheet_type == "B2BA":
            taxable_col = "Taxable value (₹)"
        out["Taxable"] = _num(df[taxable_col])
        out["IGST"] = _num(df[igst_col])
        out["CGST"] = _num(df[cgst_col])
        out["SGST"] = _num(df[sgst_col])
        out["Cess"] = _num(df[cess_col])
        out["ITC Eligibility"] = "Eligible (portal)"
        out["Reason"] = ""
        out["Period"] = df[period].fillna("").astype(str) if period else ""
    else:
        if sheet_type == "CDNR":
            tax_name, igst_name, cgst_name, sgst_name, cess_name = (
                "Note/Refund Voucher Value", "Integrated Tax Paid", "Central Tax Paid", "State/UT Tax Paid", "Cess Paid")
            out["Taxable"] = _num(df["Taxable Value"])
            out["Reason"] = df["Reason For Issuing document"].fillna("").astype(str)
        else:
            igst_name, cgst_name, sgst_name, cess_name = (
                "Integrated Tax Paid", "Central Tax Paid", "State/UT Tax Paid", "Cess Paid")
            out["Taxable"] = _num(df["Taxable Value"])
            out["Reason"] = ""
        out["IGST"] = _num(df[igst_name])
        out["CGST"] = _num(df[cgst_name])
        out["SGST"] = _num(df[sgst_name])
        out["Cess"] = _num(df[cess_name])
        out["ITC Eligibility"] = df["Eligibility For ITC"].fillna("").astype(str) if "Eligibility For ITC" in df.columns else ""
        out["Period"] = ""

    out["Total Tax"] = out[TAX_COLS].sum(axis=1)
    out["ITC Class"] = out["ITC Eligibility"].map(ITC_CLASS).fillna("") if source == "BOOKS-PURCHASE" else ""

    # Drop section headers such as 'Original details' / 'Revised details' and empty rows.
    out = out[out["Invoice No"].ne("") & out["Invoice No"].str.lower().ne("nan")]
    return out.reset_index(drop=True)


def invoice_key(gstin, invoice_no, doc_type, match_doc_type=True):
    inv = re.sub(r"\s+", "", str(invoice_no)).upper()
    if match_doc_type:
        return f"{gstin}|{doc_type}|{inv}"
    return f"{gstin}|{inv}"


def suggest_pairs(result, tolerance=1.0):
    """For Only-in rows, suggest a counterpart on the other side: same GSTIN and same taxable value, different number."""
    result = result.copy()
    result["Possible Pair"] = ""
    only_2a = result.index[result["Status"].eq("Only in 2A")]
    only_bk = result.index[result["Status"].eq("Only in Books")]
    used = set()
    for i in only_2a:
        g, t = result.at[i, "GSTIN"], result.at[i, "Taxable_2A"]
        for j in only_bk:
            if j in used:
                continue
            if result.at[j, "GSTIN"] == g and abs(result.at[j, "Taxable_BK"] - t) <= tolerance:
                result.at[i, "Possible Pair"] = f"Books: {result.at[j, 'Invoice_BK']}"
                result.at[j, "Possible Pair"] = f"2A: {result.at[i, 'Invoice_2A']}"
                used.add(j)
                result.at[i, "Action"] = "Possible pair mila, number alag hai. Books aur 2A ka number verify karein"
                result.at[j, "Action"] = "Possible pair mila, number alag hai. Books aur 2A ka number verify karein"
                break
    return result


def apply_manual_types(books_notes, path):
    """Apply user-confirmed note types (GSTIN, Note No, Type) from a CSV. Highest priority."""
    import os
    if not os.path.exists(path):
        return books_notes
    ov = pd.read_csv(path, dtype=str)
    lookup = {(g.upper(), re.sub(r"\s+", "", n).upper()): t for g, n, t in zip(ov["GSTIN"], ov["Note No"], ov["Type"])}
    books_notes = books_notes.copy()
    for i, r in books_notes.iterrows():
        k = (r["GSTIN"], re.sub(r"\s+", "", r["Invoice No"]).upper())
        if k in lookup:
            books_notes.at[i, "Doc Type"] = lookup[k]
            books_notes.at[i, "Doc Source"] = "User confirmed"
    return books_notes


def apply_portal_note_types(books_notes, portal_notes):
    """For Books notes found in GSTR-2A CDNR, the portal note type is authoritative."""
    lookup = {}
    for _, r in portal_notes.iterrows():
        lookup[(r["GSTIN"], re.sub(r"\s+", "", r["Invoice No"]).upper())] = r["Doc Type"]
    books_notes = books_notes.copy()
    for i, r in books_notes.iterrows():
        k = (r["GSTIN"], re.sub(r"\s+", "", r["Invoice No"]).upper())
        if k in lookup:
            books_notes.at[i, "Doc Type"] = lookup[k]
            books_notes.at[i, "Doc Source"] = "Portal note type (matched)"
    return books_notes


def reconcile(portal, books, tolerance=1.0, match_doc_type=True):
    """Match on GSTIN + invoice/note number (+ doc type for invoices). Books lines are summed per key first."""
    for df in (portal, books):
        df["Key"] = [invoice_key(g, i, d, match_doc_type) for g, i, d in zip(df["GSTIN"], df["Invoice No"], df["Doc Type"])]

    value_cols = ["Taxable", "IGST", "CGST", "SGST", "Cess", "Total Tax"]
    p = portal.groupby("Key").agg(
        GSTIN=("GSTIN", "first"), Party_2A=("Party", "first"), Invoice_2A=("Invoice No", "first"),
        Date_2A=("Invoice Date", "first"), Doc_2A=("Doc Type", "first"), Orig_2A=("Original Invoice No", "first"),
        **{f"{c}_2A": (c, "sum") for c in value_cols}).reset_index()
    b = books.groupby("Key").agg(
        GSTIN_b=("GSTIN", "first"), Party_BK=("Party", "first"), Invoice_BK=("Invoice No", "first"),
        Date_BK=("Invoice Date", "first"), Doc_BK=("Doc Type", "first"), Orig_BK=("Original Invoice No", "first"),
        DocSrc_BK=("Doc Source", "first"),
        **{f"{c}_BK": (c, "sum") for c in value_cols},
        ITC_Class=("ITC Class", lambda s: ", ".join(sorted(set(x for x in s if x))))).reset_index()

    m = p.merge(b, on="Key", how="outer", indicator=True)
    m["GSTIN"] = m["GSTIN"].fillna(m["GSTIN_b"])
    m["Invoice No"] = m["Invoice_2A"].fillna(m["Invoice_BK"])
    m["Party"] = m["Party_2A"].fillna("").where(lambda s: s.ne(""), m["Party_BK"].fillna(""))

    statuses, reasons, actions, names = [], [], [], []
    for _, r in m.iterrows():
        if r["_merge"] == "left_only":
            names.append("")
            statuses.append("Only in 2A")
            reasons.append("NOT_IN_BOOKS")
            actions.append("Supplier ne invoice book me nahi dikhaya. Books me entry check karein; ITC claim se pehle verify karein")
            continue
        if r["_merge"] == "right_only":
            names.append("")
            statuses.append("Only in Books")
            reasons.append("NOT_IN_2A")
            actions.append("Books me hai par 2A me nahi. Supplier se GSTR-1 filing confirm karein (ya timing ho sakti hai)")
            continue
        codes = []
        for c in value_cols:
            diff = round(r[f"{c}_BK"] - r[f"{c}_2A"], 2)
            if abs(diff) > tolerance:
                codes.append(f"{c.upper()}_DIFF")
        if pd.notna(r["Date_2A"]) and pd.notna(r["Date_BK"]) and r["Date_2A"] != r["Date_BK"]:
            codes.append("DATE_DIFF")
        if not match_doc_type and r["Doc_2A"] != r["Doc_BK"]:
            codes.append("DOC_TYPE_DIFF")
        # Name differences are informational (spelling/abbreviation), so they do not change status.
        name_note = ""
        if r["Party_2A"] and r["Party_BK"] and str(r["Party_2A"]).casefold() != str(r["Party_BK"]).casefold():
            name_note = "Name differs (check master)"
        names.append(name_note)
        if not codes:
            statuses.append("Matched")
            reasons.append("")
            actions.append("")
        else:
            statuses.append("Mismatch")
            reasons.append(", ".join(codes))
            actions.append("Amount/date ka farq verify karein; Books entry ya supplier invoice sudharein")
    m["Status"] = statuses
    m["Name Check"] = names
    m["Reason Code"] = reasons
    m["Action"] = actions
    for c in value_cols:
        m[f"{c} Diff (Books-2A)"] = (m[f"{c}_BK"].fillna(0) - m[f"{c}_2A"].fillna(0)).round(2)
    return m


if __name__ == "__main__":
    import sys
    portal_file, books_file, gstin = sys.argv[1], sys.argv[2], sys.argv[3]
    portal_frames, books_frames = [], []
    for f, want in ((portal_file, "GSTR-2A"), (books_file, "BOOKS-PURCHASE")):
        xl = pd.ExcelFile(f, engine="openpyxl")
        for sh in xl.sheet_names:
            raw = pd.read_excel(xl, sh)
            src, typ = detect_sheet(raw.columns)
            if src != want:
                print(f"skip sheet '{sh}' ({f}): not a {want} invoice sheet")
                continue
            print(f"detected '{sh}' -> {src} {typ}, rows {len(raw)}")
            std = standardize(raw, src, typ, sh, gstin)
            (portal_frames if src == "GSTR-2A" else books_frames).append(std)
    portal = pd.concat(portal_frames, ignore_index=True)
    books = pd.concat(books_frames, ignore_index=True)
    print(f"\nPortal invoice rows: {len(portal)} | Books rows: {len(books)}")
    # Phase 1 scope: B2B vs Books B2B only. CDN, B2BA and B2BUR follow in later steps.
    p_b2b = portal[portal["Type"].eq("B2B")]
    k_b2b = books[books["Type"].eq("B2B")]
    result = reconcile(p_b2b.copy(), k_b2b.copy(), tolerance=1.0)
    p_cdn = portal[portal["Type"].eq("CDNR")].copy()
    k_cdn = books[books["Type"].eq("CDNR")].copy()
    k_cdn = apply_portal_note_types(k_cdn, p_cdn)
    k_cdn = apply_manual_types(k_cdn, "manual_note_types.csv")
    cdn_result = suggest_pairs(reconcile(p_cdn, k_cdn, tolerance=1.0, match_doc_type=False))
    print("Possible pairs found:", (cdn_result["Possible Pair"] != "").sum() // 2)
    print("\nCDN reconciliation status counts:")
    print(cdn_result["Status"].value_counts().to_string())
    print("Books note doc-type source:", k_cdn["Doc Source"].value_counts().to_dict())
    print("Books note doc types:", k_cdn["Doc Type"].value_counts().to_dict())
    print("\nB2B reconciliation status counts:")
    print(result["Status"].value_counts().to_string())
    print("\nReason codes (Mismatch rows):")
    print(result.loc[result["Status"].eq("Mismatch"), "Reason Code"].value_counts().to_string())
    out_file = "/mnt/user-data/outputs/Phase1_B2B_Reco.xlsx"
    with pd.ExcelWriter(out_file, engine="openpyxl") as w:
        result.drop(columns=["_merge"]).to_excel(w, sheet_name="B2B Reco", index=False)
        cdn_result.drop(columns=["_merge"]).to_excel(w, sheet_name="CDN Reco", index=False)
    print("saved", out_file)
