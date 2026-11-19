"""Association and descriptive statistics for BehaviourLab.

Spearman's rank correlation with a seeded percentile bootstrap CI for the numeric pairs, and a
Kruskal-Wallis test with epsilon-squared effect size for time-of-day buckets against craving.
See docs/models/behaviour-associations.md for the method, assumptions and limitations.
"""

from __future__ import annotations

import math
import warnings
from collections.abc import Callable, Sequence

import numpy as np
from scipy import stats

from app.behaviour.schemas import (
    CONFIDENCE_LEVEL,
    MIN_N,
    NOTICE,
    NUMERIC_FIELDS,
    RESAMPLES,
    Association,
    AssociationsRequest,
    AssociationsResult,
    FieldSummary,
    ObservationRow,
    RowsRequest,
    Strength,
    SummaryResult,
    TimeBucket,
    TimeBucketId,
)

# Rule-of-thumb cut-offs for describing size in words. They are conventions, not thresholds of
# importance; the model card says so.
RHO_CUTOFFS: tuple[tuple[float, Strength], ...] = (
    (0.1, "negligible"),
    (0.3, "weak"),
    (0.5, "moderate"),
)
EPSILON_CUTOFFS: tuple[tuple[float, Strength], ...] = (
    (0.01, "negligible"),
    (0.06, "weak"),
    (0.14, "moderate"),
)

BUCKETS: tuple[tuple[TimeBucketId, str, range], ...] = (
    ("night", "00:00-05:59", range(0, 6)),
    ("morning", "06:00-11:59", range(6, 12)),
    ("afternoon", "12:00-17:59", range(12, 18)),
    ("evening", "18:00-23:59", range(18, 24)),
)

BUCKET_INDEX: dict[TimeBucketId, int] = {b: i for i, (b, _, _) in enumerate(BUCKETS)}


def strength_label(value: float, cutoffs: tuple[tuple[float, Strength], ...]) -> Strength:
    magnitude = abs(value)
    for limit, label in cutoffs:
        if magnitude < limit:
            return label
    return "strong"


def time_bucket(hour: int) -> TimeBucketId:
    for bucket, _, hours in BUCKETS:
        if hour in hours:
            return bucket
    raise ValueError(f"hour out of range: {hour}")


# Every score is an integer from 0 to 10 and there are four time-of-day buckets, so a sample is
# fully described by a contingency table of counts. Resampling rows with replacement is the same
# as drawing a multinomial table, and resampling participants is the same as summing their
# tables with multinomial weights. Both statistics are computed exactly from the tables, so a
# bootstrap costs O(cells) per resample instead of O(n log n).
LEVELS = 11


def _mid_ranks(counts: np.ndarray) -> np.ndarray:
    """Average (mid) rank of each level, given level counts along the last axis."""
    return np.cumsum(counts, axis=-1) - (counts - 1) / 2


def _tables_spearman(tables: np.ndarray) -> np.ndarray:
    """Spearman's rho (tie-corrected, average ranks) for each (B, Lx, Ly) table of counts."""
    cx = tables.sum(axis=2)
    cy = tables.sum(axis=1)
    n = cx.sum(axis=1, keepdims=True)
    centre = (n + 1) / 2
    rx = _mid_ranks(cx) - centre
    ry = _mid_ranks(cy) - centre
    cov = np.einsum("bij,bi,bj->b", tables, rx, ry)
    var_x = (cx * rx * rx).sum(axis=1)
    var_y = (cy * ry * ry).sum(axis=1)
    with np.errstate(invalid="ignore", divide="ignore"):
        return cov / np.sqrt(var_x * var_y)


def _tables_epsilon_squared(tables: np.ndarray) -> np.ndarray:
    """Kruskal-Wallis epsilon squared for each (B, groups, levels) table of counts.

    Rank epsilon squared: E^2_R = H / ((n^2 - 1) / (n + 1)) = H / (n - 1), with H corrected
    for ties. NaN when fewer than two groups are observed or every value is identical.
    """
    t = tables.sum(axis=1)
    n_g = tables.sum(axis=2)
    n = t.sum(axis=1)
    ranks = _mid_ranks(t)
    rank_sums = np.einsum("bgl,bl->bg", tables, ranks)
    with np.errstate(invalid="ignore", divide="ignore"):
        between = np.where(n_g > 0, rank_sums**2 / np.where(n_g > 0, n_g, 1), 0.0).sum(axis=1)
        h = 12 / (n * (n + 1)) * between - 3 * (n + 1)
        ties = 1 - (t**3 - t).sum(axis=1) / (n**3 - n)
        h = h / ties
        epsilon = h / (n - 1)
    valid = ((n_g > 0).sum(axis=1) >= 2) & (ties > 0) & (n >= 3)
    return np.where(valid, epsilon, np.nan)


def _bootstrap_tables(
    x: np.ndarray, y: np.ndarray, shape: tuple[int, int], keys: Sequence[str | None]
) -> tuple[np.ndarray, np.ndarray | None]:
    """Per-participant count tables (P, cells) with participant codes, or (cells,) and None."""
    cells = x * shape[1] + y
    size = shape[0] * shape[1]
    if not keys or any(key is None for key in keys):
        return np.bincount(cells, minlength=size).astype(float), None
    codes = np.unique(np.asarray(keys, dtype=object), return_inverse=True)[1]
    participants = int(codes.max()) + 1
    per = np.bincount(codes * size + cells, minlength=participants * size)
    return per.reshape(participants, size).astype(float), codes


def _bootstrap(
    x: np.ndarray,
    y: np.ndarray,
    shape: tuple[int, int],
    keys: Sequence[str | None],
    statistic: Callable[[np.ndarray], np.ndarray],
    rng: np.random.Generator,
) -> np.ndarray:
    """RESAMPLES bootstrap replicates of `statistic`, resampling participants when keyed."""
    tables, codes = _bootstrap_tables(x, y, shape, keys)
    out = np.empty(RESAMPLES)
    if codes is None:
        n = int(tables.sum())
        draws = rng.multinomial(n, tables / n, size=RESAMPLES).astype(float)
        return statistic(draws.reshape(RESAMPLES, *shape))
    participants = tables.shape[0]
    chunk = max(1, min(RESAMPLES, 2_000_000 // participants))
    uniform = np.full(participants, 1 / participants)
    for start in range(0, RESAMPLES, chunk):
        stop = min(start + chunk, RESAMPLES)
        weights = rng.multinomial(participants, uniform, size=stop - start).astype(float)
        out[start:stop] = statistic((weights @ tables).reshape(stop - start, *shape))
    return out


def _epsilon_squared(craving: np.ndarray, buckets: np.ndarray) -> tuple[float, float] | None:
    """Kruskal-Wallis H test; returns (epsilon squared, p) or None when it is undefined."""
    groups = [craving[buckets == b] for b in np.unique(buckets)]
    groups = [g for g in groups if g.size > 0]
    if len(groups) < 2 or craving.size < 3:
        return None
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            h, p = stats.kruskal(*groups)
    except ValueError:  # every value identical
        return None
    if not (math.isfinite(h) and math.isfinite(p)):
        return None
    return float(h / (craving.size - 1)), float(p)


def _percentile_ci(samples: np.ndarray) -> tuple[float | None, float | None]:
    finite = samples[np.isfinite(samples)]
    if finite.size < RESAMPLES // 2:
        return None, None
    alpha = (1 - CONFIDENCE_LEVEL) / 2
    low, high = np.quantile(finite, [alpha, 1 - alpha])
    return float(low), float(high)


def _round(value: float | None, digits: int = 4) -> float | None:
    return None if value is None else round(value, digits)


def _insufficient(n: int, reason: str | None = None) -> str:
    if reason:
        return f"Insufficient data: {reason}."
    return f"Insufficient data (n = {n}; at least {MIN_N} paired observations are needed)."


def _spearman_pair(
    rows: Sequence[ObservationRow],
    x_field: str,
    pair: str,
    label: str,
    rng: np.random.Generator,
) -> Association:
    paired = [
        (getattr(row, x_field), row.craving_intensity, row.participant)
        for row in rows
        if getattr(row, x_field) is not None and row.craving_intensity is not None
    ]
    n = len(paired)
    base = {
        "pair": pair,
        "label": label,
        "method": "spearman",
        "statistic": "rho",
        "n": n,
        "p_value_holm": None,
    }
    empty = {
        "sufficient": False,
        "estimate": None,
        "ci_low": None,
        "ci_high": None,
        "p_value": None,
        "strength": None,
        "direction": None,
    }
    if n < MIN_N:
        return Association(**base, **empty, interpretation=_insufficient(n))

    x = np.array([p[0] for p in paired], dtype=float)
    y = np.array([p[1] for p in paired], dtype=float)
    if np.ptp(x) == 0 or np.ptp(y) == 0:
        return Association(
            **base, **empty, interpretation=_insufficient(n, "one of the two scores never varies")
        )

    result = stats.spearmanr(x, y)
    rho = float(result.statistic)
    p_value = float(result.pvalue)
    samples = _bootstrap(
        x.astype(int),
        y.astype(int),
        (LEVELS, LEVELS),
        [p[2] for p in paired],
        _tables_spearman,
        rng,
    )
    ci_low, ci_high = _percentile_ci(samples)
    strength = strength_label(rho, RHO_CUTOFFS)
    direction = None if strength == "negligible" else ("positive" if rho > 0 else "negative")
    words = f"{strength} {direction} association" if direction else "negligible association"
    if ci_low is not None and ci_high is not None and ci_low <= 0 <= ci_high:
        words += "; the 95% interval includes zero, so even the direction is uncertain"
    return Association(
        **base,
        sufficient=True,
        estimate=_round(rho),
        ci_low=_round(ci_low),
        ci_high=_round(ci_high),
        p_value=p_value,
        strength=strength,
        direction=direction,
        interpretation=words[0].upper() + words[1:],
    )


def _time_of_day_pair(rows: Sequence[ObservationRow], rng: np.random.Generator) -> Association:
    paired = [
        (time_bucket(row.observed_at.hour), row.craving_intensity, row.participant)
        for row in rows
        if row.craving_intensity is not None
    ]
    n = len(paired)
    groups: list[TimeBucket] = []
    for bucket, hours, _ in BUCKETS:
        values = np.array([p[1] for p in paired if p[0] == bucket], dtype=float)
        groups.append(
            TimeBucket(
                bucket=bucket,
                hours=hours,
                n=int(values.size),
                mean=_round(float(values.mean()), 3) if values.size else None,
                median=float(np.median(values)) if values.size else None,
            )
        )
    base = {
        "pair": "time_of_day_craving",
        "label": "Time of day and craving",
        "method": "kruskal_wallis",
        "statistic": "epsilon_squared",
        "n": n,
        "p_value_holm": None,
        "groups": groups,
        "direction": None,
    }
    empty = {
        "sufficient": False,
        "estimate": None,
        "ci_low": None,
        "ci_high": None,
        "p_value": None,
        "strength": None,
    }
    if n < MIN_N:
        return Association(**base, **empty, interpretation=_insufficient(n))

    craving = np.array([p[1] for p in paired], dtype=float)
    labels = np.array([p[0] for p in paired], dtype=object)
    point = _epsilon_squared(craving, labels)
    if point is None:
        return Association(
            **base,
            **empty,
            interpretation=_insufficient(
                n, "craving never varies or all observations fall in one time-of-day bucket"
            ),
        )
    epsilon, p_value = point

    samples = _bootstrap(
        np.array([BUCKET_INDEX[p[0]] for p in paired]),
        craving.astype(int),
        (len(BUCKETS), LEVELS),
        [p[2] for p in paired],
        _tables_epsilon_squared,
        rng,
    )
    ci_low, ci_high = _percentile_ci(samples)
    strength = strength_label(epsilon, EPSILON_CUTOFFS)
    words = (
        "Negligible association between time of day and craving"
        if strength == "negligible"
        else f"{strength.capitalize()} association between time of day and craving"
    )
    return Association(
        **base,
        sufficient=True,
        estimate=_round(epsilon),
        ci_low=_round(ci_low),
        ci_high=_round(ci_high),
        p_value=p_value,
        strength=strength,
        interpretation=words,
    )


def holm(p_values: Sequence[float]) -> list[float]:
    """Holm-Bonferroni step-down adjusted p-values, in the input order."""
    m = len(p_values)
    order = sorted(range(m), key=lambda i: p_values[i])
    adjusted = [0.0] * m
    running = 0.0
    for rank, index in enumerate(order):
        running = max(running, min(1.0, (m - rank) * p_values[index]))
        adjusted[index] = running
    return adjusted


def associations(request: AssociationsRequest) -> AssociationsResult:
    rows = request.rows
    rng = np.random.default_rng(request.seed)
    results = [
        _spearman_pair(rows, "stress", "stress_craving", "Stress and craving", rng),
        _spearman_pair(rows, "sleep_quality", "sleep_craving", "Sleep quality and craving", rng),
        _spearman_pair(rows, "mood", "mood_craving", "Mood and craving", rng),
        _time_of_day_pair(rows, rng),
    ]
    tested = [i for i, r in enumerate(results) if r.p_value is not None]
    for index, adjusted in zip(
        tested, holm([results[i].p_value or 0.0 for i in tested]), strict=True
    ):
        results[index].p_value_holm = adjusted

    keys = [row.participant for row in rows]
    clustered = bool(rows) and all(key is not None for key in keys)
    return AssociationsResult(
        associations=results,
        n_rows=len(rows),
        n_participants=len(set(keys)) if clustered else None,
        bootstrap_unit="participant" if clustered else "observation",
        resamples=RESAMPLES,
        confidence_level=CONFIDENCE_LEVEL,
        seed=request.seed,
        min_n=MIN_N,
        synthetic=request.synthetic,
        notice=NOTICE,
    )


def summary(request: RowsRequest) -> SummaryResult:
    total = len(request.rows)
    fields: list[FieldSummary] = []
    for name in NUMERIC_FIELDS:
        values = np.array(
            [v for row in request.rows if (v := getattr(row, name)) is not None], dtype=float
        )
        n = int(values.size)
        missing = total - n
        if n:
            q1, median, q3 = np.quantile(values, [0.25, 0.5, 0.75])
        fields.append(
            FieldSummary(
                field=name,
                n=n,
                missing=missing,
                missing_fraction=round(missing / total, 4) if total else 0.0,
                mean=_round(float(values.mean()), 3) if n else None,
                sd=_round(float(values.std(ddof=1)), 3) if n >= 2 else None,
                min=float(values.min()) if n else None,
                q1=float(q1) if n else None,
                median=float(median) if n else None,
                q3=float(q3) if n else None,
                max=float(values.max()) if n else None,
            )
        )
    return SummaryResult(fields=fields, n_rows=total, synthetic=request.synthetic)
