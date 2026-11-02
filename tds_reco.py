"""TDS reconciliation: Tally TDS ledger vs CA TDS working (monthly). Generic, reads any uploaded files."""
import re
import pandas as pd

NON_TDS_KEYWORDS = ["partner remuneration", "profit and loss", "sundry balances written off"]
COMMISSION_KEYWORDS = ["commission"]


def _num(s):
    return pd.to_numeric(s, errors="coerce").fillna(0.0)


def parse_tally(src):
    raw = pd.read_excel(src, sheet_name=0, header=None)
    hdr = raw.index[raw[0].astype(str).str.strip().eq("Date")][0]
    body = raw.iloc[hdr + 1:, :6].copy()
    body.columns = ["Date", "Particulars", "Voucher Type", "Voucher No", "Debit", "Credit"]
    body = body[pd.to_datetime(body["Date"], format="%d-%m-%Y", errors="coerce").notna()].copy()
    body["Date"] = pd.to_datetime(body["Date"], format="%d-%m-%Y")
    body["Debit"] = _num(body["Debit"])
    body["Credit"] = _num(body["Credit"])
    body["Particulars"] = body["Particulars"].astype(str).str.strip()
    body["Voucher No"] = body["Voucher No"].astype(str).str.strip()
    return body.reset_index(drop=True)


def classify(row):
    p = row["Particulars"].lower()
    vt = str(row["Voucher Type"]).lower()
    if any(k in p for k in NON_TDS_KEYWORDS):
        return "NOT TDS - check"
    if vt == "payment":
        return "Payment to govt"
    if vt == "debit note":
        return "TDS - purchase (DN)"
    if any(k in p for k in COMMISSION_KEYWORDS):
        return "TDS - commission (JV)"
    if re.search(r"^[a-z]{3}-\d{4}$", p):
        return "TDS - purchase summary (JV)"
    if vt == "journal" and row["Credit"] > 0:
        return "Check - journal credit"
    return "Check"


def parse_ca(src):
    xl = pd.ExcelFile(src, engine="openpyxl")
    for sh in xl.sheet_names:
        raw = pd.read_excel(xl, sh, header=None)
        for i in range(min(5, len(raw))):
            heads = [str(x).strip() for x in raw.iloc[i].tolist()]
            if "TDS Payable" in heads and "Month" in heads:
                df = raw.iloc[i + 1:].copy()
                df.columns = heads
                df = df[pd.to_datetime(df["Month"], errors="coerce").notna()].copy()
                df["Month"] = pd.to_datetime(df["Month"])
                for c in ["Sum Value", "TDS Payable", "TDS Paid"]:
                    df[c] = _num(df[c])
                return df.reset_index(drop=True), sh
    raise ValueError("CA file me 'TDS Payable' aur 'Month' columns wali sheet nahi mili")


def run_tds(tally_src, ca_src, quarter_start, quarter_end):
    """Reconcile Tally TDS credits vs CA TDS working for the inclusive range [quarter_start, quarter_end]."""
    tally = parse_tally(tally_src)
    tally["Classification"] = tally.apply(classify, axis=1)
    ca, ca_sheet = parse_ca(ca_src)

    qs, qe = pd.Timestamp(quarter_start), pd.Timestamp(quarter_end)
    t_q = tally[(tally["Date"] >= qs) & (tally["Date"] <= qe)].copy()
    # Every credit that is not flagged NOT TDS counts as TDS-type until checked against CA.
    tds_rows = t_q[~t_q["Classification"].isin(["NOT TDS - check", "Payment to govt"])]
    pay_rows = t_q[t_q["Classification"].eq("Payment to govt")]
    months = pd.period_range(qs, qe, freq="M")
    out = []
    for m in months:
        ca_m = ca[ca["Month"].dt.to_period("M").eq(m)]
        t_m = tds_rows[tds_rows["Date"].dt.to_period("M").eq(m)]
        p_m = pay_rows[pay_rows["Date"].dt.to_period("M").eq(m)]
        out.append({"Month": m.strftime("%b-%Y"), "CA TDS payable": round(ca_m["TDS Payable"].sum(), 2),
                    "Tally TDS credited": round(t_m["Credit"].sum(), 2),
                    "Difference": round(t_m["Credit"].sum() - ca_m["TDS Payable"].sum(), 2),
                    "CA TDS paid": round(ca_m["TDS Paid"].sum(), 2),
                    "Tally payments (same month)": round(p_m["Debit"].sum(), 2)})
    monthly = pd.DataFrame(out)
    total = pd.DataFrame([{"Month": "Period total", "CA TDS payable": round(monthly["CA TDS payable"].sum(), 2),
                           "Tally TDS credited": round(monthly["Tally TDS credited"].sum(), 2),
                           "Difference": round(monthly["Difference"].sum(), 2),
                           "CA TDS paid": round(monthly["CA TDS paid"].sum(), 2),
                           "Tally payments (same month)": round(monthly["Tally payments (same month)"].sum(), 2)}])
    monthly = pd.concat([monthly, total], ignore_index=True)

    tally_credit_all = round(t_q["Credit"].sum(), 2)
    non_tds = round(t_q.loc[t_q["Classification"].eq("NOT TDS - check"), "Credit"].sum(), 2)
    tds_type = round(tds_rows["Credit"].sum(), 2)
    mar_unpaid = round(ca.loc[ca["Month"].dt.to_period("M").eq(months[-1]), "TDS Payable"].sum()
                       - ca.loc[ca["Month"].dt.to_period("M").eq(months[-1]), "TDS Paid"].sum(), 2)
    summary = pd.DataFrame([
        {"Item": "Total credits in Tally TDS ledger (period)", "Amount": tally_credit_all, "Remark": ""},
        {"Item": "Less: credits flagged NOT TDS", "Amount": -non_tds, "Remark": "Partner remuneration, P&L, write-off jaise entries. Check karein"},
        {"Item": "TDS-type credits in Tally", "Amount": tds_type, "Remark": ""},
        {"Item": "CA TDS payable (period)", "Amount": round(ca[(ca["Month"] >= qs) & (ca["Month"] <= qe)]["TDS Payable"].sum(), 2), "Remark": f"CA sheet: {ca_sheet}"},
        {"Item": "Last month unpaid as per CA (end of period)", "Amount": mar_unpaid, "Remark": "CA payable minus CA paid"},
    ])
    entries = t_q[["Date", "Particulars", "Voucher Type", "Voucher No", "Debit", "Credit", "Classification"]].copy()
    entries["Date"] = entries["Date"].dt.date
    return {"Summary": summary, "Monthly Reco": monthly, "Tally Entries": entries}
