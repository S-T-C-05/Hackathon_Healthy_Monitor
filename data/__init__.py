"""Loaders for everything in data/.

    from data import get_indicators, get_crew, get_nasa_cmp

Files are read once and cached. Call `reload()` after editing a JSON file.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent
NASA_PROCESSED = DATA_DIR / "nasa" / "processed"
RUNTIME_DIR = DATA_DIR / "runtime"


def _load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=None)
def get_hazards() -> list[dict]:
    """Evidence cards (one per finding or evidence gap)."""
    return _load(DATA_DIR / "hazards.json")


@lru_cache(maxsize=None)
def get_indicators() -> list[dict]:
    return _load(DATA_DIR / "indicators.json")


@lru_cache(maxsize=None)
def get_bibliography() -> list[dict]:
    return _load(DATA_DIR / "bibliography.json")


@lru_cache(maxsize=None)
def get_crew() -> list[dict]:
    return _load(DATA_DIR / "crew.json")


@lru_cache(maxsize=None)
def get_nasa_cmp() -> dict:
    """Cleaned NASA CMP data per subject (pre/post flight)."""
    return _load(NASA_PROCESSED / "cmp_by_subject.json")


@lru_cache(maxsize=None)
def get_nasa_ranges() -> dict:
    return _load(NASA_PROCESSED / "cmp_reference_ranges.json")


@lru_cache(maxsize=None)
def get_nasa_radiation() -> dict:
    return _load(NASA_PROCESSED / "radiation_by_charge.json")


def indicators_by_id() -> dict[str, dict]:
    return {i["id"]: i for i in get_indicators()}


def sources_by_id() -> dict[str, dict]:
    return {s["id"]: s for s in get_bibliography()}


def cards_by_id() -> dict[str, dict]:
    return {c["card_id"]: c for c in get_hazards()}


def reload() -> None:
    for fn in (
        get_hazards, get_indicators, get_bibliography, get_crew,
        get_nasa_cmp, get_nasa_ranges, get_nasa_radiation,
    ):
        fn.cache_clear()
