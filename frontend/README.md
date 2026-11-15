# Frontend

`index.html` is **ApolloCare**, the design team's single-file prototype, plus the integration in `src/apollo/`.
`lab.html` is the original camera test page (React), kept for debugging the vision modules.

## Run

```powershell
# terminal 1, repo root, .venv active
uvicorn backend.main:app --reload --port 8000

# terminal 2
cd frontend
npm install
npm run dev          # http://localhost:5173  (add ?dev=1 to skip the intro)
```

`/api` is proxied to the backend (see `vite.config.ts`). Without the backend ApolloCare still works as the standalone prototype (local profiles, no mission monitor).

## Updating ApolloCare

The design team keeps delivering one HTML file. Do not edit `index.html` by hand; regenerate it:

```powershell
python tools/integrate_apollocare.py path\to\ApolloCare_VXX.html
```

The script applies a handful of marked hooks (`[INTEGRATION]`) and stops, without writing anything, if a new version changed one of those lines.

## What the integration adds (`src/apollo/`)

| File | What it does |
|---|---|
| `main.ts` | entry point: detects the backend, wires everything |
| `api.ts` | client for the FastAPI backend |
| `profiles.ts`, `faceId.ts` | profiles = mission crew; face identification and enrollment (descriptors stay in this browser) |
| `cameraPanel.ts`, `visionSession.ts` | camera card of the physical check-in: rPPG pulse, fatigue signs, head pose, optional expression |
| `checkin.ts` | heart rate, temperature and sleep get their level from the data layer; saving also writes the mission history |
| `monitor.ts`, `chart.ts`, `levels.ts` | mission monitor (state 7): trend, level, action, thresholds, evidence cards and sources |
| `strings.ts`, `i18n.ts` | Spanish / English / French strings, registered in ApolloCare's own language selector |

The camera models (MediaPipe face landmarker, face-api) are downloaded from public CDNs the first time, so the camera features need internet.
