# Backend (FastAPI)

Serves `data/` (indicators, evidence cards, sources, crew, NASA reference) and the local daily history to the frontend.

## Run (from the repo root, `.venv` active)

```powershell
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000
```

Interactive docs: http://127.0.0.1:8000/docs
First start creates `data/runtime/history.db` and loads the simulated mission (gitignored).

## Tests

```powershell
python -m unittest backend.test_api -v
python -m unittest data.test_history -v
python -m data.validate
```

## Endpoints

| Method | Path | What it returns |
|---|---|---|
| GET | `/api/health` | counts, to check the server is up |
| GET | `/api/indicators?system=` | indicator metadata (+ `threshold_basis`) |
| GET | `/api/indicators/{id}` | full indicator |
| GET | `/api/evidence?system=&indicator_id=` | evidence cards |
| GET | `/api/evidence/{card_id}` | card + its source |
| GET | `/api/sources` | bibliography |
| GET | `/api/nasa/reference` | cleaned NASA tables (n=4, pre/post flight) |
| GET | `/api/crew`, `/api/crew/{id}` | crew members (no simulation internals) |
| GET | `/api/crew/{id}/overview` | one row per indicator: baseline, recent, latest, % change, level, action. Worst first |
| GET | `/api/crew/{id}/series/{indicator}?days=` | daily points with level, for charts |
| POST | `/api/crew/{id}/entries` | store one real measurement. 403 no consent, 422 bad value |
| POST | `/api/crew/{id}/camera-session` | send the frontend `SessionSummary`; stores heart rate only if reliable |

## Honesty rules the UI must follow

- `level` is `null` when `threshold_basis` is `"none"`: show only the trend, no color.
- `threshold_basis: "demo_criterion"` means numbers chosen by the team, not from a source: label the color as a demo criterion.
- Camera heart rate is stored as `resting_heart_rate` with source `camera` and a note saying it is not a clinical resting measurement. Fatigue, blinks and head pose are not stored yet (no indicator for them).