# ApolloCare · Health Monitoring Software

NASA Space Apps Challenge 2026, team **PlacebOS**.

ApolloCare is a web tool for a crew member, far from Earth, to check their own health and get guidance on what to do next:

- **Physical check-in**: vital signs by keyboard or by camera (pulse from video, signs of fatigue, head posture), shown on a human figure with a color code.
- **Emotional wellbeing**: a short guided conversation with optional breathing and grounding exercises.
- **Mission monitor**: each indicator over the mission, compared with the person's own baseline, with the action to take, when to tell the crew medical officer or the flight surgeon, and the astronaut evidence behind it.

It runs in **Spanish, English and French**, reads the interface aloud (TalkBack), accepts voice answers, and keeps working **offline** — because far from Earth there is no live support and the crew is international.

It is a hackathon prototype. It is not a medical device and its colors are not a diagnosis.

## Run it

Requirements: Python 3.10+, Node 18+.

```powershell
python -m venv .venv
.venv\Scripts\activate                 # macOS/Linux: source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --port 8000   # terminal 1, from the repo root

cd frontend                            # terminal 2
npm install
npm run dev                            # open http://localhost:5173
```

The backend creates a local database with a simulated 121-day mission for four crew members. Checks: `python -m data.validate`, `python -m unittest data.test_history backend.test_api`.

## How it is built

| Folder | What it is |
|---|---|
| `data/` | indicators, evidence cards, bibliography, crew, cleaned NASA reference tables, local history (SQLite). See `data/README.md` |
| `backend/` | FastAPI: serves `data/` and the history. See `backend/README.md` |
| `frontend/` | ApolloCare (plain HTML/CSS/JS) + integration and camera modules in TypeScript. See `frontend/README.md` |
| `design/` | the ApolloCare prototype exactly as delivered by the design team |
| `tools/` | `integrate_apollocare.py`: turns the design file into `frontend/index.html` |

## NASA data and evidence

- Evidence cards from *Human Health and Performance Risks of Space Exploration Missions* (NASA SP-2009-3405) and NASA technical reports, plus peer-reviewed astronaut studies. Every card links to its source in `data/bibliography.json`.
- Reference tables cleaned from the NASA Open Science Data Repository (OSDR). Data are courtesy of the NASA Open Science Data Repository (https://osdr.nasa.gov/bio/repo).

## What is real and what is not 

- The mission history is **simulated** for the demo. Real measurements are stored only for crew members who consented, and can be deleted from the app.
- A color comes from a **cited threshold** only where the interface says so. Other ranges are labelled as team demo criteria, and indicators without a published threshold show only the trend.
- Camera pulse (rPPG), fatigue and expression are experimental signals. Face recognition only picks the profile; descriptors stay in the browser.
- Health texts are drafts and have not been reviewed by a health professional.

## Use of AI

Parts of the code, data curation, translations and documentation were written with AI assistance (Claude) and reviewed by the team. Full disclosure in [`AI_USAGE.md`](AI_USAGE.md).
