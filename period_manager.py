"""Shared financial-period utilities for the GST Reconciliation Suite.

All ranges are inclusive and use the Indian financial year (1 April–31 March).
This module is deliberately UI-independent so Desktop and Streamlit share rules.
"""
from __future__ import annotations

import calendar
from datetime import date, datetime
from typing import NamedTuple


class Period(NamedTuple):
    start: date
    end: date
    label: str
    mode: str


def financial_year_start(value: date | datetime | str) -> int:
    d = _as_date(value)
    return d.year if d.month >= 4 else d.year - 1


def _as_date(value) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()


def fy_label(start_year: int) -> str:
    return f"FY {start_year}-{str(start_year + 1)[-2:]}"


def period_bounds(mode: str, *, reference_date=None, fy_start_year=None,
                  month=None, quarter=None, start=None, end=None) -> Period:
    """Return an inclusive period for Monthly, Quarterly, Financial Year or Custom."""
    mode_key = str(mode).strip().lower()
    ref = _as_date(reference_date or date.today())
    fy = int(fy_start_year if fy_start_year is not None else financial_year_start(ref))

    if mode_key in {"monthly", "month"}:
        m = _as_date(month or ref.replace(day=1))
        first = date(m.year, m.month, 1)
        last = date(m.year, m.month, calendar.monthrange(m.year, m.month)[1])
        label = first.strftime("%b-%Y")
        return Period(first, last, label, "Monthly")

    if mode_key in {"quarterly", "quarter"}:
        q = int(quarter or (((ref.month - 4) % 12) // 3 + 1))
        if q not in (1, 2, 3, 4):
            raise ValueError("Quarter must be between 1 and 4.")
        raw_first_month = 4 + (q - 1) * 3
        first_year = fy + (raw_first_month - 1) // 12
        first_month = (raw_first_month - 1) % 12 + 1
        first = date(first_year, first_month, 1)
        raw_last_month = raw_first_month + 2
        last_year = fy + (raw_last_month - 1) // 12
        last_month = (raw_last_month - 1) % 12 + 1
        last = date(last_year, last_month, calendar.monthrange(last_year, last_month)[1])
        return Period(first, last, f"{fy_label(fy)} Q{q}", "Quarterly")

    if mode_key in {"yearly", "financial year", "financial-year", "fy"}:
        return Period(date(fy, 4, 1), date(fy + 1, 3, 31), fy_label(fy), "Financial Year")

    if mode_key == "custom":
        if start is None or end is None:
            raise ValueError("Custom period requires both From and To dates.")
        first, last = _as_date(start), _as_date(end)
        if first > last:
            raise ValueError("From date cannot be after To date.")
        return Period(first, last, f"{first:%d-%b-%Y} to {last:%d-%b-%Y}", "Custom")

    raise ValueError(f"Unsupported period mode: {mode}")


def available_fy_years(reference_date=None, first_year=2020, future_years=1):
    ref = _as_date(reference_date or date.today())
    current = financial_year_start(ref)
    return list(range(first_year, current + future_years + 1))
