"""FastAPI app: serves data/ and the local history to the frontend.

Run from the repo root (with the .venv active):

    uvicorn backend.main:app --reload --port 8000

Docs: http://127.0.0.1:8000/docs
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from data import (
    cards_by_id, get_bibliography, get_crew, get_hazards, get_indicators, get_nasa_cmp, get_nasa_radiation,
    get_nasa_ranges, indicators_by_id, sources_by_id,
)
from data import history, simulate

from . import service
from .schemas import CameraSessionIn, EntryIn


def ensure_demo_history() -> None:
    """First run: create the local database and fill it with the simulated mission."""
    with history.connect() as con:
        n = con.execute("SELECT COUNT(*) FROM entries WHERE source = 'simulated'").fetchone()[0]
    if n == 0:
        simulate.main(["--quiet"])
        history.load_simulated()


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_demo_history()
    yield


app = FastAPI(title="Healthy Monitor API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],  # Vite dev server
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def _member_or_404(crew_id: str) -> dict:
    m = service.find_member(crew_id)
    if not m:
        raise HTTPException(404, f"unknown crew member: {crew_id}")
    return m


def _indicator_or_404(indicator_id: str) -> dict:
    ind = indicators_by_id().get(indicator_id)
    if not ind:
        raise HTTPException(404, f"unknown indicator: {indicator_id}")
    return ind


# ------------------------------------------------------------------ reference data
@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "crew": len(get_crew()), "indicators": len(get_indicators()), "cards": len(get_hazards())}


@app.get("/api/indicators")
def list_indicators(system: Optional[str] = None) -> list[dict]:
    return [service.indicator_card(i) for i in get_indicators() if system in (None, i["system"])]


@app.get("/api/indicators/{indicator_id}")
def get_indicator(indicator_id: str) -> dict:
    ind = _indicator_or_404(indicator_id)
    return {**ind, "threshold_basis": service.threshold_basis(ind)}


@app.get("/api/evidence")
def list_evidence(system: Optional[str] = None, indicator_id: Optional[str] = None) -> list[dict]:
    return [
        c for c in get_hazards()
        if system in (None, c.get("system")) and (indicator_id is None or indicator_id in c.get("indicator_ids", []))
    ]


@app.get("/api/evidence/{card_id}")
def get_evidence(card_id: str) -> dict:
    card = cards_by_id().get(card_id)
    if not card:
        raise HTTPException(404, f"unknown evidence card: {card_id}")
    src = sources_by_id().get(card.get("source_id"))
    return {**card, "source_detail": src}


@app.get("/api/sources")
def list_sources() -> list[dict]:
    return get_bibliography()


@app.get("/api/nasa/reference")
def nasa_reference() -> dict:
    return {"cmp_by_subject": get_nasa_cmp(), "reference_ranges": get_nasa_ranges(), "radiation_by_charge": get_nasa_radiation()}


# ------------------------------------------------------------------ crew and history
@app.get("/api/crew")
def list_crew() -> list[dict]:
    return [service.public_member(m) for m in get_crew()]


@app.get("/api/crew/{crew_id}")
def get_member(crew_id: str) -> dict:
    return service.public_member(_member_or_404(crew_id))


@app.get("/api/crew/{crew_id}/overview")
def crew_overview(crew_id: str) -> dict:
    _member_or_404(crew_id)
    return service.overview(crew_id)


@app.get("/api/crew/{crew_id}/series/{indicator_id}")
def crew_series(crew_id: str, indicator_id: str, days: Optional[int] = Query(None, ge=1, le=400)) -> dict:
    _member_or_404(crew_id)
    _indicator_or_404(indicator_id)
    return service.series(crew_id, indicator_id, days)


@app.post("/api/crew/{crew_id}/entries", status_code=201)
def add_entry(crew_id: str, body: EntryIn) -> dict:
    _member_or_404(crew_id)
    try:
        entry_id = history.add_entry(
            crew_id, body.indicator_id, body.value, entry_date=body.entry_date, source=body.source, note=body.note,
        )
    except history.ConsentError as e:
        raise HTTPException(403, str(e)) from e
    except history.HistoryError as e:
        raise HTTPException(422, str(e)) from e
    return {"entry_id": entry_id}


@app.post("/api/crew/{crew_id}/camera-session", status_code=201)
def camera_session(crew_id: str, body: CameraSessionIn) -> dict:
    _member_or_404(crew_id)
    try:
        return service.store_camera_session(crew_id, body)
    except history.ConsentError as e:
        raise HTTPException(403, str(e)) from e
    except history.HistoryError as e:
        raise HTTPException(422, str(e)) from e