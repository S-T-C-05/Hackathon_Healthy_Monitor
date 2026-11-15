"""Request bodies of the API (responses are plain dicts built from data/)."""
from __future__ import annotations

from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class EntryIn(BaseModel):
    """One real measurement typed in by the crew member (or sent by a device)."""
    model_config = ConfigDict(extra="forbid")

    indicator_id: str
    value: float
    entry_date: Optional[date] = Field(None, description="Local day, defaults to today")
    source: Literal["manual", "camera", "auto"] = "manual"
    note: Optional[str] = Field(None, max_length=300)


class CameraSessionIn(BaseModel):
    """Subset of the frontend SessionSummary (vision/aggregate.ts), same camelCase names."""
    model_config = ConfigDict(extra="ignore")

    durationMs: float = Field(ge=0)
    avgBpm: Optional[float] = None
    minBpm: Optional[float] = None
    maxBpm: Optional[float] = None
    heartReliablePct: float = Field(0, ge=0, le=100)
    avgFatigue: Optional[float] = None
    maxFatigue: Optional[float] = None
    faceVisiblePct: Optional[float] = None
