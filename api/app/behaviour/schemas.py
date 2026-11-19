"""Request/response contracts for BehaviourLab analytics. The caps bound compute per request."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

MAX_ROWS = 20_000
MIN_N = 10
RESAMPLES = 1000
CONFIDENCE_LEVEL = 0.95
DEFAULT_SEED = 20261120

NumericField = Literal["mood", "stress", "sleep_quality", "craving_intensity"]
NUMERIC_FIELDS: tuple[NumericField, ...] = ("mood", "stress", "sleep_quality", "craving_intensity")

PairId = Literal["stress_craving", "sleep_craving", "mood_craving", "time_of_day_craving"]
Strength = Literal["negligible", "weak", "moderate", "strong"]
TimeBucketId = Literal["night", "morning", "afternoon", "evening"]

NOTICE = (
    "Associations, not causes. These are rank-based associations in observational, self-reported "
    "data. They do not show that one factor causes another: unmeasured factors (confounders) can "
    "produce the same pattern, several pairs are tested at once, and self-report is imperfect. "
    "They describe the study group as a whole and say nothing about, and must not be used to "
    "predict or diagnose, any individual."
)


class ObservationRow(BaseModel):
    """One self-reported observation. Scores are 0-10; null means not answered."""

    observed_at: datetime = Field(
        description="When the observation was made. Send the local wall time with its UTC offset "
        "(for example 2026-11-20T19:30:00+03:00); time-of-day buckets use the hour as given."
    )
    participant: str | None = Field(
        default=None,
        max_length=64,
        pattern=r"^[A-Za-z0-9_-]+$",
        description="Pseudonymous participant key. When present, the bootstrap resamples "
        "participants rather than single observations, which respects repeated measures.",
    )
    mood: int | None = Field(default=None, ge=0, le=10)
    stress: int | None = Field(default=None, ge=0, le=10)
    sleep_quality: int | None = Field(default=None, ge=0, le=10)
    craving_intensity: int | None = Field(default=None, ge=0, le=10)


class RowsRequest(BaseModel):
    rows: list[ObservationRow] = Field(max_length=MAX_ROWS)
    synthetic: bool = Field(
        default=True,
        description="Whether the rows are synthetic. Echoed back so it stays labelled.",
    )


class AssociationsRequest(RowsRequest):
    seed: int = Field(default=DEFAULT_SEED, ge=0, le=2**32 - 1)


class TimeBucket(BaseModel):
    bucket: TimeBucketId
    hours: str
    n: int
    mean: float | None
    median: float | None


class Association(BaseModel):
    pair: PairId
    label: str
    method: Literal["spearman", "kruskal_wallis"]
    statistic: Literal["rho", "epsilon_squared"]
    n: int
    sufficient: bool
    estimate: float | None
    ci_low: float | None
    ci_high: float | None
    p_value: float | None
    p_value_holm: float | None = Field(
        description="Holm-adjusted across the pairs in this response that had enough data."
    )
    strength: Strength | None
    direction: Literal["positive", "negative"] | None
    interpretation: str
    groups: list[TimeBucket] | None = None


class AssociationsResult(BaseModel):
    associations: list[Association]
    n_rows: int
    n_participants: int | None
    bootstrap_unit: Literal["participant", "observation"]
    resamples: int
    confidence_level: float
    seed: int
    min_n: int
    synthetic: bool
    notice: str


class FieldSummary(BaseModel):
    field: NumericField
    n: int
    missing: int
    missing_fraction: float
    mean: float | None
    sd: float | None
    min: float | None
    q1: float | None
    median: float | None
    q3: float | None
    max: float | None


class SummaryResult(BaseModel):
    fields: list[FieldSummary]
    n_rows: int
    synthetic: bool
