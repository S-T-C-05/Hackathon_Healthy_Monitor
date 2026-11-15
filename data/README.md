# data/

Data layer of the health monitoring app: evidence cards, indicators, sources, the simulated crew, and the NASA datasets we use.

## Files

| File | What it is | Edited by |
|---|---|---|
| `hazards.json` | Evidence cards (one per finding or evidence gap), astronaut-only core evidence | hand |
| `indicators.json` | What the app measures or explains: thresholds, why it matters, actions | hand |
| `bibliography.json` | Every source (book chapters, papers, datasets) | hand |
| `crew.json` | The 4 crew members (team members), scenario, consent and face-enrollment status | hand |
| `simulate.py` | Generates the simulated mission into `runtime/simulated_entries.csv` (invented data, see the `SIM_*` tables) | hand |
| `history.py` | Local SQLite history of daily entries (`runtime/history.db`), consent checks, baseline and recent-change queries | hand |
| `test_history.py` | Tests for `history.py` and `simulate.py` | hand |
| `levels.py` | `level_for(indicator, value)`: green / yellow / red from the sourced thresholds, `None` if there are none | hand |
| `schema.py` | Pydantic models of the JSON files | hand |
| `validate.py` | Checks fields and cross-references | run it |
| `nasa/build_nasa.py` | Builds `nasa/processed/*.json` from the SQLite database | run it |
| `runtime/` | Generated files, not committed | generated |

## How the files point at each other

```
indicators.json --card_ids--> hazards.json (card_id)
indicators.json --source_ids--> bibliography.json (id)
crew.json (baseline keys, effects) --> indicators.json (id)
indicators.json --nasa_analyte--> nasa/processed/cmp_by_subject.json
```

IDs are the only link. Never copy text between files.

## Commands (from the repo root)

```bash
python -m data.nasa.build_nasa   # rebuild the NASA JSON files
python -m data.validate          # must print 0 error(s)
python -m data.simulate          # generate the simulated mission
python -m data.history load-sim  # load it into the local history database
python -m unittest data.test_history -v   # run the tests
```

## NASA data used

| Dataset | Used for | Notes |
|---|---|---|
| LSDS-8 (comprehensive metabolic panel) | Lab reference ranges and pre/post-flight examples | 4 crew members, pre- and post-flight only. Not in-flight data. |
| pbio.3000669, S1 Data (Fig. 2) | Radiation: contribution by charge | Fig. 7 has a suspect value and is not used |
| LSDS-64, GLDS-530 | In the database, not exported yet | NPQ units / group means only |

Cleaning rules are listed at the top of `nasa/build_nasa.py`. Licenses and exact citations are still to be confirmed (see `nasa/processed/MANIFEST.json`).

## Honesty rules

- With n = 4 there are no population ranges. The app compares each person with their own baseline.
- Threshold statuses: `sourced` (cited source), `dataset_range` (lab range from the NASA file), `demo_criterion` (round numbers chosen by the team for the demo, NOT from a source: the app must label them as such) and `needs_source` (no numbers: show only the trend).
- Cards marked `gap` are research gaps. Do not present them as demonstrated astronaut outcomes.
- Crew values start as simulated (`data_source: "simulated"`). Real entries only count if the person gave consent. `review_status: "draft"` means a person with a health background has not reviewed the text.

## Privacy: faces and daily history

The repo is public, so it must never contain biometric or personal health data.

- `crew.json` stores only the profile, consent flags and a `face.template_ref` (a key or file name). **Never the face template itself.**
- Face templates live only on the device (browser storage) or in `data/runtime/face_templates/`, which is gitignored.
- The daily history (one row per person, day and indicator) goes into a local database in `data/runtime/`, also gitignored. The public demo uses simulated data.
- A person is only enrolled if `consent.face_recognition` is true and has a `consent_date`. `validate.py` fails otherwise.

## Consent

The four crew members (team members) gave consent for face recognition and for storing real daily data. It is recorded in `crew.json` (`consent.*`, dated 2026-11-14). Keep a written record outside the repo and use `python -m data.history purge CREW --yes` if someone withdraws.

## NASA data: licenses and acknowledgement

- NASA says there are no restrictions on the use of OSDR data and asks users to acknowledge the source. Each dataset may carry its own license: confirm on its OSDR page.
- Use this acknowledgement: "Data are courtesy of the NASA Open Science Data Repository (https://osdr.nasa.gov/bio/repo)". The preferred citation is the dataset citation button on each OSD page.
- LSDS-8 and LSDS-64 look like the Inspiration4 crew (4 civilians, about 3 days in flight), but the identifiers are not confirmed. OSD-530 is listed by SOMA as a JAXA study, so it is probably a different cohort: do not join it with the CMP or urine data.
- The radiation table comes from Simonsen et al., PLoS Biology 2020 (open access; the PDF links CC0).