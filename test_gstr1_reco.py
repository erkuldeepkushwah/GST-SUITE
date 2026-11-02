"""Regression tests for the GSTR-1 reconciliation (portal JSON vs Books template).

Uses small in-memory data, so no client files are needed in the repo.
"""
import io
import json
import unittest

import pandas as pd

import gstr1_multi as gm
import gstr1_reco as g1

GSTIN = "23AAAAA0000A1Z5"
CTIN = "27BBBBB1111B1Z6"


def _item(rt, txval, tax):
    return {"itm_det": {"rt": rt, "txval": txval, "iamt": 0, "camt": tax / 2, "samt": tax / 2, "csamt": 0}}


def _portal_json(fp, invoices, cdnr=None, b2cs=None):
    return json.dumps({
        "gstin": GSTIN, "fp": fp,
        "b2b": [{"ctin": CTIN, "inv": [
            {"inum": n, "idt": d, "val": v, "pos": "27", "itms": [_item(18, t, tax)]}
            for n, d, v, t, tax in invoices]}] if invoices else [],
        "cdnr": cdnr or [], "b2cs": b2cs or [], "hsn": {"hsn_b2b": [], "hsn_b2c": []},
    }).encode()


def _books_xlsx(rows):
    cols = ["GSTIN/UIN of Recipient", "Invoice Number", "Invoice date", "Invoice Value",
            "Place Of Supply", "Rate", "Taxable Value", "Cess Amount"]
    b2b = pd.DataFrame(rows, columns=cols)
    out = io.BytesIO()
    empty = lambda c: pd.DataFrame(columns=c)
    with pd.ExcelWriter(out) as w:
        def put(name, df):
            top = pd.DataFrame([[None] * len(df.columns)] * 3, columns=df.columns)
            pd.concat([top, pd.DataFrame([list(df.columns)], columns=df.columns), df],
                      ignore_index=True).to_excel(w, sheet_name=name, index=False, header=False)
        put("b2b,sez,de", b2b)
        put("cdnr", empty(["GSTIN/UIN of Recipient", "Note Number", "Note Date", "Note Value",
                           "Place Of Supply", "Note Type", "Rate", "Taxable Value"]))
        put("b2cs", empty(["Place Of Supply", "Rate", "Type", "Taxable Value"]))
        put("hsn(b2b)", empty(["HSN", "UQC", "Total Quantity", "Rate", "Taxable Value"]))
        put("hsn(b2c)", empty(["HSN", "UQC", "Total Quantity", "Rate", "Taxable Value"]))
    return out.getvalue()


class B2BMatchingTests(unittest.TestCase):
    def setUp(self):
        portal = _portal_json("042026", [
            ("INV1", "05-04-2026", 1180, 1000, 180),   # matched
            ("INV2", "06-04-2026", 1180, 1000, 170),   # tax differs
            ("INV3", "07-04-2026", 1180, 1000, 180),   # books value higher -> advance match
            ("INV4", "08-04-2026", 590, 500, 90),      # only in portal
        ])
        books = _books_xlsx([
            [CTIN, "INV1", "05-04-2026", 1180, "27-Maharashtra", 18, 1000, 0],
            [CTIN, "INV2", "06-04-2026", 1180, "27-Maharashtra", 18, 1000, 0],
            [CTIN, "INV3", "07-04-2026", 1250, "27-Maharashtra", 18, 1000, 0],
            [CTIN, "INV5", "09-04-2026", 1180, "27-Maharashtra", 18, 1000, 0],  # only in books
        ])
        self.res = gm.run([("p.json", portal)], [("b.xlsx", books)],
                          pd.Timestamp("2026-04-01"), pd.Timestamp("2026-04-30"))
        self.b2b = self.res["B2B Reco"].set_index("Invoice")

    def test_status_per_invoice(self):
        self.assertEqual(self.b2b.loc["INV1", "Status"], "Matched")
        self.assertEqual(self.b2b.loc["INV2", "Status"], "Mismatch")
        self.assertIn("TAX_DIFF", self.b2b.loc["INV2", "Reason Code"])
        self.assertEqual(self.b2b.loc["INV3", "Status"], "Advance Match")
        self.assertEqual(self.b2b.loc["INV4", "Status"], "Only in Portal")
        self.assertEqual(self.b2b.loc["INV5", "Status"], "Only in Books")

    def test_advance_match_appears_on_dashboard(self):
        dash = self.res["Dashboard"]
        row = dash[(dash["Section"] == "B2B") & (dash["Status"] == "Advance Match")]
        self.assertEqual(int(row["Count"].sum()), 1)


class PortalParsingTests(unittest.TestCase):
    def test_no_credit_notes_does_not_crash(self):
        raw = _portal_json("052026", [("A1", "10-05-2026", 1180, 1000, 180)])
        parsed = g1.parse_portal(io.BytesIO(raw))
        self.assertEqual(g1.net_taxable(parsed), 1000.0)

    def test_credit_note_reduces_net_taxable(self):
        cdn = [{"ctin": CTIN, "nt": [{"nt_num": "CN1", "nt_dt": "20-05-2026", "ntty": "C", "val": 590,
                                      "pos": "27", "itms": [_item(18, 500, 90)]}]}]
        raw = _portal_json("052026", [("A1", "10-05-2026", 1180, 1000, 180)], cdnr=cdn)
        parsed = g1.parse_portal(io.BytesIO(raw))
        self.assertEqual(g1.net_taxable(parsed), 500.0)

    def test_empty_b2b_section_keeps_schema(self):
        raw = _portal_json("062026", [], b2cs=[{"pos": "27", "rt": 5, "typ": "OE", "txval": 300,
                                                "iamt": 0, "camt": 7.5, "samt": 7.5}])
        parsed = g1.parse_portal(io.BytesIO(raw))
        self.assertEqual(list(parsed["b2b"].columns), g1.B2B_COLS)
        self.assertEqual(g1.net_taxable(parsed), 300.0)


if __name__ == "__main__":
    unittest.main()
