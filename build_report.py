"""CLI: build the full reconciliation workbook.
Usage: python build_report.py <2A/2B file> <Books file> <GSTIN> <output.xlsx>
Confirmed note types are read from manual_note_types.csv in the same folder, if present."""
import os
import sys
import pandas as pd
import reco_core as rc

portal, books, gstin, out = sys.argv[1:5]
here = os.path.dirname(os.path.abspath(__file__))
manual_path = os.path.join(here, "manual_note_types.csv")
manual = pd.read_csv(manual_path, dtype=str) if os.path.exists(manual_path) else None
results = rc.run_reconciliation(portal, books, gstin, manual_types=manual)
with open(out, "wb") as f:
    f.write(rc.to_excel_bytes(results, gstin=gstin))
print(results["Dashboard"].to_string(index=False))
print("saved", out)
