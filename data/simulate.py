"""Generates the simulated mission history for the crew in crew.json.

    python -m data.simulate                      # history ends yesterday
    python -m data.simulate --end-date 2026-11-14 --seed 7

Writes (both gitignored):
    data/runtime/simulated_entries.csv   one row per crew member, day and indicator
    data/runtime/simulation_meta.json    seed, dates, parameters

Everything here is INVENTED. The values follow the scenarios in crew.json and
the numbers in the SIM_* tables below, which are design choices for the demo,
not NASA data and not clinical thresholds. The NASA data (pre/post flight
only) lives in data/nasa/ and is not mixed into this history.

The history covers mission days 1..mission_day and ends on --end-date
(default: yesterday), so "today" is the first day of real entries.
"""
from __future__ import annotations

import argparse
import csv
import json
import random
import sys
from datetime import date, datetime, timedelta, timezone

from . import RUNTIME_DIR, get_crew, indicators_by_id
from .levels import level_for

# ---------------------------------------------------------------- design choices
# Day-to-day noise (standard deviation, in the indicator's unit).
SIM_NOISE_SD = {
    "sleep_duration": 0.3, "reaction_time": 8.0, "exercise_minutes": 10.0,
    "resting_heart_rate": 2.5, "body_temperature": 0.15, "muscle_strength": 1.5,
}
SIM_DECIMALS = {
    "sleep_duration": 2, "reaction_time": 0, "exercise_minutes": 0,
    "resting_heart_rate": 0, "body_temperature": 1, "muscle_strength": 1,
}
# One measurement every N mission days.
SIM_EVERY_N_DAYS = {"reaction_time": 2, "muscle_strength": 7}
# Value when crew.json has no baseline for the indicator (muscle strength is
# "% of own baseline", so its baseline is 100 by definition).
SIM_FALLBACK_BASELINE = {"muscle_strength": 100.0}
# Exercise: one rest day in seven (the 2009 report describes 6 of 7 days).
SIM_EXERCISE_REST_EVERY = 7
# Size of each effect when crew.json leaves target_change_pct empty.
#   ("pct", x): x percent of the baseline.  ("abs", x): x units of the indicator.
SIM_DEFAULT_EFFECT = {
    ("sleep_duration", "gradual_decline"): ("pct", 25.0),
    ("reaction_time", "gradual_rise"): ("pct", 20.0),
    ("exercise_minutes", "gradual_decline"): ("pct", 45.0),
    ("muscle_strength", "gradual_decline"): ("pct", 8.0),
    ("body_temperature", "acute_rise"): ("abs", 1.9),
    ("resting_heart_rate", "acute_rise"): ("abs", 38.0),
}
SIM_GRADUAL_DAYS = 45   # default length of a gradual effect that has no starts_day
SIM_ACUTE_DAYS = 4      # default length of an acute effect that has no starts_day (it plateaus on the last day before the end)
SIM_MIN_VALUE = {"sleep_duration": 2.0, "reaction_time": 120.0, "exercise_minutes": 0.0,
                 "resting_heart_rate": 35.0, "body_temperature": 34.0, "muscle_strength": 40.0}


def _effect_delta(effect: dict, baseline: float) -> float:
    """Total change reached at the last day, with sign."""
    pattern = effect["pattern"]
    sign = -1.0 if pattern == "gradual_decline" else 1.0
    if effect.get("target_change_pct") is not None:
        return sign * baseline * abs(effect["target_change_pct"]) / 100.0
    key = (effect["indicator_id"], pattern)
    if key not in SIM_DEFAULT_EFFECT:
        raise SystemExit(f"No size for effect {key}: set target_change_pct in crew.json or add it to SIM_DEFAULT_EFFECT")
    kind, x = SIM_DEFAULT_EFFECT[key]
    return sign * (baseline * x / 100.0 if kind == "pct" else x)


def _progress(day: int, start: int, end: int, pattern: str) -> float:
    if pattern == "acute_rise":
        end -= 1  # reach the plateau one day early so the last two days show the full effect
    if day <= start:
        return 0.0
    t = min(1.0, (day - start) / max(1, end - start))
    return t * t * (3 - 2 * t) if pattern == "acute_rise" else t  # smoothstep for acute


def simulate_member(member: dict, seed: int, ind_by_id: dict) -> list[dict]:
    mission_day = member["mission_day"]
    effects = {e["indicator_id"]: e for e in member["scenario"]["effects"]}
    wanted = list(dict.fromkeys([*member["baseline"], *effects]))
    rows = []
    for ind_id in wanted:
        if ind_id not in ind_by_id:
            raise SystemExit(f"{member['id']}: unknown indicator {ind_id}")
        baseline = member["baseline"].get(ind_id, SIM_FALLBACK_BASELINE.get(ind_id))
        if baseline is None:
            print(f"skip {member['id']}/{ind_id}: no baseline", file=sys.stderr)
            continue
        rng = random.Random(f"{seed}|{member['id']}|{ind_id}")
        eff = effects.get(ind_id)
        if eff and eff["pattern"] != "stable":
            delta = _effect_delta(eff, baseline)
            acute = eff["pattern"] == "acute_rise"
            start = eff["starts_day"] if eff["starts_day"] is not None else mission_day - (SIM_ACUTE_DAYS if acute else SIM_GRADUAL_DAYS)
        else:
            delta, start = 0.0, mission_day
        every = SIM_EVERY_N_DAYS.get(ind_id, 1)
        for day in range(1, mission_day + 1):
            if (mission_day - day) % every != 0:
                continue
            rest_day = ind_id == "exercise_minutes" and day % SIM_EXERCISE_REST_EVERY == 0
            if rest_day:
                value = 0.0
            else:
                value = baseline + delta * _progress(day, start, mission_day, eff["pattern"] if eff else "stable")
                value += rng.gauss(0.0, SIM_NOISE_SD.get(ind_id, 0.0))
                value = max(SIM_MIN_VALUE.get(ind_id, 0.0), value)
            rows.append({"crew_id": member["id"], "mission_day": day, "indicator_id": ind_id,
                         "value": round(value, SIM_DECIMALS.get(ind_id, 2)), "unit": ind_by_id[ind_id]["unit"]})
    return rows


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Generate the simulated mission history.")
    ap.add_argument("--end-date", help="Last simulated day, YYYY-MM-DD (default: yesterday)")
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args(argv)

    end = date.fromisoformat(args.end_date) if args.end_date else date.today() - timedelta(days=1)
    crew, ind_by_id = get_crew(), indicators_by_id()
    all_rows: list[dict] = []
    for m in crew:
        if m["data_source"] == "live":
            continue  # live members have only real entries
        for r in simulate_member(m, args.seed, ind_by_id):
            r["date"] = (end - timedelta(days=m["mission_day"] - r["mission_day"])).isoformat()
            r["source"] = "simulated"
            all_rows.append(r)

    all_rows.sort(key=lambda r: (r["crew_id"], r["date"], r["indicator_id"]))
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    fields = ["crew_id", "date", "mission_day", "indicator_id", "value", "unit", "source"]
    with open(RUNTIME_DIR / "simulated_entries.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows({k: r[k] for k in fields} for r in all_rows)
    (RUNTIME_DIR / "simulation_meta.json").write_text(json.dumps({
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "seed": args.seed, "end_date": end.isoformat(), "rows": len(all_rows),
        "crew": [m["id"] for m in crew if m["data_source"] != "live"],
        "note": "Invented data for the demo. Design parameters are the SIM_* tables in data/simulate.py.",
    }, indent=2) + "\n", encoding="utf-8")

    print(f"{len(all_rows)} rows -> {RUNTIME_DIR / 'simulated_entries.csv'} (ends {end.isoformat()})")
    if not args.quiet:
        _summary(crew, all_rows, ind_by_id)
    return 0


def _summary(crew: list[dict], rows: list[dict], ind_by_id: dict) -> None:
    last: dict[tuple, dict] = {}
    for r in rows:
        last[(r["crew_id"], r["indicator_id"])] = r
    print(f"\n{'crew':<14}{'indicator':<20}{'last':>8}{'vs base':>10}  level")
    for m in crew:
        for ind_id in dict.fromkeys([*m["baseline"], *(e["indicator_id"] for e in m["scenario"]["effects"])]):
            r = last.get((m["id"], ind_id))
            if not r:
                continue
            base = m["baseline"].get(ind_id, SIM_FALLBACK_BASELINE.get(ind_id))
            pct = f"{(r['value'] / base - 1) * 100:+.0f}%" if base else ""
            lvl = level_for(ind_by_id[ind_id], r["value"], m.get("sex"), baseline=base) or "trend only"
            print(f"{m['name']:<14}{ind_id:<20}{r['value']:>8}{pct:>10}  {lvl}")


if __name__ == "__main__":
    sys.exit(main())