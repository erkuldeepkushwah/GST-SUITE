"""GSTR-3B PDF reader.

Pulls the 3.1 outward-supply table (and the return period) out of the GST portal's
GSTR-3B PDF so the app can fill the 3B tie-out grid instead of the user typing it.

The parser works on extracted text, not on coordinates, so it survives the small
layout changes the portal makes between releases. If a table cannot be read the
caller gets an empty frame plus a warning; the grid stays editable by hand.
"""
import io
import re

import pandas as pd

SECTIONS = [
    # (key, label fragment used to find the row, human label)
    ("a", "outward taxable supplies (other than zero rated",
     "(a) Outward taxable supplies (other than zero rated, nil rated and exempted)"),
    ("b", "outward taxable supplies (zero rated",
     "(b) Outward taxable supplies (zero rated)"),
    ("c", "other outward supplies (nil rated",
     "(c) Other outward supplies (nil rated, exempted)"),
    ("d", "inward supplies (liable to reverse charge",
     "(d) Inward supplies (liable to reverse charge)"),
    ("e", "non-gst outward supplies",
     "(e) Non-GST outward supplies"),
]

MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
    "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9, "oct": 10,
    "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}

NUM = re.compile(r"(?<![\w.])\d{1,3}(?:,\d{2,3})*(?:\.\d+)?(?![\w])")
MONTH_YEAR = re.compile(
    r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|"
    r"aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
    r"\.?\s*[,\-/\s]\s*(\d{4})"
)
MONTH_ONLY = re.compile(
    r"month\s*[:\-]?\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|"
    r"jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
)
NUMERIC_PERIOD = re.compile(r"\b(0[1-9]|1[0-2])[/-](\d{4})\b")
EMPTY_COLUMNS = ["Return Period", "Section", "Taxable", "IGST", "CGST", "SGST", "Cess", "Source"]


def _to_float(tok):
    try:
        return round(float(tok.replace(",", "")), 2)
    except ValueError:
        return 0.0


def _label(month_number, year):
    return f"{pd.Timestamp(year=year, month=month_number, day=1):%b}-{year}"


def find_period(text):
    """Return 'Mon-YYYY' for the return period printed on the form, or None."""
    low = text.lower()
    m = MONTH_YEAR.search(low)
    if m:
        month = MONTHS.get(m.group(1)[:4].rstrip("."), None) or MONTHS.get(m.group(1)[:3])
        if month:
            return _label(month, int(m.group(2)))
    m = MONTH_ONLY.search(low)
    if m:
        month = MONTHS.get(m.group(1)[:3])
        years = re.findall(r"(?:year\s*[:\-]?\s*)?(20\d{2})", low)
        if month and years:
            return _label(month, int(years[0]))
    m = NUMERIC_PERIOD.search(low)
    if m:
        return _label(int(m.group(1)), int(m.group(2)))
    return None


def _section_text(text):
    """The part of the form holding table 3.1, or the whole text when the markers are missing."""
    low = text.lower()
    start = low.find("3.1")
    if start == -1:
        return text
    tail = low[start + 3:]
    for stop in ("3.2", "4. eligible", "4.eligible", "eligible itc"):
        idx = tail.find(stop)
        if idx != -1:
            return text[start + 3:start + 3 + idx]
    return text[start + 3:]


def _row_values(block, fragment):
    """Five numbers (taxable, IGST, CGST, SGST, cess) that follow a row label."""
    low = block.lower()
    pos = low.find(fragment)
    if pos == -1:
        return None
    tail = block[pos + len(fragment):]
    # Stop at the next row label so one row cannot eat the next row's numbers.
    stops = [tail.lower().find(other) for _, other, _ in SECTIONS if other != fragment]
    stops = [s for s in stops if s != -1]
    if stops:
        tail = tail[:min(stops)]
    values = [_to_float(t) for t in NUM.findall(tail)[:5]]
    while len(values) < 5:
        values.append(0.0)
    return values


def parse_3b_text(text, source="GSTR-3B.pdf"):
    """Parse extracted GSTR-3B text.

    Returns {'period': 'Nov-2026' or None, 'rows': DataFrame, 'warnings': [str]}.
    Only the 3.1 table is read; ITC stays a manual entry.
    """
    warnings = []
    rows = []
    if not text or not text.strip():
        return {"period": None, "rows": pd.DataFrame(columns=EMPTY_COLUMNS),
                "warnings": [f"{source}: PDF me koi text nahi mila (scanned copy?)"]}

    period = find_period(text)
    if period is None:
        warnings.append(f"{source}: return period nahi mila, grid me haath se bharein")

    block = _section_text(text)
    for key, fragment, label in SECTIONS:
        values = _row_values(block, fragment)
        if values is None:
            continue
        taxable, igst, cgst, sgst, cess = values
        rows.append({
            "Return Period": period or "",
            "Section": label,
            "Taxable": taxable,
            "IGST": igst,
            "CGST": cgst,
            "SGST": sgst,
            "Cess": cess,
            "Source": source,
        })

    if not rows:
        warnings.append(f"{source}: 3.1 table ki rows nahi padhi ja sakin, grid me haath se bharein")

    return {"period": period, "rows": pd.DataFrame(rows, columns=EMPTY_COLUMNS), "warnings": warnings}


def read_pdf_text(raw):
    """Text of every page of a PDF given as bytes."""
    from pypdf import PdfReader  # imported here so the rest of the app runs without it

    reader = PdfReader(io.BytesIO(raw))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def parse_3b_pdf(raw, source="GSTR-3B.pdf"):
    """Same shape as parse_3b_text, from PDF bytes."""
    try:
        text = read_pdf_text(raw)
    except Exception as exc:  # corrupt or password-protected PDF
        return {"period": None, "rows": pd.DataFrame(columns=EMPTY_COLUMNS),
                "warnings": [f"{source}: PDF padha nahi ja saka ({exc})"]}
    return parse_3b_text(text, source=source)


def parse_3b_files(files):
    """Parse many (name, bytes) pairs. Later files win for a repeated return period.

    Returns (rows DataFrame with the five tie-out columns, warnings list, full rows DataFrame).
    """
    parsed = []
    warnings = []
    for name, raw in files:
        out = parse_3b_pdf(raw, source=name)
        warnings.extend(out["warnings"])
        if len(out["rows"]):
            parsed.append(out["rows"])

    if not parsed:
        return pd.DataFrame(columns=["Return Period", "Taxable", "IGST", "CGST", "SGST"]), warnings, \
            pd.DataFrame(columns=EMPTY_COLUMNS)

    full = pd.concat(parsed, ignore_index=True)
    outward = full[full["Section"].str.startswith("(a)")].copy()
    outward = outward.drop_duplicates(subset=["Return Period"], keep="last")
    grid = outward[["Return Period", "Taxable", "IGST", "CGST", "SGST"]].reset_index(drop=True)
    missing = full[full["Section"].str.startswith("(a)")].empty
    if missing and len(full):
        warnings.append("3.1(a) row nahi mili; dusri rows mili hain, grid me haath se check karein")
    return grid, warnings, full
