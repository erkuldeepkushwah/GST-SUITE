"""Storage for the confirmed CN/DN note types.

The app keeps these in a small CSV next to the code (or under GST_RECO_DATA_DIR on desktop).
On Streamlit Cloud that folder can be read-only or is reset on every reboot, so this module
never raises: it reports whether the write worked and the app falls back to session memory.
"""
import os

import pandas as pd

COLUMNS = ["GSTIN", "Note No", "Type", "Basis"]


def empty():
    return pd.DataFrame(columns=COLUMNS)


def load(path):
    """Read the CSV, or an empty frame when it is missing or unreadable."""
    if not path or not os.path.exists(path):
        return empty()
    try:
        df = pd.read_csv(path, dtype=str)
    except Exception:
        return empty()
    for col in COLUMNS:
        if col not in df.columns:
            df[col] = ""
    return df[COLUMNS]


def merge(base, new):
    """Add the newly confirmed rows, last one wins for a GSTIN + note number."""
    base = base if base is not None and len(base) else empty()
    new = new if new is not None and len(new) else empty()
    if not len(new):
        return base
    out = pd.concat([base, new], ignore_index=True)
    return out.drop_duplicates(["GSTIN", "Note No"], keep="last").reset_index(drop=True)


def save(df, path):
    """Write the CSV. Returns (saved, message); message is the OS error when it fails."""
    try:
        folder = os.path.dirname(os.path.abspath(path))
        os.makedirs(folder, exist_ok=True)
        df.to_csv(path, index=False)
        return True, ""
    except OSError as exc:
        return False, str(exc)


def to_csv_bytes(df):
    return df.to_csv(index=False).encode("utf-8")


def from_csv_bytes(raw):
    """Read an uploaded confirmed-types CSV; returns an empty frame when it does not fit."""
    try:
        df = pd.read_csv(pd.io.common.BytesIO(raw), dtype=str)
    except Exception:
        return empty()
    for col in COLUMNS:
        if col not in df.columns:
            return empty()
    return df[COLUMNS]
