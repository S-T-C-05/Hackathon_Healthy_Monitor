"""Build the small JSON files the app reads from the cleaned NASA SQLite database.

Run from the repo root:
    python -m data.nasa.build_nasa

Input : data/nasa/nasa_health_data.db   (read only)
Output: data/nasa/processed/*.json      (generated, safe to delete and rebuild)

Cleaning rules (see the data catalog, section 3):
  1. Reference ranges: one range per analyte and sex. C003 (female) has male
     ranges in her three pre-flight timepoints, so those rows are not used to
     define ranges. We use the most frequent lab range per analyte and sex.
  2. Flags (low / high / normal) are recomputed with those ranges, not taken
     from the file's `out_of_range` column.
  3. Values with a `qc_flag` (suspected pre-analytical artifacts at R+45) are
     kept but marked, and never used to compute a personal baseline.
  4. BUN/CREATININE RATIO that is NA is recalculated as BUN / creatinine and
     marked `recalculated`. This is an inference from the data, not something
     the lab file states.
  5. Both eGFR columns are dropped (race-based formulas are no longer
     recommended; CKD-EPI 2021 needs age, which the file does not have).
  6. Personal baseline = mean of the clean pre-flight values per subject and
     analyte. n is 4 crew members: there are no population ranges.
"""
from __future__ import annotations

import json
import sqlite3
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
DB_PATH = HERE / "nasa_health_data.db"
OUT_DIR = HERE / "processed"

DROP_ANALYTES = {"eGFR AFRICAN AMERICAN", "eGFR NON-AFR. AMERICAN"}
# Rows that carry the wrong sex's reference range (see rule 1).
RANGE_EXCLUDE = {("C003", "pre")}

# The database notes are in Spanish; the app is in English.
QC_EN = {
    "glucosa<50: revisar artefacto preanalitico": "glucose_below_50_check_preanalytical_artifact",
    "K>5.5: revisar hemolisis": "potassium_above_5_5_check_hemolysis",
}
NA_EN = {
    "sin dato": "no_data",
    "ratio no reportado por el laboratorio (probablemente dentro de rango)": "ratio_not_reported_by_lab",
}


def _rows(con: sqlite3.Connection, sql: str) -> list[dict]:
    con.row_factory = sqlite3.Row
    return [dict(r) for r in con.execute(sql)]


def build_ranges(rows: list[dict]) -> dict:
    counts: dict[tuple, Counter] = defaultdict(Counter)
    units: dict[str, str] = {}
    for r in rows:
        if r["ref_min"] is None or r["ref_max"] is None:
            continue
        if (r["subject_id"], r["phase"]) in RANGE_EXCLUDE:
            continue
        counts[(r["analyte"], r["sex"])][(r["ref_min"], r["ref_max"])] += 1
        units[r["analyte"]] = r["units"]
    ranges: dict[str, dict] = {}
    for (analyte, sex), counter in sorted(counts.items()):
        (lo, hi), _ = counter.most_common(1)[0]
        entry = ranges.setdefault(analyte, {"unit": units[analyte]})
        entry[sex] = {"min": lo, "max": hi}
    return ranges


def flag_for(value, rng) -> str | None:
    if value is None or rng is None:
        return None
    if value < rng["min"]:
        return "low"
    if value > rng["max"]:
        return "high"
    return "normal"


def build_cmp(rows: list[dict], ranges: dict) -> tuple[dict, dict]:
    stats = Counter()
    by_key: dict[tuple, dict] = {}
    for r in rows:
        by_key[(r["subject_id"], r["timepoint"], r["analyte"])] = r

    subjects: dict[str, dict] = {}
    for r in rows:
        subj = subjects.setdefault(r["subject_id"], {"sex": r["sex"], "analytes": {}})
        a = r["analyte"]
        value = r["value"]
        recalculated = False
        if a == "BUN/CREATININE RATIO" and value is None:
            bun = by_key.get((r["subject_id"], r["timepoint"], "UREA NITROGEN (BUN)"))
            cre = by_key.get((r["subject_id"], r["timepoint"], "CREATININE"))
            if bun and cre and bun["value"] is not None and cre["value"]:
                value = round(bun["value"] / cre["value"], 1)
                recalculated = True
                stats["bun_cr_ratio_recalculated"] += 1
        rng = ranges.get(a, {}).get(r["sex"])
        qc = (r["qc_flag"] or "").strip() or None
        if qc:
            qc = QC_EN.get(qc, qc)
        if qc:
            stats["qc_flagged_points"] += 1
        node = subj["analytes"].setdefault(a, {"unit": r["units"], "points": []})
        node["points"].append(
            {
                "timepoint": r["timepoint"],
                "phase": r["phase"],
                "days": r["days"],
                "value": value,
                "flag": flag_for(value, rng),
                "qc": qc,
                "recalculated": recalculated,
                "na_reason": NA_EN.get(r["value_na_reason"], r["value_na_reason"]) or None if value is None else None,
            }
        )

    for subj in subjects.values():
        for node in subj["analytes"].values():
            node["points"].sort(key=lambda p: p["days"] if p["phase"] == "pre" else 10_000 + p["days"])
            clean_pre = [
                p["value"]
                for p in node["points"]
                if p["phase"] == "pre" and p["value"] is not None and not p["qc"]
            ]
            base = round(sum(clean_pre) / len(clean_pre), 4) if clean_pre else None
            node["baseline"] = base
            node["n_baseline"] = len(clean_pre)
            for p in node["points"]:
                if base and p["value"] is not None:
                    p["pct_vs_baseline"] = round((p["value"] / base - 1) * 100, 1)
                else:
                    p["pct_vs_baseline"] = None
    return {"subjects": subjects}, dict(stats)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)

    cmp_rows = [
        r
        for r in _rows(con, "SELECT * FROM cmp")
        if r["analyte"] not in DROP_ANALYTES
    ]
    ranges = build_ranges(cmp_rows)
    cmp_doc, stats = build_cmp(cmp_rows, ranges)
    cmp_doc["notes"] = [
        "Reference ranges recomputed per sex; C003 pre-flight rows (male ranges) not used.",
        "Points with `qc` set are suspected artifacts: kept, never used for baselines.",
        "`recalculated` = BUN/creatinine ratio computed from BUN and creatinine (inference).",
        "eGFR columns dropped. n = 4 crew members: personal baselines only, no population ranges.",
        "Timepoints are pre-flight (L-) and post-flight (R+). This is not in-flight data.",
    ]

    radiation = _rows(
        con,
        "SELECT charge_z, fluence_contrib_pct, dose_contrib_pct, dose_equiv_contrib_pct, source "
        "FROM radiation_charge_contrib ORDER BY charge_z",
    )

    tables = {
        t: con.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
        for (t,) in con.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }

    def dump(name: str, obj) -> None:
        (OUT_DIR / name).write_text(
            json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )

    dump("cmp_reference_ranges.json", ranges)
    dump("cmp_by_subject.json", cmp_doc)
    dump("radiation_by_charge.json", {"source": "pbio.3000669 S1 Data, Fig. 2", "rows": radiation})
    dump(
        "MANIFEST.json",
        {
            "generated_on": date.today().isoformat(),
            "database": DB_PATH.name,
            "table_row_counts": tables,
            "datasets": [
                {"id": "lsds-8", "used_in": ["cmp_by_subject.json", "cmp_reference_ranges.json"], "license": "TO_CONFIRM"},
                {"id": "pbio-3000669", "used_in": ["radiation_by_charge.json"], "license": "TO_CONFIRM"},
                {"id": "lsds-64", "used_in": [], "license": "TO_CONFIRM", "note": "In the database, not exported yet (NPQ units, no clinical ranges)."},
                {"id": "glds-530", "used_in": [], "license": "TO_CONFIRM", "note": "In the database, not exported yet (group means only)."},
            ],
            "cleaning_stats": stats,
        },
    )
    print("OK ->", OUT_DIR)
    print("analytes with ranges:", len(ranges), "| stats:", stats)


if __name__ == "__main__":
    main()
