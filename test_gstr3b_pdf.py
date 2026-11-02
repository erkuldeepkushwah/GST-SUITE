"""Tests for the GSTR-3B PDF reader (text-level, no real portal PDF needed)."""
import unittest
from unittest import mock

import gstr3b_pdf as g3

ONE_LINE = """GSTIN: 23ABCDE1234F1Z5
Legal Name: FINGENUITY ASSOCIATES
Return Period
Year 2026-27    Month November
3.1 Tax on outward and reverse charge inward supplies
Nature Of Supplies Total Taxable Value Integrated Tax Central Tax State/UT Tax Cess
(a) Outward taxable supplies (other than zero rated, nil rated and exempted) 10,00,000.00 1,80,000.00 0.00 0.00 0.00
(b) Outward taxable supplies (zero rated) 0.00 0.00 0.00 0.00 0.00
(c) Other outward supplies (nil rated, exempted) 50,000.00 0.00 0.00 0.00 0.00
(d) Inward supplies (liable to reverse charge) 20,000.00 3,600.00 0.00 0.00 0.00
(e) Non-GST outward supplies 0.00 0.00 0.00 0.00 0.00
3.2 Of the supplies shown in 3.1 (a) above
4. Eligible ITC
"""

WRAPPED = """GSTIN: 23ABCDE1234F1Z5
Month November 2026
3.1
Tax on outward and reverse charge inward supplies
(a) Outward taxable supplies (other than zero rated, nil
rated and exempted)
5,00,000.00
90,000.00
0.00
0.00
0.00
(b) Outward taxable supplies (zero rated)
0.00
0.00
0.00
0.00
0.00
3.2 Of the supplies shown in 3.1 (a) above
"""


def _fake_reader(texts):
    """Stand-in for read_pdf_text: maps the raw bytes we pass in to a fixed text."""
    return lambda raw: texts[raw.decode()]


class PeriodTests(unittest.TestCase):
    def test_month_and_year(self):
        self.assertEqual(g3.find_period("Year 2026-27  Month November"), "Nov-2026")

    def test_numeric_period(self):
        self.assertEqual(g3.find_period("Tax Period 04/2026"), "Apr-2026")

    def test_missing_period(self):
        self.assertIsNone(g3.find_period("no period here"))


class ParseTests(unittest.TestCase):
    def test_outward_row_is_read(self):
        out = g3.parse_3b_text(ONE_LINE)
        self.assertEqual(out["period"], "Nov-2026")
        row = out["rows"][out["rows"]["Section"].str.startswith("(a)")].iloc[0]
        self.assertEqual(row["Taxable"], 1000000.00)
        self.assertEqual(row["IGST"], 180000.00)
        self.assertEqual(row["CGST"], 0.0)

    def test_all_five_sections(self):
        rows = g3.parse_3b_text(ONE_LINE)["rows"]
        self.assertEqual(len(rows), 5)
        c = rows[rows["Section"].str.startswith("(c)")].iloc[0]
        self.assertEqual(c["Taxable"], 50000.00)
        d = rows[rows["Section"].str.startswith("(d)")].iloc[0]
        self.assertEqual(d["IGST"], 3600.00)

    def test_wrapped_labels_and_stacked_numbers(self):
        out = g3.parse_3b_text(WRAPPED)
        self.assertEqual(out["period"], "Nov-2026")
        row = out["rows"][out["rows"]["Section"].str.startswith("(a)")].iloc[0]
        self.assertEqual(row["Taxable"], 500000.00)
        self.assertEqual(row["IGST"], 90000.00)

    def test_rows_do_not_bleed_into_each_other(self):
        rows = g3.parse_3b_text(ONE_LINE)["rows"]
        b = rows[rows["Section"].str.startswith("(b)")].iloc[0]
        self.assertEqual(b["Taxable"], 0.0)

    def test_garbage_text_warns_without_crashing(self):
        out = g3.parse_3b_text("This is not a return at all")
        self.assertEqual(len(out["rows"]), 0)
        self.assertTrue(out["warnings"])

    def test_empty_text_warns(self):
        out = g3.parse_3b_text("   ")
        self.assertTrue(out["warnings"])


class MultiFileTests(unittest.TestCase):
    def test_one_row_per_return_period(self):
        texts = {"nov.pdf": ONE_LINE, "dec.pdf": ONE_LINE.replace("November", "December")}
        with mock.patch.object(g3, "read_pdf_text", side_effect=_fake_reader(texts)):
            grid, warnings, full = g3.parse_3b_files([("nov.pdf", b"nov.pdf"), ("dec.pdf", b"dec.pdf")])
        self.assertEqual(sorted(grid["Return Period"]), ["Dec-2026", "Nov-2026"])
        self.assertEqual(len(grid), 2)
        self.assertEqual(list(grid.columns), ["Return Period", "Taxable", "IGST", "CGST", "SGST"])
        self.assertIn("Section", full.columns)

    def test_same_period_twice_keeps_last(self):
        texts = {"a.pdf": ONE_LINE, "b.pdf": ONE_LINE.replace("10,00,000.00", "12,00,000.00")}
        with mock.patch.object(g3, "read_pdf_text", side_effect=_fake_reader(texts)):
            grid, _, _ = g3.parse_3b_files([("a.pdf", b"a.pdf"), ("b.pdf", b"b.pdf")])
        self.assertEqual(len(grid), 1)
        self.assertEqual(grid.iloc[0]["Taxable"], 1200000.00)

    def test_unreadable_pdf_is_reported(self):
        grid, warnings, full = g3.parse_3b_files([("broken.pdf", b"not a pdf")])
        self.assertEqual(len(grid), 0)
        self.assertTrue(warnings)


if __name__ == "__main__":
    unittest.main()
