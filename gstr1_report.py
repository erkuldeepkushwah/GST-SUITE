"""Build the GSTR-1 + GSTR-3B reconciliation workbook (same styling as the 2A report)."""
import io
import pandas as pd
import gstr1_reco as g
import reco_core as rc


def _raw(x):
    """Read an upload once into bytes, so every parser gets its own fresh stream."""
    if isinstance(x, str):
        return open(x, "rb").read()
    if hasattr(x, "getvalue"):
        return x.getvalue()
    if hasattr(x, "read"):
        pos = x.tell()
        data = x.read()
        x.seek(pos)
        return data
    return x


def build(portal_json, books_xlsx, gstr3b_values, out_bytes_only=True, gstin="", period_label="GSTR-1 / GSTR-3B"):
    jraw, xraw = _raw(portal_json), _raw(books_xlsx)
    portal_json = io.BytesIO(jraw)
    books_xlsx = io.BytesIO(xraw)
    r = g.run_gstr1(portal_json, books_xlsx)
    P, B = r["portal"], r["books"]

    def net_taxable(x):
        c = x["cdnr"]
        cr = c[c["Type"].astype(str).str.upper().str.startswith("C")]["Taxable"].sum()
        dr = c[c["Type"].astype(str).str.upper().str.startswith("D")]["Taxable"].sum()
        return x["b2b"]["Taxable"].sum() + x["b2cs"]["Taxable"].sum() - cr + dr

    # Dashboard: section-wise status counts and totals
    rows = []
    for name, df, pcol, bcol in [("B2B", r["b2b"], "Taxable_P", "Taxable_B"),
                                 ("CDNR", r["cdnr"], "Taxable_P", "Taxable_B"),
                                 ("HSN", r["hsn"], "Taxable_P", "Taxable_B")]:
        for st in ["Matched", "Mismatch", "Only in Portal", "Only in Books"]:
            m = df["Status"].eq(st)
            if m.sum() == 0 and st.startswith("Only in") is False:
                pass
            rows.append({"Section": name, "Status": st, "Count": int(m.sum()),
                         "Taxable as per Portal": round(df.loc[m, pcol].fillna(0).sum(), 2),
                         "Taxable as per Books": round(df.loc[m, bcol].fillna(0).sum(), 2)})
    dash = pd.DataFrame(rows)
    dash = dash[dash["Count"].gt(0) | dash["Status"].eq("Matched")]

    # GSTR-3B tie-out (only the lines we can read from the PDF)
    p_net = g.net_taxable(P)
    b_net = g.net_taxable(B)
    tie = pd.DataFrame([
        {"Item": "3.1(a) Outward taxable value", "Per GSTR-3B": gstr3b_values["taxable_3b"],
         "Per GSTR-1 (portal)": round(p_net, 2), "Diff (3B - GSTR-1)": round(gstr3b_values["taxable_3b"] - p_net, 2),
         "Per Books": round(b_net, 2), "Diff (Books - GSTR-1)": round(b_net - p_net, 2)},
        {"Item": "6.1 IGST payable", "Per GSTR-3B": gstr3b_values["igst"], "Per GSTR-1 (portal)": "", "Diff (3B - GSTR-1)": "",
         "Per Books": "", "Diff (Books - GSTR-1)": ""},
        {"Item": "6.1 CGST payable", "Per GSTR-3B": gstr3b_values["cgst"], "Per GSTR-1 (portal)": "", "Diff (3B - GSTR-1)": "",
         "Per Books": "", "Diff (Books - GSTR-1)": ""},
        {"Item": "6.1 SGST payable", "Per GSTR-3B": gstr3b_values["sgst"], "Per GSTR-1 (portal)": "", "Diff (3B - GSTR-1)": "",
         "Per Books": "", "Diff (Books - GSTR-1)": ""},
    ])
    portal_tax = g.portal_tax_split(io.BytesIO(jraw))  # always computed from the portal file, never typed in
    tie.loc[tie["Item"].str.startswith("6.1 IGST"), "Per GSTR-1 (portal)"] = portal_tax["igst"]
    tie.loc[tie["Item"].str.startswith("6.1 CGST"), "Per GSTR-1 (portal)"] = portal_tax["cgst"]
    tie.loc[tie["Item"].str.startswith("6.1 SGST"), "Per GSTR-1 (portal)"] = portal_tax["sgst"]
    for col, tgt in [("Diff (3B - GSTR-1)", "Per GSTR-3B"), ("Diff (Books - GSTR-1)", None)]:
        pass
    for i in tie.index[1:]:
        tie.loc[i, "Diff (3B - GSTR-1)"] = round(float(tie.loc[i, "Per GSTR-3B"]) - float(tie.loc[i, "Per GSTR-1 (portal)"]), 2)

    # Findings are generated from the numbers, so they are right for any month or client.
    fl = []
    bo = r["b2b"][r["b2b"]["Status"].eq("Only in Books")]
    bp = r["b2b"][r["b2b"]["Status"].eq("Only in Portal")]
    mm = r["b2b"][r["b2b"]["Status"].eq("Mismatch")]
    if len(bo):
        fl.append(f"{len(bo)} B2B invoices Books me hain, portal GSTR-1 me nahi (taxable ₹{bo['Taxable_B'].sum():,.2f}). Portal me B2C summary (B2CS) me hone ki possibility check karein; buyer ke GSTR-2B par asar ho sakta hai.")
    if len(bp):
        fl.append(f"{len(bp)} B2B invoices portal GSTR-1 me hain, Books me nahi (taxable ₹{bp['Taxable_P'].sum():,.2f}). Books entry check karein.")
    if len(mm):
        fl.append(f"{len(mm)} B2B invoices me amount/date/rate ka farq hai. B2B Reco sheet dekhein.")
    cd = r["cdnr"]
    if (cd["Status"] != "Matched").any():
        fl.append(f"{int((cd['Status'] != 'Matched').sum())} CDNR notes match nahi hue. CDNR Reco sheet dekhein.")
    hs = r["hsn"]
    if (hs["Status"] != "Matched").any():
        fl.append(f"{int((hs['Status'] != 'Matched').sum())} HSN codes me taxable farq hai. HSN master aur HSN mapping check karein.")
    if not fl:
        fl.append("B2B, CDNR, B2CS aur HSN sab match karte hain.")
    fl.append("GSTR-3B tie-out sheet me 3.1(a) aur 6.1 ke numbers ka check hai.")
    findings = pd.DataFrame({"Point": fl})

    results = {
        "Dashboard": dash,
        "GSTR-3B Tie-out": tie,
        "B2B Reco": r["b2b"].drop(columns=["Key"], errors="ignore"),
        "CDNR Reco": r["cdnr"].drop(columns=["Key"], errors="ignore"),
        "B2CS Reco": r["b2cs"],
        "HSN Reco": r["hsn"],
        "Findings": findings,
    }
    return rc.to_excel_bytes(results, gstin=gstin, period=period_label)
