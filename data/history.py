"""Local history of daily entries (one SQLite file, never committed).

    python -m data.history init
    python -m data.history load-sim
    python -m data.history add crew_zelinda sleep_duration 7.2
    python -m data.history show crew_zelinda sleep_duration --days 14
    python -m data.history stats crew_zelinda
    python -m data.history purge crew_zelinda --yes

Database: data/runtime/history.db (gitignored). Set HEALTH_HISTORY_DB to use
another file (the tests do).

Privacy rules enforced here:
  * Only simulated rows can be written for a person who has not given
    consent.store_daily_history in crew.json (ConsentError otherwise).
  * `purge` deletes a person's real entries (and optionally all of them).
  * Face templates are NOT stored here (see the README).

Design choices (not clinical): the personal baseline is the median of the
values in the first BASELINE_DAYS calendar days of a person's history, and
"recent" is the median of the values in the last RECENT_DAYS calendar days.
Windows are counted in days, not in measurements, so an indicator measured
once a week still works. Medians keep one noisy day from moving the result.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import sqlite3
import sys
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from statistics import median
from typing import Iterator, Optional

from . import RUNTIME_DIR, get_crew, indicators_by_id
from .levels import level_for

SCHEMA_VERSION = "1"
SOURCES = ("simulated", "manual", "camera", "test", "auto")
BASELINE_DAYS = 14
RECENT_DAYS = 7


class HistoryError(ValueError):
    """Bad input (unknown crew member or indicator, bad value or date)."""


class ConsentError(PermissionError):
    """Tried to store real data for someone without consent."""


# ------------------------------------------------------------------ connection
def db_path() -> Path:
    return Path(os.environ.get("HEALTH_HISTORY_DB") or RUNTIME_DIR / "history.db")


_SCHEMA = """
CREATE TABLE IF NOT EXISTS entries (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    crew_id      TEXT NOT NULL,
    indicator_id TEXT NOT NULL,
    entry_date   TEXT NOT NULL,           -- local calendar day, YYYY-MM-DD
    measured_at  TEXT NOT NULL,           -- UTC ISO timestamp
    mission_day  INTEGER,
    value        REAL NOT NULL,
    unit         TEXT,
    source       TEXT NOT NULL CHECK (source IN ('simulated','manual','camera','test','auto')),
    note         TEXT,
    UNIQUE (crew_id, indicator_id, measured_at, source)
);
CREATE INDEX IF NOT EXISTS i_entries ON entries (crew_id, indicator_id, entry_date);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""


@contextmanager
def connect(path: Optional[Path] = None) -> Iterator[sqlite3.Connection]:
    p = Path(path) if path else db_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(p)
    con.row_factory = sqlite3.Row
    try:
        con.executescript(_SCHEMA)
        con.execute("INSERT OR IGNORE INTO meta VALUES ('schema_version', ?)", (SCHEMA_VERSION,))
        yield con
        con.commit()
    except BaseException:
        con.rollback()
        raise
    finally:
        con.close()


# ------------------------------------------------------------------ helpers
def _member(crew_id: str) -> dict:
    for m in get_crew():
        if m["id"] == crew_id:
            return m
    raise HistoryError(f"unknown crew member: {crew_id}")


def _indicator(indicator_id: str) -> dict:
    ind = indicators_by_id().get(indicator_id)
    if ind is None:
        raise HistoryError(f"unknown indicator: {indicator_id}")
    return ind


def _sim_end_date() -> Optional[date]:
    meta = RUNTIME_DIR / "simulation_meta.json"
    if not meta.exists():
        return None
    return date.fromisoformat(json.loads(meta.read_text(encoding="utf-8"))["end_date"])


def _mission_day(member: dict, entry_date: date) -> Optional[int]:
    end = _sim_end_date()
    return None if end is None else member["mission_day"] + (entry_date - end).days


# ------------------------------------------------------------------ writing
def load_simulated(csv_path: Optional[Path] = None, path: Optional[Path] = None) -> int:
    """Load simulated_entries.csv. Safe to repeat: it replaces the simulated rows of the people in the file."""
    csv_path = Path(csv_path) if csv_path else RUNTIME_DIR / "simulated_entries.csv"
    if not csv_path.exists():
        raise HistoryError(f"{csv_path} not found. Run `python -m data.simulate` first.")
    with open(csv_path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    ids = {r["crew_id"] for r in rows}
    for cid in ids:
        _member(cid)
    with connect(path) as con:
        con.executemany(
            "DELETE FROM entries WHERE crew_id = ? AND source = 'simulated'", [(c,) for c in ids]
        )
        con.executemany(
            "INSERT INTO entries (crew_id, indicator_id, entry_date, measured_at, mission_day, value, unit, source)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, 'simulated')",
            [
                (r["crew_id"], r["indicator_id"], r["date"], f"{r['date']}T12:00:00+00:00",
                 int(r["mission_day"]), float(r["value"]), r["unit"] or None)
                for r in rows
            ],
        )
    return len(rows)


def add_entry(
    crew_id: str,
    indicator_id: str,
    value: float,
    *,
    entry_date: Optional[date] = None,
    source: str = "manual",
    measured_at: Optional[datetime] = None,
    note: Optional[str] = None,
    path: Optional[Path] = None,
) -> int:
    """Store one real measurement. Returns the new row id."""
    member = _member(crew_id)
    ind = _indicator(indicator_id)
    if source not in SOURCES:
        raise HistoryError(f"source must be one of {SOURCES}")
    if source != "simulated" and not member["consent"]["store_daily_history"]:
        raise ConsentError(f"{crew_id} has not given consent to store daily history (crew.json)")
    try:
        value = float(value)
    except (TypeError, ValueError):
        raise HistoryError(f"value is not a number: {value!r}") from None
    if not math.isfinite(value):
        raise HistoryError("value must be a finite number")
    if ind["kind"] == "evidence_only":
        raise HistoryError(f"{indicator_id} is explanation-only, it has no measurements")
    entry_date = entry_date or date.today()
    if entry_date > date.today():
        raise HistoryError("entry_date is in the future")
    measured_at = (measured_at or datetime.now(timezone.utc)).astimezone(timezone.utc)
    with connect(path) as con:
        cur = con.execute(
            "INSERT INTO entries (crew_id, indicator_id, entry_date, measured_at, mission_day, value, unit, source, note)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (crew_id, indicator_id, entry_date.isoformat(), measured_at.isoformat(timespec="seconds"),
             _mission_day(member, entry_date), value, ind["unit"], source, note),
        )
        return int(cur.lastrowid)


def purge_crew(crew_id: str, include_simulated: bool = False, path: Optional[Path] = None) -> int:
    """Delete a person's real entries (all of them if include_simulated). Returns deleted rows."""
    _member(crew_id)
    sql = "DELETE FROM entries WHERE crew_id = ?" + ("" if include_simulated else " AND source != 'simulated'")
    with connect(path) as con:
        return con.execute(sql, (crew_id,)).rowcount


# ------------------------------------------------------------------ reading
def get_entries(
    crew_id: str,
    indicator_id: Optional[str] = None,
    since: Optional[date] = None,
    until: Optional[date] = None,
    path: Optional[Path] = None,
) -> list[dict]:
    sql, args = "SELECT * FROM entries WHERE crew_id = ?", [crew_id]
    if indicator_id:
        sql += " AND indicator_id = ?"; args.append(indicator_id)
    if since:
        sql += " AND entry_date >= ?"; args.append(since.isoformat())
    if until:
        sql += " AND entry_date <= ?"; args.append(until.isoformat())
    sql += " ORDER BY entry_date, measured_at, id"
    with connect(path) as con:
        return [dict(r) for r in con.execute(sql, args)]


def daily_series(crew_id: str, indicator_id: str, days: Optional[int] = None, path: Optional[Path] = None) -> list[dict]:
    """One value per day (the last measurement of the day), oldest first, with its traffic-light level."""
    member, ind = _member(crew_id), _indicator(indicator_id)
    last: dict[str, dict] = {}
    for e in get_entries(crew_id, indicator_id, path=path):
        last[e["entry_date"]] = e
    # Personal-baseline criteria need the person's own baseline (median of their first days).
    base = None
    if last:
        first = date.fromisoformat(min(last))
        early = [e["value"] for d, e in last.items() if date.fromisoformat(d) < first + timedelta(days=BASELINE_DAYS)]
        base = median(early) if early else None
    out = [
        {"date": d, "mission_day": e["mission_day"], "value": e["value"], "unit": e["unit"],
         "source": e["source"], "level": level_for(ind, e["value"], member.get("sex"), baseline=base)}
        for d, e in sorted(last.items())
    ]
    return out[-days:] if days else out


def change_vs_baseline(
    crew_id: str,
    indicator_id: str,
    baseline_days: int = BASELINE_DAYS,
    recent_days: int = RECENT_DAYS,
    path: Optional[Path] = None,
) -> dict:
    """Recent median against the person's own baseline (median of their first days).

    Windows are calendar days. pct is None until the history spans at least
    baseline_days + recent_days days, or if either window has no values.
    """
    member, ind = _member(crew_id), _indicator(indicator_id)
    series = daily_series(crew_id, indicator_id, path=path)
    res = {"crew_id": crew_id, "indicator_id": indicator_id, "n_days": len(series),
           "n_baseline": 0, "n_recent": 0, "baseline": None, "recent": None, "pct": None, "level_recent": None}
    if not series:
        return res
    dates = [date.fromisoformat(d["date"]) for d in series]
    first, last = dates[0], dates[-1]
    if (last - first).days + 1 < baseline_days + recent_days:
        return res
    base_vals = [d["value"] for d, dt in zip(series, dates) if dt < first + timedelta(days=baseline_days)]
    recent_vals = [d["value"] for d, dt in zip(series, dates) if dt > last - timedelta(days=recent_days)]
    if not base_vals or not recent_vals:
        return res
    base, recent = median(base_vals), median(recent_vals)
    # Absolute limits and lab ranges are safety signals: judge the latest daily value,
    # because a 7-day median would hide a fever that started 3 days ago.
    # Personal-baseline criteria (slow trends) are judged on the recent median.
    th_type = (ind.get("thresholds") or {}).get("type")
    judged = recent if th_type == "personal_baseline" else series[-1]["value"]
    res.update(n_baseline=len(base_vals), n_recent=len(recent_vals), baseline=round(base, 2),
               recent=round(recent, 2), latest=series[-1]["value"],
               level_recent=level_for(ind, judged, member.get("sex"), baseline=base))
    if base:
        res["pct"] = round((recent / base - 1) * 100, 1)
    return res


def summary(crew_id: str, path: Optional[Path] = None) -> list[dict]:
    """change_vs_baseline for every indicator that has entries."""
    with connect(path) as con:
        ids = [r[0] for r in con.execute(
            "SELECT DISTINCT indicator_id FROM entries WHERE crew_id = ? ORDER BY indicator_id", (crew_id,))]
    return [change_vs_baseline(crew_id, i, path=path) for i in ids]


# ------------------------------------------------------------------ CLI
def _fmt(x) -> str:
    return "-" if x is None else str(x)


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m data.history", description="Local daily-entry history.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("init", help="create the database")
    p = sub.add_parser("load-sim", help="load runtime/simulated_entries.csv"); p.add_argument("--csv")
    p = sub.add_parser("add", help="store one real measurement")
    p.add_argument("crew_id"); p.add_argument("indicator_id"); p.add_argument("value", type=float)
    p.add_argument("--date"); p.add_argument("--source", default="manual", choices=SOURCES); p.add_argument("--note")
    p = sub.add_parser("show", help="daily series of one indicator")
    p.add_argument("crew_id"); p.add_argument("indicator_id"); p.add_argument("--days", type=int, default=14)
    p = sub.add_parser("stats", help="recent vs baseline for each indicator"); p.add_argument("crew_id")
    p = sub.add_parser("purge", help="delete a person's real entries")
    p.add_argument("crew_id"); p.add_argument("--include-simulated", action="store_true"); p.add_argument("--yes", action="store_true")
    a = ap.parse_args(argv)

    try:
        if a.cmd == "init":
            with connect():
                pass
            print("ready:", db_path())
        elif a.cmd == "load-sim":
            print(f"{load_simulated(a.csv)} simulated rows loaded into {db_path()}")
        elif a.cmd == "add":
            rid = add_entry(a.crew_id, a.indicator_id, a.value,
                            entry_date=date.fromisoformat(a.date) if a.date else None, source=a.source, note=a.note)
            print("saved entry", rid)
        elif a.cmd == "show":
            print(f"{'date':<12}{'day':>5}{'value':>9}  {'source':<10}level")
            for d in daily_series(a.crew_id, a.indicator_id, days=a.days):
                print(f"{d['date']:<12}{_fmt(d['mission_day']):>5}{d['value']:>9}  {d['source']:<10}{d['level'] or 'trend only'}")
        elif a.cmd == "stats":
            print(f"{'indicator':<22}{'days':>5}{'baseline':>10}{'recent':>9}{'change':>9}  level   (n base/recent)")
            for r in summary(a.crew_id):
                pct = "-" if r["pct"] is None else f"{r['pct']:+.1f}%"
                print(f"{r['indicator_id']:<22}{r['n_days']:>5}{_fmt(r['baseline']):>10}{_fmt(r['recent']):>9}{pct:>9}  {(r['level_recent'] or 'trend only'):<11}({r['n_baseline']}/{r['n_recent']})")
        elif a.cmd == "purge":
            if not a.yes:
                print("This deletes data. Run again with --yes to confirm.", file=sys.stderr)
                return 1
            print(purge_crew(a.crew_id, a.include_simulated), "rows deleted")
    except (HistoryError, ConsentError) as e:
        print("error:", e, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())