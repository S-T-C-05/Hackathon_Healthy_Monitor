# Use of AI

Team **PlacebOS** — NASA Space Apps Challenge 2026, Health Monitoring Software.

We used AI assistance during this project and disclose it here, as the challenge requires. A human team member reviewed and is responsible for everything in the repository.

## Tool

- **Claude (Anthropic)** — used as a coding and writing assistant.

## Where AI was used

- **Code**: the FastAPI backend, the data layer (indicators, thresholds, history), the TypeScript integration and camera modules, and the build/integration tooling were written with AI assistance and reviewed by the team.
- **Data curation**: cleaning the NASA reference tables, documenting data issues (e.g. mislabeled reference ranges, likely artifactual values), and structuring the evidence cards and bibliography.
- **Documentation**: README files, this file, and the presentation script.
- **Translations**: the English and French strings of the interface (the app ships in Spanish, English and French).

## Where AI was NOT the source of truth

- The **scientific content** (which indicators matter in space, the cited thresholds, the evidence) comes from the NASA Human Research Program publications and peer-reviewed astronaut studies listed in `data/bibliography.json`, not from the model. The model helped organize and summarize; the team checked each citation.
- The **NASA OSDR data** is real public data; AI helped clean and document it, not generate it.

## Honesty about limits

Consistent with the app itself: the demo mission is simulated, only sleep, pulse and temperature use a cited threshold, and the health texts are drafts that have not been reviewed by a health professional. These limits are stated in the interface and in the README.
