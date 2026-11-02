"""Basic regression tests for shared reporting-period boundaries."""
import unittest
from datetime import date
import period_manager as pm


class PeriodManagerTests(unittest.TestCase):
    def test_monthly_leap_year(self):
        p = pm.period_bounds("Monthly", month=date(2024, 2, 14))
        self.assertEqual((p.start, p.end), (date(2024, 2, 1), date(2024, 2, 29)))

    def test_financial_year(self):
        p = pm.period_bounds("Financial Year", fy_start_year=2025)
        self.assertEqual((p.start, p.end), (date(2025, 4, 1), date(2026, 3, 31)))

    def test_quarter_q4(self):
        p = pm.period_bounds("Quarterly", fy_start_year=2025, quarter=4)
        self.assertEqual((p.start, p.end), (date(2026, 1, 1), date(2026, 3, 31)))

    def test_custom_invalid_range(self):
        with self.assertRaises(ValueError):
            pm.period_bounds("Custom", start=date(2026, 5, 1), end=date(2026, 4, 1))


if __name__ == "__main__":
    unittest.main()
