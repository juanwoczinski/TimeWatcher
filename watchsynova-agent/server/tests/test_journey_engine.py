import os
import sys
import unittest
from datetime import datetime, timezone

os.environ.setdefault("WATCHSYNOVA_INGEST_TOKEN", "test-token")
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import ingest_server as server


class JourneyEngineTests(unittest.TestCase):
    def setUp(self):
        self.start = datetime(2026, 8, 7, 0, tzinfo=timezone.utc)
        self.end = datetime(2026, 8, 8, 0, tzinfo=timezone.utc)

    def test_explicit_work_exception_overrides_holiday_with_multiple_shifts(self):
        schedule = {
            "timezone": "America/Sao_Paulo", "weekdays": [1, 2, 3, 4, 5],
            "holidays": ["2026-08-07"],
            "exceptions": {"2026-08-07": {"work": True, "shifts": [{"start": "09:00", "end": "12:00"}, {"start": "13:00", "end": "17:00"}]}},
        }
        windows = server.schedule_windows(schedule, self.start, self.end)
        self.assertEqual(round(server.intervals_duration(windows)), 7 * 3600)

    def test_tolerance_and_bank_hours_are_calculated(self):
        schedule = {"timezone": "America/Sao_Paulo", "start": "09:00", "end": "10:00", "weekdays": [5], "toleranceMinutes": 10, "bankHours": True}
        planned = server.schedule_windows(schedule, self.start, self.end)
        # 09:05 local is within tolerance; work continues through 10:20.
        active = [(datetime(2026, 8, 7, 12, 5, tzinfo=timezone.utc), datetime(2026, 8, 7, 13, 20, tzinfo=timezone.utc))]
        metrics = server.schedule_metrics(schedule, self.start, self.end, active, active, [])
        self.assertEqual(metrics["lateSeconds"], 0)
        self.assertEqual(round(metrics["bankSeconds"]), 15 * 60)
        self.assertEqual(round(server.intervals_duration(planned)), 3600)


if __name__ == "__main__":
    unittest.main()
