"""Pydantic models for the JSON files in data/.

Used by data/validate.py. The backend can import them too, so the API and the
files always agree on field names.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict

System = Literal[
    "cardiovascular",
    "bone_muscle",
    "immune_metabolic",
    "mental_sleep",
    "radiation",
    "environment",
]

# Category text used in hazards.json -> system id used everywhere else.
CATEGORY_TO_SYSTEM: dict[str, System] = {
    "Cardiovascular Health": "cardiovascular",
    "Bone and Muscle Health": "bone_muscle",
    "Immune System and Metabolism": "immune_metabolic",
    "Mental Health and Sleep": "mental_sleep",
    "Space Radiation": "radiation",
    "Mission Environment and Conditions": "environment",
}

Kind = Literal["measured", "self_report", "test", "lab", "environmental", "evidence_only"]
InputMethod = Literal["manual", "camera", "test", "auto", "none"]
Concern = Literal["low", "high", "both", "change"]
EvidenceLevel = Literal["astronaut_core", "modeled", "gap", "indirect", "dataset_only", "none_yet"]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Source(_Strict):
    id: str
    label: str
    title: Optional[str]
    container: Optional[str]
    authors: Optional[list[str]]
    year: Optional[int]
    type: Literal["book_chapter", "journal_article", "nasa_report", "presentation", "web_page", "dataset"]
    pages_cited: Optional[str]
    url: Optional[str]
    doi: Optional[str]
    astronaut_evidence: Optional[bool]
    checked: bool
    notes: Optional[str]


class Rule(_Strict):
    """One sourced cut-off. The app applies the highest level that matches."""

    level: Literal["yellow", "red"]
    op: Literal["<", "<=", ">", ">="]
    value: float
    unit: Optional[str] = None
    source_id: str
    note: Optional[str] = None


class Thresholds(_Strict):
    type: Literal["personal_baseline", "reference_range", "absolute_limits", "none"]
    status: Literal["needs_source", "demo_criterion", "dataset_range", "sourced", "not_applicable"]
    # personal_baseline
    warn_deviation_pct: Optional[float] = None
    alert_deviation_pct: Optional[float] = None
    # reference_range
    unit: Optional[str] = None
    by_sex: Optional[dict[str, dict[str, float]]] = None
    range_note: Optional[str] = None
    # absolute_limits: list of sourced rules (each cites its own source)
    rules: list[Rule] = []
    # Sources that justify the numbers (ids in bibliography.json).
    # Required when status == "sourced".
    source_ids: list[str] = []


class Actions(_Strict):
    yellow: list[str]
    red: list[str]


class Indicator(_Strict):
    id: str
    label: str
    system: System
    kind: Kind
    unit: Optional[str]
    input: InputMethod
    concern_direction: Optional[Concern]
    thresholds: Thresholds
    why_in_space: str
    how_to_measure: str
    actions: Actions
    escalate_when: str
    card_ids: list[str]
    source_ids: list[str]
    evidence_level: EvidenceLevel
    nasa_analyte: Optional[str]
    review_status: Literal["draft", "reviewed"]
    notes: Optional[str]


class Effect(_Strict):
    indicator_id: str
    pattern: Literal["stable", "gradual_decline", "gradual_rise", "acute_rise"]
    starts_day: Optional[int]
    target_change_pct: Optional[float]


class Scenario(_Strict):
    effects: list[Effect]


class FaceEnrollment(_Strict):
    status: Literal["not_enrolled", "enrolled"]
    enrolled_at: Optional[str]
    # Key or file name of the face template stored LOCALLY (browser storage or
    # data/runtime/, which is gitignored). Never put the template itself here.
    template_ref: Optional[str]


class Consent(_Strict):
    face_recognition: bool
    store_daily_history: bool
    consent_date: Optional[str]


class CrewMember(_Strict):
    id: str
    name: str
    role: Optional[str]
    sex: Optional[Literal["M", "F"]]
    age: Optional[int]
    mission_day: int
    mission_length_days: int
    baseline: dict[str, float]
    baseline_status: Literal["placeholder_simulated", "reviewed"]
    demo_story: str
    scenario: Scenario
    # simulated: values come from simulate.py. live: real daily entries.
    # mixed: simulated past plus real entries from today on.
    data_source: Literal["simulated", "live", "mixed"]
    team_member: bool
    face: FaceEnrollment
    consent: Consent


class EvidenceCard(BaseModel):
    """hazards.json. Extra keys allowed so the team can add fields later."""

    model_config = ConfigDict(extra="allow")

    card_id: str
    category: str
    title: str
    scientific_summary: str
    key_findings: list[str]
    population: str
    study_environment: str
    evidence_type: str
    indicators: list[str]
    methods: list[str]
    limitations: list[str]
    operational_relevance: str
    source: str
    source_location: str
    validation_status: str
    source_population_rule: str
    source_publication_year: int
    # Links to the rest of data/ (required; validate.py checks them).
    source_id: Optional[str] = None
    system: Optional[System] = None
    indicator_ids: list[str] = []