"""Tests for data/history.py and data/simulate.py.

    python -m unittest data.test_history -v

Uses a temporary folder: it never touches data/runtime/.
"""
from __future__ import annotations

import copy
import os
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest import mock

from . import get_crew, history, simulate


class HistoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.db = self.dir / "history.db"
        self.end = date.today() - timedelta(days=1)

        crew = copy.deepcopy(get_crew())
        for m in crew:   # only Paulo consents in these tests, whatever crew.json says
            on = m["id"] == "crew_paulo"
            m["consent"] = {"face_recognition": on, "store_daily_history": on, "consent_date": "2026-11-14" if on else None}
        patches = [
            mock.patch.dict(os.environ, {"HEALTH_HISTORY_DB": str(self.db)}),
            mock.patch.object(simulate, "RUNTIME_DIR", self.dir),
            mock.patch.object(history, "RUNTIME_DIR", self.dir),
            mock.patch.object(simulate, "get_crew", lambda: crew),
            mock.patch.object(history, "get_crew", lambda: crew),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        simulate.main(["--end-date", self.end.isoformat(), "--quiet"])
        self.n = history.load_simulated()

    def tearDown(self):
        self.tmp.cleanup()

    def test_load_is_repeatable(self):
        self.assertGreater(self.n, 2000)
        self.assertEqual(history.load_simulated(), self.n)
        total = len(history.get_entries("crew_zelinda")) + len(history.get_entries("crew_paulo")) \
            + len(history.get_entries("crew_angel")) + len(history.get_entries("crew_said"))
        self.assertEqual(total, self.n)

    def test_story_zelinda_sleep_is_red_and_reaction_is_up(self):
        s = history.change_vs_baseline("crew_zelinda", "sleep_duration")
        self.assertEqual(s["level_recent"], "red")
        self.assertLess(s["pct"], -15)
        r = history.change_vs_baseline("crew_zelinda", "reaction_time")
        self.assertEqual(r["level_recent"], "yellow")   # demo criterion: +10% warn, +20% alert
        self.assertGreater(r["pct"], 10)

    def test_story_paulo_green_and_said_fever(self):
        self.assertEqual(history.change_vs_baseline("crew_paulo", "sleep_duration")["level_recent"], "green")
        last = history.daily_series("crew_said", "body_temperature", days=1)[0]
        self.assertEqual(last["level"], "yellow")

    def test_dates_line_up(self):
        last = history.daily_series("crew_zelinda", "sleep_duration", days=1)[0]
        self.assertEqual(last["date"], self.end.isoformat())
        self.assertEqual(last["mission_day"], 121)

    def test_consent_blocks_real_data(self):
        with self.assertRaises(history.ConsentError):
            history.add_entry("crew_zelinda", "sleep_duration", 7.0)
        self.assertEqual(history.purge_crew("crew_zelinda"), 0)  # nothing real stored

    def test_consenting_member_can_store_and_day_continues(self):
        rid = history.add_entry("crew_paulo", "sleep_duration", 7.4, source="manual")
        self.assertGreater(rid, 0)
        last = history.daily_series("crew_paulo", "sleep_duration", days=1)[0]
        self.assertEqual(last["date"], date.today().isoformat())
        self.assertEqual(last["mission_day"], 122)
        self.assertEqual(last["source"], "manual")

    def test_last_measurement_of_the_day_wins(self):
        history.add_entry("crew_paulo", "resting_heart_rate", 66, source="camera")
        history.add_entry("crew_paulo", "resting_heart_rate", 71, source="manual")
        self.assertEqual(history.daily_series("crew_paulo", "resting_heart_rate", days=1)[0]["value"], 71)

    def test_bad_input_is_rejected(self):
        bad = [
            ("crew_nobody", "sleep_duration", 7.0, {}),
            ("crew_paulo", "not_an_indicator", 7.0, {}),
            ("crew_paulo", "sleep_duration", float("nan"), {}),
            ("crew_paulo", "sleep_duration", "abc", {}),
            ("crew_paulo", "chromosomal_aberrations", 1, {}),          # evidence_only
            ("crew_paulo", "sleep_duration", 7.0, {"entry_date": date.today() + timedelta(days=1)}),
            ("crew_paulo", "sleep_duration", 7.0, {"source": "telepathy"}),
        ]
        for crew_id, ind, value, kw in bad:
            with self.subTest(crew_id=crew_id, ind=ind, value=value, kw=kw):
                with self.assertRaises(history.HistoryError):
                    history.add_entry(crew_id, ind, value, **kw)

    def test_purge_keeps_simulated_by_default(self):
        history.add_entry("crew_paulo", "sleep_duration", 7.4)
        self.assertEqual(history.purge_crew("crew_paulo"), 1)
        self.assertGreater(len(history.get_entries("crew_paulo")), 0)
        self.assertGreater(history.purge_crew("crew_paulo", include_simulated=True), 0)
        self.assertEqual(history.get_entries("crew_paulo"), [])

    def test_weekly_indicator_still_gets_a_change(self):
        m = history.change_vs_baseline("crew_angel", "muscle_strength")   # measured once a week
        self.assertIsNotNone(m["pct"])
        self.assertLess(m["pct"], -3)
        self.assertGreaterEqual(m["n_baseline"], 2)

    def test_exercise_decline_is_visible_despite_rest_days(self):
        e = history.change_vs_baseline("crew_angel", "exercise_minutes")
        self.assertLess(e["pct"], -30)

    def test_acute_fever_is_not_hidden_by_the_median(self):
        r = history.change_vs_baseline("crew_said", "body_temperature")
        self.assertEqual(r["level_recent"], "yellow")      # latest 38.x, even if the 7-day median is normal
        self.assertEqual(history.change_vs_baseline("crew_said", "resting_heart_rate")["level_recent"], "yellow")

    def test_demo_criteria_levels_for_angel(self):
        self.assertEqual(history.change_vs_baseline("crew_angel", "exercise_minutes")["level_recent"], "red")
        self.assertEqual(history.change_vs_baseline("crew_angel", "muscle_strength")["level_recent"], "yellow")

    def test_short_history_gives_no_percentage(self):
        history.purge_crew("crew_paulo", include_simulated=True)
        history.add_entry("crew_paulo", "sleep_duration", 7.4)
        r = history.change_vs_baseline("crew_paulo", "sleep_duration")
        self.assertIsNone(r["pct"])
        self.assertEqual(r["n_days"], 1)


if __name__ == "__main__":
    unittest.main()


class LevelTests(unittest.TestCase):
    def setUp(self):
        from . import indicators_by_id
        self.ind = indicators_by_id()

    def test_absolute_limits(self):
        from .levels import level_for
        sleep = self.ind["sleep_duration"]
        self.assertEqual(level_for(sleep, 8.0), "green")
        self.assertEqual(level_for(sleep, 6.5), "yellow")
        self.assertEqual(level_for(sleep, 6.0), "red")     # "six or fewer hours"
        temp = self.ind["body_temperature"]
        self.assertEqual(level_for(temp, 37.9), "green")
        self.assertEqual(level_for(temp, 38.0), "yellow")
        self.assertEqual(level_for(temp, 39.5), "red")

    def test_personal_baseline_direction(self):
        from .levels import level_for
        rt = self.ind["reaction_time"]                      # concern: high
        self.assertEqual(level_for(rt, 250, baseline=250), "green")
        self.assertEqual(level_for(rt, 280, baseline=250), "yellow")
        self.assertEqual(level_for(rt, 300, baseline=250), "red")
        self.assertEqual(level_for(rt, 200, baseline=250), "green")   # faster is not a concern
        self.assertIsNone(level_for(rt, 300))                         # no baseline: no color
        ex = self.ind["exercise_minutes"]                   # concern: low
        self.assertEqual(level_for(ex, 80, baseline=150), "red")
        self.assertEqual(level_for(ex, 200, baseline=150), "green")

    def test_needs_source_has_no_level(self):
        from .levels import level_for
        self.assertIsNone(level_for(self.ind["sleep_quality"], 2, baseline=4))