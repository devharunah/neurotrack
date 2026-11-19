from datetime import UTC, datetime, timedelta

import numpy as np
import pytest
from fastapi.testclient import TestClient
from scipy import stats

from app.behaviour.stats import (
    LEVELS,
    RHO_CUTOFFS,
    _tables_epsilon_squared,
    _tables_spearman,
    holm,
    strength_label,
    time_bucket,
)

START = datetime(2026, 10, 1, tzinfo=UTC)


def make_rows(n: int, *, seed: int = 0, participants: int | None = 12) -> list[dict]:
    """Craving rises with stress, falls with sleep quality and mood, and peaks in the evening."""
    rng = np.random.default_rng(seed)
    rows = []
    for i in range(n):
        observed = START + timedelta(hours=int(rng.integers(0, 24 * 30)))
        stress = int(rng.integers(0, 11))
        sleep = int(rng.integers(0, 11))
        mood = int(rng.integers(0, 11))
        evening = 2.5 if observed.hour >= 18 else 0.0
        craving = 0.6 * stress - 0.4 * sleep - 0.3 * mood + evening + 4 + rng.normal(0, 1.2)
        row = {
            "observed_at": observed.isoformat(),
            "stress": stress,
            "sleep_quality": sleep,
            "mood": mood,
            "craving_intensity": int(np.clip(round(craving), 0, 10)),
        }
        if participants:
            row["participant"] = f"S-{i % participants:04d}"
        rows.append(row)
    return rows


def by_pair(body: dict) -> dict[str, dict]:
    return {a["pair"]: a for a in body["associations"]}


@pytest.mark.parametrize("participants", [12, None])
def test_known_correlations_have_the_right_sign(client: TestClient, participants: int | None):
    response = client.post(
        "/behaviour/associations",
        json={"rows": make_rows(600, participants=participants), "synthetic": True},
    )
    assert response.status_code == 200
    body = response.json()
    pairs = by_pair(body)

    assert pairs["stress_craving"]["estimate"] > 0.3
    assert pairs["stress_craving"]["direction"] == "positive"
    assert pairs["sleep_craving"]["estimate"] < -0.15
    assert pairs["sleep_craving"]["direction"] == "negative"
    assert pairs["mood_craving"]["estimate"] < 0
    assert pairs["time_of_day_craving"]["estimate"] > 0.01
    assert pairs["time_of_day_craving"]["method"] == "kruskal_wallis"
    groups = {g["bucket"]: g for g in pairs["time_of_day_craving"]["groups"]}
    assert groups["evening"]["mean"] > groups["morning"]["mean"]

    assert body["synthetic"] is True
    assert body["notice"].startswith("Associations, not causes")
    assert body["bootstrap_unit"] == ("participant" if participants else "observation")
    assert body["resamples"] == 1000


def test_ci_contains_the_estimate_and_p_values_are_adjusted(client: TestClient):
    body = client.post("/behaviour/associations", json={"rows": make_rows(300)}).json()
    for pair in body["associations"]:
        assert pair["sufficient"] is True
        assert pair["ci_low"] <= pair["estimate"] <= pair["ci_high"], pair["pair"]
        assert 0 <= pair["p_value"] <= pair["p_value_holm"] <= 1
        assert pair["n"] == 300


def test_independent_scores_read_as_negligible_or_uncertain(client: TestClient):
    rng = np.random.default_rng(3)
    rows = [
        {
            "observed_at": (START + timedelta(hours=i)).isoformat(),
            "stress": int(rng.integers(0, 11)),
            "craving_intensity": int(rng.integers(0, 11)),
        }
        for i in range(400)
    ]
    body = client.post("/behaviour/associations", json={"rows": rows}).json()
    stress = by_pair(body)["stress_craving"]
    assert abs(stress["estimate"]) < 0.15
    assert stress["ci_low"] < 0 < stress["ci_high"]


def test_results_are_reproducible_with_a_seed(client: TestClient):
    payload = {"rows": make_rows(120), "seed": 99}
    first = client.post("/behaviour/associations", json=payload).json()
    second = client.post("/behaviour/associations", json=payload).json()
    assert first == second


def test_small_n_is_insufficient_data(client: TestClient):
    body = client.post("/behaviour/associations", json={"rows": make_rows(9)}).json()
    assert body["min_n"] == 10
    for pair in body["associations"]:
        assert pair["sufficient"] is False
        assert pair["estimate"] is None
        assert pair["ci_low"] is None and pair["p_value"] is None
        assert "Insufficient data" in pair["interpretation"]


def test_pairs_count_only_rows_with_both_scores(client: TestClient):
    rows = make_rows(40)
    for row in rows[:35]:
        row.pop("stress")
    pairs = by_pair(client.post("/behaviour/associations", json={"rows": rows}).json())
    assert pairs["stress_craving"]["n"] == 5
    assert pairs["stress_craving"]["sufficient"] is False
    assert pairs["mood_craving"]["n"] == 40


def test_constant_scores_are_not_computable(client: TestClient):
    rows = [
        {
            "observed_at": (START + timedelta(hours=i)).isoformat(),
            "stress": 5,
            "craving_intensity": i % 11,
        }
        for i in range(30)
    ]
    body = client.post("/behaviour/associations", json={"rows": rows}).json()
    stress = by_pair(body)["stress_craving"]
    assert stress["sufficient"] is False
    assert "never varies" in stress["interpretation"]


@pytest.mark.parametrize(
    "bad",
    [
        {"stress": 11},
        {"mood": -1},
        {"craving_intensity": 3.5},
        {"participant": "Jane Doe"},
        {"observed_at": "not a date"},
    ],
)
def test_bad_ranges_return_422(client: TestClient, bad: dict):
    row = {"observed_at": START.isoformat(), "stress": 3, "craving_intensity": 4, **bad}
    for path in ("/behaviour/associations", "/behaviour/summary"):
        assert client.post(path, json={"rows": [row]}).status_code == 422


def test_too_many_rows_return_422(client: TestClient):
    row = {"observed_at": START.isoformat()}
    response = client.post("/behaviour/summary", json={"rows": [row] * 20_001})
    assert response.status_code == 422


def test_no_token_returns_401(anon_client: TestClient):
    for path in ("/behaviour/associations", "/behaviour/summary"):
        assert anon_client.post(path, json={"rows": []}).status_code == 401


def test_summary_statistics(client: TestClient):
    rows = [
        {"observed_at": START.isoformat(), "stress": s, "craving_intensity": None}
        for s in (1, 2, 3, 4, 5)
    ]
    rows.append({"observed_at": START.isoformat(), "stress": None, "craving_intensity": 2})
    body = client.post("/behaviour/summary", json={"rows": rows, "synthetic": False}).json()
    fields = {f["field"]: f for f in body["fields"]}
    assert body["n_rows"] == 6
    assert body["synthetic"] is False

    stress = fields["stress"]
    assert stress["n"] == 5 and stress["missing"] == 1
    assert stress["missing_fraction"] == pytest.approx(1 / 6, abs=1e-4)
    assert stress["mean"] == 3 and stress["median"] == 3
    assert stress["q1"] == 2 and stress["q3"] == 4
    assert stress["sd"] == pytest.approx(1.581, abs=1e-3)
    assert stress["min"] == 1 and stress["max"] == 5

    mood = fields["mood"]
    assert mood["n"] == 0 and mood["missing_fraction"] == 1
    assert mood["mean"] is None and mood["sd"] is None

    assert fields["craving_intensity"]["sd"] is None


def test_empty_summary(client: TestClient):
    body = client.post("/behaviour/summary", json={"rows": []}).json()
    assert body["n_rows"] == 0
    assert all(f["missing_fraction"] == 0 for f in body["fields"])


def test_helpers():
    assert strength_label(0.05, RHO_CUTOFFS) == "negligible"
    assert strength_label(-0.2, RHO_CUTOFFS) == "weak"
    assert strength_label(-0.35, RHO_CUTOFFS) == "moderate"
    assert strength_label(0.9, RHO_CUTOFFS) == "strong"
    assert [time_bucket(h) for h in (0, 5, 6, 12, 17, 18, 23)] == [
        "night",
        "night",
        "morning",
        "afternoon",
        "afternoon",
        "evening",
        "evening",
    ]
    assert holm([0.01, 0.04, 0.03]) == pytest.approx([0.03, 0.06, 0.06])


def test_table_statistics_match_scipy():
    """The count-table fast path must equal scipy on the raw rows, ties included."""
    rng = np.random.default_rng(11)
    x = rng.integers(0, LEVELS, 500)
    y = np.clip(x // 2 + rng.integers(0, 6, 500), 0, 10)
    table = np.zeros((1, LEVELS, LEVELS))
    np.add.at(table, (0, x, y), 1)
    assert _tables_spearman(table)[0] == pytest.approx(stats.spearmanr(x, y).statistic)

    groups = rng.integers(0, 4, 500)
    craving = np.clip(groups * 2 + rng.integers(0, 4, 500), 0, 10)
    counts = np.zeros((1, 4, LEVELS))
    np.add.at(counts, (0, groups, craving), 1)
    h = stats.kruskal(*[craving[groups == g] for g in range(4)]).statistic
    assert _tables_epsilon_squared(counts)[0] == pytest.approx(h / 499)

    one_group = np.zeros((1, 4, LEVELS))
    one_group[0, 2, :] = 3
    assert np.isnan(_tables_epsilon_squared(one_group)[0])
