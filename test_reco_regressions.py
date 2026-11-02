"""Regression tests for bank, stock, GSTR-2A/2B period filter and GSTR-9 fixes.

All inputs are generated in memory, so no client data is needed in the repo.
"""
import datetime as dt
import io
import unittest

import pandas as pd
from openpyxl import Workbook

import bank_reco as br
import reco_core as rc
import stock_reco as sr

G2A = "27AAAAA1111A1Z5"
SUPP = "27BBBBB2222B1Z6"


def _xlsx(sheets):
    wb = Workbook()
    wb.remove(wb.active)
    for name, rows in sheets.items():
        ws = wb.create_sheet(name)
        for r in rows:
            ws.append(r)
    out = io.BytesIO()
    wb.save(out)
    out.seek(0)
    return out


# ---------------- Bank ----------------
def _bank_files():
    stmt_rows = [
        ["HDFC Bank statement"], [], ["Date", "Narration", "Ref", "Value Date", "Withdrawal", "Deposit", "Closing"], [],
        ["25/03/26", "SALES", "", "25/03/26", None, 20000, 100000],
        ["02/04/26", "NEFT CUST A", "UTR123456789", "02/04/26", None, 5000, 105000],
        ["05/04/26", "CHQ PAID", "CHQ100", "05/04/26", 2000, None, 103000],
        ["10/04/26", "INT CREDIT", "", "10/04/26", None, 1000, 104000],
        ["15/04/26", "BANK CHARGES", "", "15/04/26", 300, None, 103700],
    ]
    ledger_rows = [
        ["Bank Ledger"], [], [None, "Particulars", "VType", "UTR", "VNo", "Debit", "Credit", "ClosingLedger", "Narration", "BankDate"],
        [None, "x", None, None, "Opening Balance", 80000, None, None, None, None],
        ["25-03-2026", "SALES", "Receipt", "", "1", 20000, None, None, "", None],
        ["02-04-2026", "CUST A", "Receipt", "UTR123456789", "2", 5000, None, None, "", None],
        ["05-04-2026", "Cheque", "Payment", "", "3", None, 2000, None, "", None],
        ["28-04-2026", "NEFT pending", "Receipt", "", "4", 7000, None, None, "", None],
    ]
    return _xlsx({"Sheet1": stmt_rows}), _xlsx({"Sheet1": ledger_rows})


class BankTests(unittest.TestCase):
    def _run(self, start, end):
        stmt, ledger = _bank_files()
        return br.run_bank(stmt, ledger, period_start=pd.Timestamp(start), period_end=pd.Timestamp(end))

    def test_full_month_reconciles_to_zero(self):
        r = self._run("2026-04-01", "2026-04-30")
        unexplained = r["Closing Reconciliation"].set_index("Item").loc["Unexplained difference", "Amount"]
        self.assertEqual(unexplained, 0.0)
        status = r["All Entries"]["Status"].value_counts().to_dict()
        self.assertEqual(status.get("Matched"), 2)
        self.assertEqual(status.get("In Books, not in Bank"), 1)
        self.assertEqual(status.get("In Bank, not in Books"), 2)

    def test_mid_period_from_date_uses_opening_at_from_date(self):
        r = self._run("2026-04-10", "2026-04-30")
        opening = r["Summary"].iloc[0]
        self.assertEqual(opening["Bank statement"], 103000.0)
        self.assertEqual(opening["Tally book"], 103000.0)
        unexplained = r["Closing Reconciliation"].set_index("Item").loc["Unexplained difference", "Amount"]
        self.assertEqual(unexplained, 0.0)

    def test_invalid_range_raises(self):
        with self.assertRaises(ValueError):
            self._run("2026-05-01", "2026-04-01")


# ---------------- Stock ----------------
def _stock_file(grand_value):
    rows = [[None] * 9 for _ in range(3170)]
    items = [("1)", "P1", "B1", "Widget A", "NOS", 10, 8, 800, "M1"),
             ("2)", "P2", "B1", "Widget B", "NOS", 5, -2, -100, "M2"),
             ("3)", "P3", "B2", "Gadget", "KGS", 3, 4, None, "M3")]
    for i, it in enumerate(items):
        rows[5 + i] = list(it)
    rows[3158][5:8] = [18, 10, grand_value]
    rows[3160] = ["NOS", 6, None]
    rows[3161] = ["KGS", 4, None]
    buf = io.BytesIO()
    pd.DataFrame(rows).to_excel(buf, header=False, index=False)
    buf.seek(0)
    return buf


class StockTests(unittest.TestCase):
    def test_correct_totals_are_tied(self):
        _, summary, _, _ = sr.build(_stock_file(700), gstin="29ZZZZZ9999Z1Z9")
        self.assertTrue(sr.all_tied(summary))

    def test_wrong_grand_total_is_not_reported_as_tied(self):
        _, summary, _, _ = sr.build(_stock_file(999), gstin="29ZZZZZ9999Z1Z9")
        self.assertFalse(sr.all_tied(summary))
        self.assertIn("NOT TIED", " ".join(summary["Status"].astype(str)))


# ---------------- GSTR-2A/2B period filter ----------------
def _gst_files():
    p_hdr = ["Party name", "Supplier GSTIN", "Invoice no.", "Invoice date", "Invoice type", "Return period",
             "Taxable value (₹)", "IGST (₹)", "CGST (₹)", "SGST/UTGST (₹)", "Cess (₹)", "Invoice value (₹)"]

    def prow(inv, d, ret, tx):
        tax = tx * 0.09
        return ["Supp Co", SUPP, inv, d, "Regular", ret, tx, 0, tax, tax, 0, tx + 2 * tax]

    b_hdr = ["GSTIN of Supplier", "Supplier Name", "Invoice Number", "Invoice date", "Invoice Value", "Place Of Supply",
             "Taxable Value", "Integrated Tax Paid", "Central Tax Paid", "State/UT Tax Paid", "Cess Paid",
             "Eligibility For ITC", "Document Type"]

    def brow(inv, d, tx):
        tax = tx * 0.09
        return [SUPP, "Supp Co", inv, d, tx + 2 * tax, "27-Maharashtra", tx, 0, tax, tax, 0, "Inputs", "Invoice"]

    portal = _xlsx({"B2B": [p_hdr,
                            prow("A1", "10-04-2026", "Apr-2026", 1000),   # normal, in period
                            prow("B1", "15-03-2026", "Apr-2026", 2000),   # late reported in April return
                            prow("C1", "10-04-2026", "May-2026", 3000)]})  # filed in May return
    books = _xlsx({"BOOKS-PURCHASE": [b_hdr,
                                      brow("A1", "10-04-2026", 1000), brow("B1", "15-03-2026", 2000),
                                      brow("C1", "10-04-2026", 3000), brow("D1", "20-04-2026", 500),
                                      brow("E1", "15-03-2026", 700)]})
    return portal, books


def _status_of(res):
    b = res["B2B Reco"]
    return dict(zip(b["Invoice No"], b["Status"]))


class GstPeriodTests(unittest.TestCase):
    def _run(self, basis):
        portal, books = _gst_files()
        return rc.run_reconciliation(portal, books, G2A, period_start=pd.Timestamp("2026-04-01"),
                                     period_end=pd.Timestamp("2026-04-30"), basis=basis)

    def test_invoice_date_basis(self):
        s = _status_of(self._run(rc.BASIS_INVOICE))
        self.assertEqual(s, {"A1": "Matched", "C1": "Matched", "D1": "Only in Books"})

    def test_return_period_basis_includes_late_reported(self):
        s = _status_of(self._run(rc.BASIS_RETURN))
        self.assertEqual(s["B1"], "Matched")
        self.assertEqual(s["C1"], "Only in Books")   # portal shows it in May return, not April

    def test_both_basis(self):
        s = _status_of(self._run(rc.BASIS_BOTH))
        self.assertEqual(s, {"A1": "Matched", "B1": "Matched", "C1": "Matched", "D1": "Only in Books"})

    def test_no_credit_note_sheet_does_not_crash(self):
        self.assertEqual(len(self._run(rc.BASIS_BOTH)["CDN Reco"]), 0)


# ---------------- GSTR-9 ----------------
class Gstr9Tests(unittest.TestCase):
    def test_missing_availed_itc_columns_do_not_crash(self):
        import gstr9
        _, books = _gst_files()
        out = gstr9.itc_summary(books, portal_b2b_total_tax=None, gstin=G2A)
        self.assertIn("Gross eligible ITC (invoices, excl. blocked)", set(out["Category"]))

    def test_blocked_itc_excluded_from_gross(self):
        import gstr9
        books = _xlsx({"BOOKS-PURCHASE": [
            ["GSTIN of Supplier", "Invoice Number", "Invoice date", "Integrated Tax Paid", "Central Tax Paid",
             "State/UT Tax Paid", "Cess Paid", "Availed ITC Integrated Tax", "Availed ITC Central Tax",
             "Availed ITC State/UT Tax", "Availed ITC Cess", "Eligibility For ITC", "Document Type"],
            [SUPP, "X1", "01-04-2026", 90, 90, 0, 0, 90, 90, 0, 0, "Inputs", "Invoice"],
            [SUPP, "X2", "02-04-2026", 50, 50, 0, 0, 50, 50, 0, 0, "Ineligible", "Invoice"],
        ]})
        out = gstr9.itc_summary(books, gstin=G2A)
        gross = out.loc[out["Category"].eq("Gross eligible ITC (invoices, excl. blocked)"), "ITC availed (gross)"].iloc[0]
        self.assertEqual(float(gross), 180.0)


class ReturnPeriodParsingTests(unittest.TestCase):
    """GSTR-2A exports use two-digit years ('Apr-26'); these must not be read as year 0026."""

    def test_formats(self):
        cases = {"Apr-26": "2026-04", "Oct-26": "2026-10", "Apr-2026": "2026-04",
                 "April 2026": "2026-04", "042026": "2026-04", "garbage": None, "": None}
        for text, expected in cases.items():
            got = rc._return_month(text)
            self.assertEqual(None if got is None else str(got), expected, text)

    def test_return_basis_on_two_digit_years(self):
        portal, books = _gst_files()
        # Same data as before, but return periods written as 'Apr-26'
        wb = pd.read_excel(portal, sheet_name="B2B")
        wb["Return period"] = wb["Return period"].replace({"Apr-2026": "Apr-26", "May-2026": "May-26"})
        out = io.BytesIO(); wb.to_excel(out, sheet_name="B2B", index=False); out.seek(0)
        portal2 = out
        r = rc.run_reconciliation(portal2, books, G2A, period_start=pd.Timestamp("2026-04-01"),
                                  period_end=pd.Timestamp("2026-04-30"), basis=rc.BASIS_RETURN)
        s = _status_of(r)
        self.assertEqual(s["B1"], "Matched")
        self.assertEqual(s["C1"], "Only in Books")


if __name__ == "__main__":
    unittest.main()
