"""Checks the JSON files in data/ and how they point at each other.

    python -m data.validate

Exit code 1 if there are errors (use it in CI). Warnings do not fail.
"""
from __future__ import annotations

import sys
from collections import Counter

from pydantic import ValidationError

from . import (
    get_bibliography, get_crew, get_hazards, get_indicators,
    get_nasa_cmp, get_nasa_ranges,
)
from .schema import CATEGORY_TO_SYSTEM, CrewMember, EvidenceCard, Indicator, Source


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []

    def parse(model, rows, name):
        out = []
        for i, row in enumerate(rows):
            try:
                out.append(model(**row))
            except ValidationError as e:
                errors.append(f"{name}[{i}] ({row.get('id') or row.get('card_id')}): {e.errors()[0]['loc']} {e.errors()[0]['msg']}")
        return out

    cards = parse(EvidenceCard, get_hazards(), "hazards.json")
    inds = parse(Indicator, get_indicators(), "indicators.json")
    srcs = parse(Source, get_bibliography(), "bibliography.json")
    crew = parse(CrewMember, get_crew(), "crew.json")

    # unique ids
    for name, ids in (
        ("hazards.json", [c.card_id for c in cards]),
        ("indicators.json", [i.id for i in inds]),
        ("bibliography.json", [s.id for s in srcs]),
        ("crew.json", [c.id for c in crew]),
    ):
        for k, n in Counter(ids).items():
            if n > 1:
                errors.append(f"{name}: duplicate id {k}")

    card_ids = {c.card_id for c in cards}
    ind_ids = {i.id for i in inds}
    src_by_id = {s.id: s for s in srcs}

    # categories of the cards must be known
    for c in cards:
        if c.category not in CATEGORY_TO_SYSTEM:
            errors.append(f"hazards.json {c.card_id}: unknown category '{c.category}'")

    # cards -> sources / system / indicators (and back)
    import re
    ind_ids_for_card: dict[str, set[str]] = {}
    for i in inds:
        for cid in i.card_ids:
            ind_ids_for_card.setdefault(cid, set()).add(i.id)
    for c in cards:
        if c.source_id is None or c.system is None:
            errors.append(f"hazards.json {c.card_id}: missing source_id or system")
            continue
        if c.source_id not in src_by_id:
            errors.append(f"hazards.json {c.card_id}: source_id {c.source_id} not in bibliography.json")
        m = re.search(r"Chapter (\d+)", c.source)
        if m and c.source_id != f"nasa-sp-2009-3405-ch{m.group(1)}":
            warnings.append(f"hazards.json {c.card_id}: source_id {c.source_id} does not match 'Chapter {m.group(1)}' in its source text")
        if CATEGORY_TO_SYSTEM.get(c.category) != c.system:
            errors.append(f"hazards.json {c.card_id}: system {c.system} does not match category '{c.category}'")
        for iid in c.indicator_ids:
            if iid not in ind_ids:
                errors.append(f"hazards.json {c.card_id}: indicator_id {iid} not in indicators.json")
        if set(c.indicator_ids) != ind_ids_for_card.get(c.card_id, set()):
            errors.append(f"hazards.json {c.card_id}: indicator_ids {sorted(c.indicator_ids)} disagree with indicators.json card_ids {sorted(ind_ids_for_card.get(c.card_id, set()))}")

    # indicators -> cards / sources
    covered: set[str] = set()
    used_sources: set[str] = set()
    for i in inds:
        for cid in i.card_ids:
            if cid not in card_ids:
                errors.append(f"indicators.json {i.id}: card_id {cid} not in hazards.json")
            else:
                covered.add(cid)
                card_system = CATEGORY_TO_SYSTEM.get(next(c.category for c in cards if c.card_id == cid))
                if card_system and card_system != i.system:
                    warnings.append(f"indicators.json {i.id}: system {i.system} differs from card {cid} ({card_system})")
        for sid in i.source_ids:
            if sid not in src_by_id:
                errors.append(f"indicators.json {i.id}: source_id {sid} not in bibliography.json")
            else:
                used_sources.add(sid)
        if i.thresholds.status == "needs_source" and i.kind != "evidence_only":
            warnings.append(f"indicators.json {i.id}: thresholds still need a source")
        if i.thresholds.status == "demo_criterion":
            t = i.thresholds
            if t.type != "personal_baseline" or t.warn_deviation_pct is None or t.alert_deviation_pct is None:
                errors.append(f"indicators.json {i.id}: demo_criterion needs personal_baseline with warn and alert percentages")
            elif t.warn_deviation_pct >= t.alert_deviation_pct:
                errors.append(f"indicators.json {i.id}: warn_deviation_pct must be lower than alert_deviation_pct")
            warnings.append(f"indicators.json {i.id}: thresholds are a team demo criterion (not from a source)")
        if i.thresholds.status == "sourced":
            if not i.thresholds.source_ids:
                errors.append(f"indicators.json {i.id}: status 'sourced' but thresholds.source_ids is empty")
            for sid in i.thresholds.source_ids:
                if sid not in src_by_id:
                    errors.append(f"indicators.json {i.id}: thresholds source {sid} not in bibliography.json")
                elif not src_by_id[sid].checked:
                    errors.append(f"indicators.json {i.id}: thresholds source {sid} has checked=false (open it first)")
            if i.thresholds.type == "absolute_limits":
                if not i.thresholds.rules:
                    errors.append(f"indicators.json {i.id}: 'sourced' absolute_limits needs at least one rule")
                for r in i.thresholds.rules:
                    if r.source_id not in src_by_id:
                        errors.append(f"indicators.json {i.id}: rule source {r.source_id} not in bibliography.json")
                    elif not src_by_id[r.source_id].checked:
                        errors.append(f"indicators.json {i.id}: rule source {r.source_id} has checked=false (open it first)")
                    if r.source_id not in i.thresholds.source_ids:
                        errors.append(f"indicators.json {i.id}: rule source {r.source_id} missing from thresholds.source_ids")
            if i.thresholds.type == "personal_baseline" and (
                i.thresholds.warn_deviation_pct is None or i.thresholds.alert_deviation_pct is None
            ):
                errors.append(f"indicators.json {i.id}: 'sourced' personal_baseline needs warn and alert percentages")
    for cid in sorted(card_ids - covered):
        errors.append(f"hazards.json {cid}: no indicator points at this card")

    # sources
    for sid in sorted(used_sources):
        if not src_by_id[sid].checked:
            warnings.append(f"bibliography.json {sid}: used but checked=false")
    for sid in sorted(set(src_by_id) - used_sources):
        warnings.append(f"bibliography.json {sid}: not used by any indicator")

    # crew
    for c in crew:
        for k in c.baseline:
            if k not in ind_ids:
                errors.append(f"crew.json {c.id}: baseline key {k} not in indicators.json")
        for e in c.scenario.effects:
            if e.indicator_id not in ind_ids:
                errors.append(f"crew.json {c.id}: effect indicator {e.indicator_id} not in indicators.json")
        if c.sex is None or c.age is None:
            warnings.append(f"crew.json {c.id}: sex/age not set")
        if c.face.status == "enrolled" and not c.consent.face_recognition:
            errors.append(f"crew.json {c.id}: face enrolled without consent.face_recognition")
        if c.data_source != "simulated" and not c.consent.store_daily_history:
            errors.append(f"crew.json {c.id}: real data without consent.store_daily_history")
        if c.consent.face_recognition and not c.consent.consent_date:
            errors.append(f"crew.json {c.id}: consent given but consent_date is empty")
        if c.face.template_ref and len(c.face.template_ref) > 120:
            errors.append(f"crew.json {c.id}: face.template_ref looks like raw template data. Store only a key or file name")

    # NASA link: analytes exist and embedded ranges match the processed file
    try:
        ranges = get_nasa_ranges()
        cmp_doc = get_nasa_cmp()
        analytes = {a for s in cmp_doc["subjects"].values() for a in s["analytes"]}
        for i in inds:
            if i.nasa_analyte:
                if i.nasa_analyte not in analytes:
                    errors.append(f"indicators.json {i.id}: nasa_analyte {i.nasa_analyte} not in cmp_by_subject.json")
                elif i.thresholds.by_sex:
                    for sex, r in i.thresholds.by_sex.items():
                        if ranges[i.nasa_analyte][sex] != r:
                            errors.append(f"indicators.json {i.id}: {sex} range differs from processed ranges (rerun build_nasa)")
    except FileNotFoundError:
        warnings.append("data/nasa/processed not found: run `python -m data.nasa.build_nasa`")

    print(f"cards={len(cards)} indicators={len(inds)} sources={len(srcs)} crew={len(crew)}")
    for w in warnings:
        print("WARN ", w)
    for e in errors:
        print("ERROR", e)
    print(f"{len(errors)} error(s), {len(warnings)} warning(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())