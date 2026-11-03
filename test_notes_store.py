"""Tests for the confirmed note-type store (used on desktop and on Streamlit Cloud)."""
import os
import tempfile
import unittest

import pandas as pd

import notes_store as ns


def _rows(*pairs):
    return pd.DataFrame([{"GSTIN": g, "Note No": n, "Type": t, "Basis": "test"} for g, n, t in pairs],
                        columns=ns.COLUMNS)


class LoadTests(unittest.TestCase):
    def test_missing_file_is_empty(self):
        df = ns.load(os.path.join(tempfile.gettempdir(), "does-not-exist-1234.csv"))
        self.assertEqual(list(df.columns), ns.COLUMNS)
        self.assertEqual(len(df), 0)

    def test_empty_path_is_empty(self):
        self.assertEqual(len(ns.load("")), 0)

    def test_broken_file_is_empty(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "x.csv")
            open(path, "w").write("not,a,note,file\n1,2,3,4\n")
            df = ns.load(path)
            self.assertEqual(list(df.columns), ns.COLUMNS)


class SaveTests(unittest.TestCase):
    def test_round_trip(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "manual_note_types.csv")
            saved, err = ns.save(_rows(("23ABCDE1234F1Z5", "CN-1", "CN")), path)
            self.assertTrue(saved, err)
            back = ns.load(path)
            self.assertEqual(len(back), 1)
            self.assertEqual(back.iloc[0]["Type"], "CN")

    def test_unwritable_folder_reports_instead_of_raising(self):
        saved, err = ns.save(_rows(("23ABCDE1234F1Z5", "CN-1", "CN")), "/proc/nope/manual_note_types.csv")
        self.assertFalse(saved)
        self.assertTrue(err)


class MergeTests(unittest.TestCase):
    def test_new_row_wins(self):
        base = _rows(("23ABCDE1234F1Z5", "CN-1", "CN"))
        new = _rows(("23ABCDE1234F1Z5", "CN-1", "DN"))
        out = ns.merge(base, new)
        self.assertEqual(len(out), 1)
        self.assertEqual(out.iloc[0]["Type"], "DN")

    def test_different_notes_are_kept(self):
        out = ns.merge(_rows(("A", "1", "CN")), _rows(("A", "2", "DN")))
        self.assertEqual(len(out), 2)

    def test_empty_sides(self):
        self.assertEqual(len(ns.merge(None, None)), 0)
        base = _rows(("A", "1", "CN"))
        self.assertEqual(len(ns.merge(base, None)), 1)
        self.assertEqual(len(ns.merge(None, base)), 1)


class CsvBytesTests(unittest.TestCase):
    def test_upload_round_trip(self):
        raw = ns.to_csv_bytes(_rows(("A", "1", "CN")))
        back = ns.from_csv_bytes(raw)
        self.assertEqual(len(back), 1)

    def test_wrong_csv_is_rejected(self):
        self.assertEqual(len(ns.from_csv_bytes(b"foo,bar\n1,2\n")), 0)
        self.assertEqual(len(ns.from_csv_bytes(b"\x00\x01binary")), 0)


if __name__ == "__main__":
    unittest.main()
