"""Build and simulate small circuits locally with Qiskit Aer."""

import time

from qiskit import QuantumCircuit
from qiskit.quantum_info import Statevector
from qiskit_aer import AerSimulator
from qiskit_aer.noise import NoiseModel, ReadoutError, depolarizing_error

from app.quantum.schemas import (
    STATEVECTOR_MAX_QUBITS,
    Amplitude,
    CircuitSpec,
    NoiseConfig,
    RunRequest,
    RunResult,
)

_SINGLE_QUBIT_OPS = ["x", "y", "z", "h"]


def build_circuit(spec: CircuitSpec) -> QuantumCircuit:
    """Unitary part only (no measurement), so it can also yield a statevector."""
    qc = QuantumCircuit(spec.num_qubits)
    for gate in spec.gates:
        if gate.op == "cx":
            assert gate.control is not None  # guaranteed by schema validation
            qc.cx(gate.control, gate.target)
        else:
            getattr(qc, gate.op)(gate.target)
    return qc


def build_noise_model(noise: NoiseConfig) -> NoiseModel:
    model = NoiseModel()
    if noise.depolarizing_1q > 0:
        model.add_all_qubit_quantum_error(
            depolarizing_error(noise.depolarizing_1q, 1), _SINGLE_QUBIT_OPS
        )
    if noise.depolarizing_2q > 0:
        model.add_all_qubit_quantum_error(depolarizing_error(noise.depolarizing_2q, 2), ["cx"])
    if noise.readout > 0:
        p = noise.readout
        model.add_all_qubit_readout_error(ReadoutError([[1 - p, p], [p, 1 - p]]))
    return model


def _statevector(qc: QuantumCircuit) -> list[Amplitude]:
    state = Statevector.from_instruction(qc)
    width = qc.num_qubits
    amplitudes: list[Amplitude] = []
    for index, amp in enumerate(state.data):
        amplitudes.append(
            Amplitude(
                basis=format(index, f"0{width}b"),
                re=round(float(amp.real), 10),
                im=round(float(amp.imag), 10),
                probability=round(float(abs(amp) ** 2), 10),
            )
        )
    return amplitudes


def run_circuit(request: RunRequest) -> RunResult:
    started = time.perf_counter()

    unitary = build_circuit(request)
    measured = unitary.copy()
    measured.measure_all()

    noisy = request.noise is not None and not request.noise.is_zero
    simulator = (
        AerSimulator(noise_model=build_noise_model(request.noise))
        if noisy and request.noise is not None
        else AerSimulator()
    )
    run_options: dict[str, int] = {"shots": request.shots}
    if request.seed is not None:
        run_options["seed_simulator"] = request.seed

    raw_counts: dict[str, int] = simulator.run(measured, **run_options).result().get_counts()
    width = request.num_qubits
    counts = {key.replace(" ", "").zfill(width): value for key, value in sorted(raw_counts.items())}
    probabilities = {key: value / request.shots for key, value in counts.items()}

    statevector = (
        _statevector(unitary)
        if not noisy and request.num_qubits <= STATEVECTOR_MAX_QUBITS
        else None
    )

    return RunResult(
        counts=counts,
        probabilities=probabilities,
        statevector=statevector,
        diagram=str(measured.draw(output="text", fold=-1)),
        depth=unitary.depth(),
        shots=request.shots,
        noisy=noisy,
        elapsed_ms=round((time.perf_counter() - started) * 1000, 2),
    )
