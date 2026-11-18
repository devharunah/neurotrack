"""Guided starter circuits for QuantumLab."""

from app.quantum.schemas import CircuitSpec, Gate, Preset

PRESETS: list[Preset] = [
    Preset(
        id="superposition",
        name="Superposition",
        description="A Hadamard puts one qubit into an equal superposition: ~50% 0, ~50% 1.",
        circuit=CircuitSpec(num_qubits=1, gates=[Gate(op="h", target=0)]),
    ),
    Preset(
        id="bell",
        name="Bell state",
        description=(
            "H then CNOT entangles two qubits into (|00> + |11>)/sqrt(2). Measurements are "
            "perfectly correlated: only 00 and 11 appear, each ~50% of the time."
        ),
        circuit=CircuitSpec(
            num_qubits=2,
            gates=[Gate(op="h", target=0), Gate(op="cx", control=0, target=1)],
        ),
    ),
    Preset(
        id="ghz",
        name="GHZ state (3 qubits)",
        description="Extends the Bell state to three qubits: only 000 and 111 appear.",
        circuit=CircuitSpec(
            num_qubits=3,
            gates=[
                Gate(op="h", target=0),
                Gate(op="cx", control=0, target=1),
                Gate(op="cx", control=1, target=2),
            ],
        ),
    ),
    Preset(
        id="phase",
        name="Phase flip (H-Z-H)",
        description=(
            "Z changes only the phase, which measurement cannot see directly. Sandwiching it "
            "between Hadamards turns the phase flip into a bit flip: the result is always 1."
        ),
        circuit=CircuitSpec(
            num_qubits=1,
            gates=[Gate(op="h", target=0), Gate(op="z", target=0), Gate(op="h", target=0)],
        ),
    ),
]
