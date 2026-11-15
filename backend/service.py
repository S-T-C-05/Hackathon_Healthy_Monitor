"""Logic between the API and data/: no HTTP in here, so it is easy to test."""
from __future__ import annotations

from typing import Optional

from data import cards_by_id, get_crew, indicators_by_id, sources_by_id
from data import history
from data.levels import level_for

# What the camera session is allowed to write. Anything else in the session summary
# (fatigue, blinks, head pose...) has no indicator in indicators.json yet.
CAMERA_MIN_DURATION_MS = 30_000     # rPPG needs a stable window
CAMERA_MIN_RELIABLE_PCT = 50        # share of heart readings the app itself flagged as reliable
CAMERA_HR_NOTE = "Camera (rPPG) session average. Not a clinical resting measurement."


def public_member(m: dict) -> dict:
    """Crew member as the frontend may see it (no scenario internals)."""
    return {k: m[k] for k in (
        "id", "name", "role", "sex", "age", "mission_day", "mission_length_days",
        "baseline", "baseline_status", "demo_story", "data_source", "team_member", "face", "consent",
    ) if k in m}


def find_member(crew_id: str) -> Optional[dict]:
    return next((m for m in get_crew() if m["id"] == crew_id), None)


def threshold_basis(ind: dict) -> str:
    """How much the color can be trusted: sourced | dataset_range | demo_criterion | none."""
    st = (ind.get("thresholds") or {}).get("status")
    return st if st in ("sourced", "dataset_range", "demo_criterion") else "none"


def indicator_card(ind: dict) -> dict:
    """Indicator metadata for the UI (everything but the long texts is kept)."""
    return {k: ind.get(k) for k in (
        "id", "label", "system", "kind", "unit", "input", "concern_direction",
        "why_in_space", "how_to_measure", "card_ids", "source_ids", "evidence_level", "review_status",
    )} | {"threshold_basis": threshold_basis(ind), "threshold_type": (ind.get("thresholds") or {}).get("type")}


def overview(crew_id: str) -> dict:
    member = find_member(crew_id)
    inds = indicators_by_id()
    rows = []
    for s in history.summary(crew_id):
        ind = inds[s["indicator_id"]]
        level = s["level_recent"]
        actions = ind.get("actions") or {}
        rows.append({
            **indicator_card(ind),
            "n_days": s["n_days"], "baseline": s["baseline"], "recent": s["recent"],
            "latest": s.get("latest"), "pct": s["pct"], "level": level,
            "action": actions.get(level) if level in ("yellow", "red") else None,
            "escalate_when": ind.get("escalate_when") if level in ("yellow", "red") else None,
        })
    order = {"red": 0, "yellow": 1, "green": 2, None: 3}
    rows.sort(key=lambda r: (order.get(r["level"], 3), r["id"]))
    return {"crew": public_member(member), "indicators": rows}


def series(crew_id: str, indicator_id: str, days: Optional[int]) -> dict:
    ind = indicators_by_id()[indicator_id]
    ch = history.change_vs_baseline(crew_id, indicator_id)
    return {
        "indicator": indicator_card(ind),
        "baseline": ch["baseline"], "recent": ch["recent"], "pct": ch["pct"], "level": ch["level_recent"],
        "points": history.daily_series(crew_id, indicator_id, days=days),
    }


def store_camera_session(crew_id: str, s) -> dict:
    """Turn a camera session into entries. Raises history.ConsentError / HistoryError."""
    stored, skipped = [], []
    ok_duration = s.durationMs >= CAMERA_MIN_DURATION_MS
    if s.avgBpm is None:
        skipped.append({"indicator_id": "resting_heart_rate", "reason": "no_reliable_heart_reading"})
    elif not ok_duration:
        skipped.append({"indicator_id": "resting_heart_rate", "reason": "session_too_short"})
    elif s.heartReliablePct < CAMERA_MIN_RELIABLE_PCT:
        skipped.append({"indicator_id": "resting_heart_rate", "reason": "heart_signal_not_reliable_enough"})
    else:
        eid = history.add_entry(crew_id, "resting_heart_rate", round(s.avgBpm, 1), source="camera", note=CAMERA_HR_NOTE)
        stored.append({"indicator_id": "resting_heart_rate", "value": round(s.avgBpm, 1), "entry_id": eid})
    if s.avgFatigue is not None:
        skipped.append({"indicator_id": "fatigue", "reason": "no_indicator_defined_yet"})
    return {"stored": stored, "skipped": skipped}


# ApolloCare check-in field -> indicator in data/indicators.json.
# Only fields with a matching indicator are evaluated here; the rest (SpO2, breaths, blood
# pressure, glucose) have no cited threshold in the data layer, so the backend says so
# instead of inventing a color.
CHECKIN_FIELD_MAP = {
    "hr": "resting_heart_rate",
    "temp": "body_temperature",
    "sleep": "sleep_duration",
}


def checkin(crew_id: str, values: dict, store: bool) -> dict:
    """Evaluate (and optionally store) a manual check-in. Raises history.ConsentError / HistoryError."""
    member = find_member(crew_id)
    inds = indicators_by_id()
    items, unmapped = [], []
    for field, value in values.items():
        if value is None:
            continue
        indicator_id = CHECKIN_FIELD_MAP.get(field)
        if not indicator_id:
            unmapped.append(field)
            continue
        ind = inds[indicator_id]
        baseline = history.change_vs_baseline(crew_id, indicator_id)["baseline"]
        level = level_for(ind, value, member.get("sex"), baseline=baseline)
        actions = ind.get("actions") or {}
        item = {
            "field": field, "indicator_id": indicator_id, "label": ind["label"], "value": value, "unit": ind["unit"],
            "level": level, "threshold_basis": threshold_basis(ind), "baseline": baseline,
            "action": actions.get(level) if level in ("yellow", "red") else None,
            "escalate_when": ind.get("escalate_when") if level in ("yellow", "red") else None,
            "source_ids": (ind.get("thresholds") or {}).get("source_ids") or [],
            "entry_id": None,
        }
        if store:
            item["entry_id"] = history.add_entry(crew_id, indicator_id, value, source="manual", note="ApolloCare check-in")
        items.append(item)
    return {"crew_id": crew_id, "stored": store, "items": items, "unmapped": sorted(unmapped)}


__all__ = ["cards_by_id", "sources_by_id"]
