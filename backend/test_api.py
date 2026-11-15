"""API tests. Run from the repo root:  python -m unittest backend.test_api -v"""
import os
import tempfile
import unittest
from pathlib import Path

_tmp = tempfile.TemporaryDirectory()
os.environ["HEALTH_HISTORY_DB"] = str(Path(_tmp.name) / "api_test.db")

from fastapi.testclient import TestClient  # noqa: E402

from data import get_crew  # noqa: E402
from backend.main import app  # noqa: E402


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._ctx = TestClient(app)
        cls.c = cls._ctx.__enter__()      # runs lifespan: creates and fills the temp DB

    @classmethod
    def tearDownClass(cls):
        cls._ctx.__exit__(None, None, None)
        _tmp.cleanup()

    def test_health_and_reference_data(self):
        h = self.c.get("/api/health").json()
        self.assertEqual((h["crew"], h["indicators"], h["cards"]), (4, 21, 19))
        self.assertEqual(len(self.c.get("/api/indicators").json()), 21)
        self.assertEqual(len(self.c.get("/api/indicators?system=mental_sleep").json()) > 0, True)
        card = self.c.get("/api/evidence/ASTRA-COG-001").json()
        self.assertEqual(card["source_detail"]["id"], "jones2022")
        self.assertEqual(self.c.get("/api/evidence/NOPE").status_code, 404)
        self.assertIn("cmp_by_subject", self.c.get("/api/nasa/reference").json())

    def test_crew_has_no_scenario_internals(self):
        crew = self.c.get("/api/crew").json()
        self.assertEqual([m["name"] for m in crew], ["Zelinda", "Paulo", "Angel", "Said"])
        self.assertNotIn("scenario", crew[0])

    def test_overview_tells_the_demo_story(self):
        ov = {r["id"]: r for r in self.c.get("/api/crew/crew_zelinda/overview").json()["indicators"]}
        self.assertEqual(ov["sleep_duration"]["level"], "red")
        self.assertEqual(ov["sleep_duration"]["threshold_basis"], "sourced")
        self.assertTrue(ov["sleep_duration"]["action"])
        self.assertEqual(ov["reaction_time"]["threshold_basis"], "demo_criterion")
        first = self.c.get("/api/crew/crew_zelinda/overview").json()["indicators"][0]
        self.assertEqual(first["level"], "red")             # worst first
        said = {r["id"]: r for r in self.c.get("/api/crew/crew_said/overview").json()["indicators"]}
        self.assertEqual(said["body_temperature"]["level"], "yellow")   # fever is not hidden by the median

    def test_series_has_levels_for_demo_criteria(self):
        s = self.c.get("/api/crew/crew_angel/series/exercise_minutes?days=7").json()
        self.assertEqual(len(s["points"]), 7)
        self.assertEqual(s["points"][-1]["level"], "red")
        self.assertEqual(s["indicator"]["threshold_basis"], "demo_criterion")

    def test_not_found(self):
        self.assertEqual(self.c.get("/api/crew/nobody/overview").status_code, 404)
        self.assertEqual(self.c.get("/api/crew/crew_paulo/series/nope").status_code, 404)

    def test_add_entry_and_validation(self):
        r = self.c.post("/api/crew/crew_paulo/entries", json={"indicator_id": "sleep_duration", "value": 7.1})
        self.assertEqual(r.status_code, 201)
        self.assertEqual(self.c.post("/api/crew/crew_paulo/entries", json={"indicator_id": "sleep_duration", "value": 7.1, "source": "simulated"}).status_code, 422)
        self.assertEqual(self.c.post("/api/crew/crew_paulo/entries", json={"indicator_id": "nope", "value": 1}).status_code, 422)
        self.assertEqual(self.c.post("/api/crew/crew_paulo/entries", json={"indicator_id": "sleep_duration", "value": 7, "entry_date": "2999-01-01"}).status_code, 422)
        self.assertEqual(self.c.post("/api/crew/crew_paulo/entries", json={"indicator_id": "cns_function", "value": 1}).status_code, 422)  # evidence-only

    def test_camera_session_rules(self):
        ok = {"durationMs": 90_000, "avgBpm": 71.4, "heartReliablePct": 80, "avgFatigue": 20}
        r = self.c.post("/api/crew/crew_zelinda/camera-session", json=ok).json()
        self.assertEqual(r["stored"][0]["indicator_id"], "resting_heart_rate")
        self.assertEqual(r["skipped"][0]["reason"], "no_indicator_defined_yet")
        short = self.c.post("/api/crew/crew_zelinda/camera-session", json={**ok, "durationMs": 5000}).json()
        self.assertEqual(short["stored"], [])
        self.assertEqual(short["skipped"][0]["reason"], "session_too_short")
        weak = self.c.post("/api/crew/crew_zelinda/camera-session", json={**ok, "heartReliablePct": 10}).json()
        self.assertEqual(weak["skipped"][0]["reason"], "heart_signal_not_reliable_enough")
        none = self.c.post("/api/crew/crew_zelinda/camera-session", json={"durationMs": 90_000, "avgBpm": None}).json()
        self.assertEqual(none["skipped"][0]["reason"], "no_reliable_heart_reading")

    def test_consent_is_enforced_with_403(self):
        crew = get_crew()
        crew[0]["consent"]["store_daily_history"] = False      # cached list: restore afterwards
        try:
            r = self.c.post("/api/crew/crew_zelinda/entries", json={"indicator_id": "sleep_duration", "value": 7})
            self.assertEqual(r.status_code, 403)
        finally:
            crew[0]["consent"]["store_daily_history"] = True


if __name__ == "__main__":
    unittest.main()