"""GSTR-9 style ITC summary from Books purchase register: goods, services, capital goods, blocked.
Category labels are internal. Map them to the GSTR-9 table numbers from the current form with your CA."""
import pandas as pd
import gst_phase1 as g

PAID = ["Integrated Tax Paid", "Central Tax Paid", "State/UT Tax Paid", "Cess Paid"]
AVAIL = ["Availed ITC Integrated Tax", "Availed ITC Central Tax", "Availed ITC State/UT Tax", "Availed ITC Cess"]
CATS = [("Inputs", "Goods (inputs)"), ("Input services", "Services"), ("Capital goods", "Capital goods"), ("Ineligible", "Blocked / ineligible")]
ASSUMPTION = ("Assumption: CDN ITC reduces availed ITC (CN from supplier, and DN issued by the company are both reversals). "
              "Confirm with CA, because a supplier-issued DN would increase ITC.")


def _num(df, cols):
    """Numeric columns; a column missing from the Books export counts as 0 instead of crashing."""
    for c in cols:
        if c not in df.columns:
            df[c] = 0.0
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0.0)
    if "Eligibility For ITC" not in df.columns:
        df["Eligibility For ITC"] = ""
    return df


def itc_summary(books_src, portal_b2b_total_tax=None, gstin=None):
    xl = pd.ExcelFile(books_src, engine="openpyxl")
    b2b = cdnr = None
    for sh in xl.sheet_names:
        raw = pd.read_excel(xl, sh)
        src, typ = g.detect_sheet(raw.columns)
        if src == "BOOKS-PURCHASE" and typ == "B2B":
            b2b = _num(raw.copy(), PAID + AVAIL)
        if src == "BOOKS-PURCHASE" and typ == "CDNR":
            cdnr = _num(raw.copy(), PAID + AVAIL)
    rows = []
    if b2b is None:
        b2b = pd.DataFrame(columns=PAID + AVAIL + ["Eligibility For ITC"])
    for key, label in CATS:
        sub = b2b[b2b["Eligibility For ITC"].eq(key)] if b2b is not None else pd.DataFrame()
        rows.append({"Category": label, "Books tax paid": round(sub[PAID].sum().sum(), 2),
                     "ITC availed (gross)": round(sub[AVAIL].sum().sum(), 2),
                     "Lines": len(sub), "Note": ""})
    # Blocked: tax paid on ineligible lines is what must NOT be claimed. Show it separately.
    blocked_paid = round(b2b.loc[b2b["Eligibility For ITC"].eq("Ineligible"), PAID].sum().sum(), 2) if b2b is not None else 0.0
    rows[-1]["Note"] = f"Tax paid on ineligible lines: {blocked_paid:,.2f} (should be 0 or reversed)"

    cdn_rows = []
    if cdnr is not None:
        for key, label in CATS[:2]:
            sub = cdnr[cdnr["Eligibility For ITC"].eq(key)]
            cdn_rows.append({"Category": f"Notes: {label}", "Books tax paid": round(sub[PAID].sum().sum(), 2),
                             "ITC availed (gross)": round(sub[AVAIL].sum().sum(), 2), "Lines": len(sub),
                             "Note": "Reduction (see assumption)"})
    df = pd.DataFrame(rows + cdn_rows)
    # Blocked (ineligible) ITC must not be part of the claimable total, so it is excluded here.
    gross = round(sum(r["ITC availed (gross)"] for r in rows if r["Category"] != CATS[-1][1]), 2)
    notes = round(sum(r["ITC availed (gross)"] for r in cdn_rows), 2)
    net = round(gross - notes, 2)
    totals = pd.DataFrame([
        {"Category": "Gross eligible ITC (invoices, excl. blocked)", "Books tax paid": "", "ITC availed (gross)": gross, "Lines": "", "Note": ""},
        {"Category": "Less: note ITC (CN / DN)", "Books tax paid": "", "ITC availed (gross)": -notes, "Lines": "", "Note": ASSUMPTION},
        {"Category": "Net ITC as per Books (YTD)", "Books tax paid": "", "ITC availed (gross)": net, "Lines": "", "Note": ""},
    ])
    if portal_b2b_total_tax is not None:
        totals = pd.concat([totals, pd.DataFrame([{"Category": "ITC eligible as per GSTR-2A B2B (reference)", "Books tax paid": "",
                            "ITC availed (gross)": round(portal_b2b_total_tax, 2), "Lines": "", "Note": "Compare with Books gross ITC above"}])], ignore_index=True)
    return pd.concat([df, totals], ignore_index=True)


if __name__ == "__main__":
    import sys
    t = sys.argv[1]
    out = itc_summary(t)
    print(out.to_string(index=False))
