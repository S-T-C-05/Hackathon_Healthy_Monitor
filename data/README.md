# data/

Data layer of the health monitoring app: evidence cards, indicators, sources, the simulated crew, and the NASA datasets we use.

## Files

| File | What it is | Edited by |
|---|---|---|
| `hazards.json` | Evidence cards (one per finding or evidence gap), astronaut-only core evidence | hand |
| `indicators.json` | What the app measures or explains: thresholds, why it matters, actions | hand |
| `bibliography.json` | Every source (book chapters, papers, datasets) | hand |
| `crew.json` | Simulated crew for the demo (`simulated: true`) | hand |
| `simulate.py` | Generates the simulated mission into `runtime/` | hand |
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
- `thresholds.status = "needs_source"` means there is no cited threshold yet. The app must not present it as a clinical limit.
- Cards marked `gap` are research gaps. Do not present them as demonstrated astronaut outcomes.
- Everything in `crew.json` is simulated. `review_status: "draft"` means a person with a health background has not reviewed the text.
