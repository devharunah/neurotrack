from fastapi.testclient import TestClient

BELL = {
    "num_qubits": 2,
    "gates": [{"op": "h", "target": 0}, {"op": "cx", "control": 0, "target": 1}],
}


def test_health(anon_client: TestClient) -> None:
    body = anon_client.get("/health").json()
    assert body["status"] == "ok"
    assert body["qiskit"].startswith("2.")


def test_bell_state_distribution(client: TestClient) -> None:
    response = client.post("/quantum/run", json={**BELL, "shots": 4096, "seed": 42})
    assert response.status_code == 200
    body = response.json()

    assert set(body["counts"]) == {"00", "11"}
    for outcome in ("00", "11"):
        assert abs(body["probabilities"][outcome] - 0.5) < 0.03
    assert sum(body["counts"].values()) == 4096

    amplitudes = {a["basis"]: a["probability"] for a in body["statevector"]}
    assert abs(amplitudes["00"] - 0.5) < 1e-9
    assert abs(amplitudes["11"] - 0.5) < 1e-9
    assert amplitudes["01"] == 0 and amplitudes["10"] == 0


def test_x_gate_is_deterministic(client: TestClient) -> None:
    body = client.post(
        "/quantum/run", json={"num_qubits": 1, "gates": [{"op": "x", "target": 0}], "shots": 500}
    ).json()
    assert body["counts"] == {"1": 500}


def test_qubit_order_is_little_endian(client: TestClient) -> None:
    body = client.post(
        "/quantum/run", json={"num_qubits": 2, "gates": [{"op": "x", "target": 0}], "shots": 10}
    ).json()
    assert body["counts"] == {"01": 10}


def test_noise_produces_forbidden_outcomes(client: TestClient) -> None:
    payload = {**BELL, "shots": 4096, "seed": 1, "noise": {"depolarizing_2q": 0.2, "readout": 0.05}}
    body = client.post("/quantum/run", json=payload).json()
    assert body["noisy"] is True
    assert body["statevector"] is None
    assert body["counts"].get("01", 0) + body["counts"].get("10", 0) > 0


def test_presets_are_valid_runs(client: TestClient) -> None:
    presets = client.get("/quantum/presets").json()
    assert {p["id"] for p in presets} >= {"bell", "ghz", "superposition", "phase"}
    for preset in presets:
        response = client.post("/quantum/run", json={**preset["circuit"], "shots": 64})
        assert response.status_code == 200, preset["id"]


def test_phase_preset_always_measures_one(client: TestClient) -> None:
    phase = next(p for p in client.get("/quantum/presets").json() if p["id"] == "phase")
    body = client.post("/quantum/run", json={**phase["circuit"], "shots": 200}).json()
    assert body["counts"] == {"1": 200}


def test_rejects_out_of_range_inputs(client: TestClient) -> None:
    too_many_qubits = {"num_qubits": 9, "gates": []}
    qubit_outside_circuit = {"num_qubits": 2, "gates": [{"op": "x", "target": 2}]}
    cx_without_control = {"num_qubits": 2, "gates": [{"op": "cx", "target": 1}]}
    cx_same_qubit = {"num_qubits": 2, "gates": [{"op": "cx", "control": 1, "target": 1}]}
    too_many_shots = {**BELL, "shots": 100_000}
    for payload in (
        too_many_qubits,
        qubit_outside_circuit,
        cx_without_control,
        cx_same_qubit,
        too_many_shots,
    ):
        assert client.post("/quantum/run", json=payload).status_code == 422, payload


def test_run_requires_auth(anon_client: TestClient) -> None:
    assert anon_client.post("/quantum/run", json=BELL).status_code == 401
    assert anon_client.post("/quantum/qml/compare", json={}).status_code == 401


def test_qml_compare_reports_both_families(client: TestClient) -> None:
    response = client.post("/quantum/qml/compare", json={"samples": 40, "seed": 3})
    assert response.status_code == 200
    body = response.json()
    assert body["dataset"]["synthetic"] is True
    assert {m["family"] for m in body["models"]} == {"quantum", "classical"}
    for model in body["models"]:
        assert 0.0 <= model["accuracy"] <= 1.0
    assert body["quantum_resources"]["qubits"] == 2
    assert "do not demonstrate quantum advantage" in body["caveat"]
