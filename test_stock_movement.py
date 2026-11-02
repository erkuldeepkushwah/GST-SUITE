"""Tests for stock movement reconciliation (generated workbooks, no client files)."""
import io
import unittest

import pandas as pd

import stock_movement as sm


def _book(rows, header_row=2, title="Stock Movement"):
    """Rows -> xlsx bytes with a title row above the heading row, like a Tally export."""
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as w:
        frame = pd.DataFrame(rows)
        frame.to_excel(w, index=False, startrow=header_row)
    buf.seek(0)
    return buf


MOVEMENT = [
    ["Item", "Unit", "Opening", "Inward", "Outward", "Closing"],
    ["Item A", "PCS", 10, 5, 3, 12],      # tallies
    ["Item B", "PCS", 4, 0, 6, -2],       # tallies, but negative closing
    ["Item C", "PCS", 5, 2, 1, 10],       # does not tally (6 vs 10)
    ["Item D", "PCS", 2, 0, 0, 2],        # no movement
]

CLOSING = [
    ["Item", "Unit", "Closing"],
    ["Item A", "PCS", 12],
    ["Item B", "PCS", -2],
    ["Item C", "PCS", 10],
    ["Item D", "PCS", 2],
    ["Item E", "PCS", 7],                 # only in the closing summary
]


class LoadTests(unittest.TestCase):
    def test_header_row_found_below_title(self):
        items = sm.load_movement(_book(MOVEMENT))
        self.assertEqual(list(items["Item"]), ["Item A", "Item B", "Item C", "Item D"])

    def test_numbers_are_numeric(self):
        items = sm.load_movement(_book(MOVEMENT))
        self.assertTrue(pd.api.types.is_numeric_dtype(items["Closing"]))

    def test_unknown_headers_raise(self):
        bad = _book([["Foo", "Bar"], [1, 2]])
        with self.assertRaises(ValueError):
            sm.load_movement(bad)

    def test_commas_in_numbers(self):
        rows = [["Item", "Opening", "Inward", "Outward", "Closing"],
                ["Item A", "1,000", "500", "200", "1,300"]]
        items = sm.load_movement(_book(rows))
        self.assertEqual(float(items.iloc[0]["Opening"]), 1000.0)


class BuildTests(unittest.TestCase):
    def setUp(self):
        self.excel, self.summary, self.exc, self.items = sm.build(
            _book(MOVEMENT), gstin="23ABCDE1234F1Z5", period_label="Nov-2026")

    def test_excel_is_written(self):
        self.assertTrue(self.excel[:2] == b"PK")
        self.assertGreater(len(self.excel), 3000)

    def test_computed_closing(self):
        row = self.items.set_index("Item").loc["Item C"]
        self.assertEqual(row["Computed closing"], 6.0)
        self.assertEqual(row["Difference"], -4.0)

    def test_only_the_broken_row_is_an_arithmetic_error(self):
        broken = self.exc[self.exc["Flags"].str.contains("MOVEMENT DOES NOT TALLY")]
        self.assertEqual(len(broken), 1)
        self.assertEqual(broken.iloc[0]["Item"], "Item C")

    def test_no_movement_stays_out_of_exceptions(self):
        self.assertNotIn("Item D", list(self.exc["Item"]))

    def test_negative_closing_flagged(self):
        row = self.items.set_index("Item").loc["Item B"]
        self.assertIn("NEGATIVE CLOSING", row["Flags"])

    def test_no_movement_is_informational(self):
        row = self.items.set_index("Item").loc["Item D"]
        self.assertIn("NO MOVEMENT", row["Flags"])

    def test_summary_reports_not_tied(self):
        self.assertFalse(sm.all_tied(self.summary))
        err = self.summary[self.summary["Check"].str.contains("not equal to closing")].iloc[0]
        self.assertEqual(err["Per items"], 1)

    def test_sheets_present(self):
        sheets = pd.read_excel(io.BytesIO(self.excel), sheet_name=None, header=None)
        self.assertIn("Summary", sheets)
        self.assertIn("Exceptions", sheets)


class CrossCheckTests(unittest.TestCase):
    def test_closing_summary_mismatch_is_reported(self):
        _, summary, _, _ = sm.build(_book(MOVEMENT), _book(CLOSING), period_label="Nov-2026")
        row = summary[summary["Check"].str.contains("closing stock summary")].iloc[0]
        self.assertEqual(row["Per items"], 1)          # Item E missing from the movement file
        self.assertIn("NOT TIED", row["Status"])

    def test_matching_files_tie(self):
        close = [["Item", "Closing"], ["Item A", 12], ["Item B", -2], ["Item C", 10], ["Item D", 2]]
        _, summary, _, _ = sm.build(_book(MOVEMENT), _book(close), period_label="Nov-2026")
        row = summary[summary["Check"].str.contains("closing stock summary")].iloc[0]
        self.assertEqual(row["Per items"], 0)
        self.assertIn("All items match", row["Status"])

    def test_cross_check_sheet_added(self):
        excel, _, _, _ = sm.build(_book(MOVEMENT), _book(CLOSING))
        sheets = pd.read_excel(io.BytesIO(excel), sheet_name=None, header=None)
        self.assertIn("Cross-check", sheets)


if __name__ == "__main__":
    unittest.main()
