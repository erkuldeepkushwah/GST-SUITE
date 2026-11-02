"""Bank reconciliation: HDFC bank statement (.xls) vs Tally bank ledger."""
import re
import pandas as pd

AMT_TOL = 0.5
DATE_WINDOW_DAYS = 5


def _num(s):
    return pd.to_numeric(s, errors="coerce").fillna(0.0)


def parse_statement(src):
    raw = pd.read_excel(src, header=None)
    hdr = raw.index[raw[0].astype(str).str.strip().eq("Date")][0]
    body = raw.iloc[hdr + 2:].copy()
    body.columns = ["Date", "Narration", "Ref", "Value Date", "Withdrawal", "Deposit", "Closing"]
    body = body[pd.to_datetime(body["Date"], format="%d/%m/%y", errors="coerce").notna()].copy()
    body["Date"] = pd.to_datetime(body["Date"], format="%d/%m/%y")
    body["Withdrawal"] = _num(body["Withdrawal"])
    body["Deposit"] = _num(body["Deposit"])
    body["Closing"] = _num(body["Closing"])
    body["Ref"] = body["Ref"].astype(str).str.strip()
    body["Narration"] = body["Narration"].astype(str).str.strip()
    body["Amount"] = body["Deposit"] - body["Withdrawal"]
    body = body.reset_index(drop=True)
    opening = body.iloc[0]["Closing"] - body.iloc[0]["Amount"]
    return body, round(opening, 2)


def parse_ledger(src):
    raw = pd.read_excel(src, header=None)
    hdr = raw.index[raw[1].astype(str).str.strip().eq("Particulars")][0]
    body = raw.iloc[hdr + 1:].copy()
    body.columns = ["LDate", "Particulars", "VType", "UTR", "VNo", "Debit", "Credit", "ClosingLedger", "Narration", "BankDate"]
    closing_as_per_bank = None
    for _, r in raw.iterrows():
        if str(r.get(1, "")).strip().lower().startswith("closing balance as per"):
            closing_as_per_bank = _num(pd.Series([r.get(5)])).iloc[0]
    tx = body[pd.to_datetime(body["LDate"], format="%d-%m-%Y", errors="coerce").notna()].copy()
    tx["LDate"] = pd.to_datetime(tx["LDate"], format="%d-%m-%Y")
    tx["Debit"] = _num(tx["Debit"])
    tx["Credit"] = _num(tx["Credit"])
    tx["UTR"] = tx["UTR"].astype(str).str.strip().str.replace(r"\.0$", "", regex=True)
    tx["VNo"] = tx["VNo"].astype(str).str.strip()
    tx["Amount"] = tx["Debit"] - tx["Credit"]   # bank view: money in is +
    tx = tx.reset_index(drop=True)
    return tx, closing_as_per_bank


def _norm(s):
    return re.sub(r"[^A-Z0-9]", "", str(s).upper())


def _ref_key(utr):
    """Reference used for matching. Short refs (< 6 chars) are too weak to match on alone."""
    k = _norm(utr)
    if len(k) < 6:
        return ""
    return k[-8:] if len(k) >= 8 else k


def reconcile(stmt, ledger, stmt_open, ledger_open):
    """Match each ledger line to a statement line on amount (and ref when present), within a date window."""
    st = stmt.copy(); lg = ledger.copy()
    st["Used"] = False
    rows = []
    for i, l in lg.iterrows():
        cand = st[(~st["Used"]) & ((st["Amount"] - l["Amount"]).abs() <= AMT_TOL)]
        if len(cand):
            key = _ref_key(l["UTR"])
            ref_ok = cand[cand["Ref"].map(_norm).str.contains(key, regex=False)
                          | cand["Narration"].map(_norm).str.contains(key, regex=False)] if key else cand.iloc[0:0]
            pick = ref_ok if len(ref_ok) else cand
            pick = pick.assign(gap=(pick["Date"] - l["LDate"]).dt.days.abs()).sort_values("gap")
            best = pick.iloc[0]
            if best["gap"] <= DATE_WINDOW_DAYS or len(ref_ok):
                st.loc[best.name, "Used"] = True
                rows.append({"Source": "Tally", "Date (Book)": l["LDate"].date(), "Date (Bank)": best["Date"].date(),
                             "Particulars": l["Particulars"], "Voucher": l["VNo"], "UTR/Ref": l["UTR"],
                             "Amount (Book)": l["Amount"], "Amount (Bank)": best["Amount"], "Narration (Bank)": best["Narration"],
                             "Status": "Matched", "Action": ""})
                continue
        rows.append({"Source": "Tally", "Date (Book)": l["LDate"].date(), "Date (Bank)": None,
                     "Particulars": l["Particulars"], "Voucher": l["VNo"], "UTR/Ref": l["UTR"],
                     "Amount (Book)": l["Amount"], "Amount (Bank)": None, "Narration (Bank)": "",
                     "Status": "In Books, not in Bank", "Action": "Bank me entry nahi mili. Cheque clearing ya date check karein"})
    for i, s in st[~st["Used"]].iterrows():
        rows.append({"Source": "Bank", "Date (Book)": None, "Date (Bank)": s["Date"].date(), "Particulars": "",
                     "Voucher": "", "UTR/Ref": s["Ref"], "Amount (Book)": None, "Amount (Bank)": s["Amount"],
                     "Narration (Bank)": s["Narration"], "Status": "In Bank, not in Books",
                     "Action": "Bank me hai, Tally me entry nahi. Entry banayein ya narration check karein"})
    out = pd.DataFrame(rows)
    return out


def _opening_before(first_open, rows, amount_col, start):
    """Balance just before `start`: opening of the file plus all movements dated before it."""
    before = rows[rows["_d"] < start]
    return round(first_open + before[amount_col].sum(), 2)


def run_bank(stmt_src, ledger_src, period_start, period_end):
    """Reconcile bank statement vs Tally bank ledger for the inclusive period [period_start, period_end].

    Opening balances are taken at period_start (so a mid-year From date works), and the
    closing reconciliation accounts for uncleared Books entries, bank-only entries and any
    opening difference, so the 'Unexplained' line should be zero when the files are complete.
    """
    start, end = pd.Timestamp(period_start), pd.Timestamp(period_end)
    if start > end:
        raise ValueError("From date, To date se pehle honi chahiye")

    st_all, stmt_open_file = parse_statement(stmt_src)
    lg_all, _ = parse_ledger(ledger_src)
    raw_ledger = pd.read_excel(ledger_src, header=None)
    ledger_open_fy = None
    for _, r in raw_ledger.iterrows():
        if str(r.get(4, "")).strip().lower() == "opening balance":
            ledger_open_fy = _num(pd.Series([r.get(5)])).iloc[0]
            break
    if ledger_open_fy is None:
        raise ValueError("Tally ledger me Opening Balance nahi mila")

    # Balances before the period start (bank statement and Tally ledger are rolled forward separately)
    st_all = st_all.assign(_d=st_all["Date"])
    lg_all = lg_all.assign(_d=lg_all["LDate"])
    bank_open = _opening_before(stmt_open_file, st_all, "Amount", start)
    ledger_open = _opening_before(ledger_open_fy, lg_all, "Amount", start)

    st = st_all[(st_all["Date"] >= start) & (st_all["Date"] <= end)].reset_index(drop=True)
    lg = lg_all[(lg_all["LDate"] >= start) & (lg_all["LDate"] <= end)].reset_index(drop=True)
    if not len(st):
        raise ValueError("Bank statement me selected period ki entries nahi mili")

    res = reconcile(st, lg, bank_open, ledger_open)
    closing_book = round(ledger_open + lg["Amount"].sum(), 2)
    closing_bank_file = round(st.iloc[-1]["Closing"], 2)
    closing_bank_calc = round(bank_open + st["Amount"].sum(), 2)

    book_only = round(res.loc[res["Status"].eq("In Books, not in Bank"), "Amount (Book)"].sum(), 2)
    bank_only = round(res.loc[res["Status"].eq("In Bank, not in Books"), "Amount (Bank)"].sum(), 2)
    opening_diff = round(bank_open - ledger_open, 2)
    derived_bank = round(closing_book - book_only + bank_only + opening_diff, 2)
    unexplained = round(closing_bank_file - derived_bank, 2)

    summary = pd.DataFrame([
        {"Item": "Opening balance (at From date)", "Bank statement": bank_open, "Tally book": ledger_open,
         "Difference": opening_diff, "Remark": ""},
        {"Item": "Deposits in period", "Bank statement": round(st["Deposit"].sum(), 2), "Tally book": round(lg["Debit"].sum(), 2),
         "Difference": round(st["Deposit"].sum() - lg["Debit"].sum(), 2), "Remark": ""},
        {"Item": "Withdrawals in period", "Bank statement": round(st["Withdrawal"].sum(), 2), "Tally book": round(lg["Credit"].sum(), 2),
         "Difference": round(st["Withdrawal"].sum() - lg["Credit"].sum(), 2), "Remark": ""},
        {"Item": "Closing balance (at To date)", "Bank statement": closing_bank_file, "Tally book": closing_book,
         "Difference": round(closing_book - closing_bank_file, 2),
         "Remark": "" if abs(closing_bank_file - closing_bank_calc) <= AMT_TOL
         else f"Statement running balance ({closing_bank_file:,.2f}) opening + entries ({closing_bank_calc:,.2f}) se match nahi karta. File check karein"},
    ])
    recon = pd.DataFrame([
        {"Item": "Closing as per Tally book", "Amount": closing_book, "Remark": ""},
        {"Item": "Less: Books entries not yet in bank (net)", "Amount": -book_only, "Remark": "Timing difference (cheque / NEFT pending)"},
        {"Item": "Add: Bank entries not yet in Tally (net)", "Amount": bank_only, "Remark": "Entry Tally me banani hai (charges, interest, unrecorded receipts)"},
        {"Item": "Opening difference (bank minus Tally)", "Amount": opening_diff, "Remark": "Pehle ke period ka farq"},
        {"Item": "Derived bank balance", "Amount": derived_bank, "Remark": ""},
        {"Item": "Closing as per bank statement", "Amount": closing_bank_file, "Remark": ""},
        {"Item": "Unexplained difference", "Amount": unexplained,
         "Remark": "Zero hona chahiye. Non-zero ho to file/period ka mismatch ho sakta hai"},
    ])
    exceptions = res[res["Status"] != "Matched"].reset_index(drop=True)
    return {"Summary": summary, "Closing Reconciliation": recon, "Exceptions": exceptions, "All Entries": res}
