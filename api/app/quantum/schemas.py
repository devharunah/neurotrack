"""Request/response contracts for QuantumLab. These caps bound compute per request."""

from typing import Literal, Self

from pydantic import BaseModel, Field, model_validator

MAX_QUBITS = 8
MAX_GATES = 64
MAX_SHOTS = 8192
STATEVECTOR_MAX_QUBITS = 5

GateOp = Literal["x", "y", "z", "h", "cx"]


class Gate(BaseModel):
    op: GateOp
    target: int = Field(ge=0, lt=MAX_QUBITS)
    # Only for "cx".
    control: int | None = Field(default=None, ge=0, lt=MAX_QUBITS)

    @model_validator(mode="after")
    def _check_control(self) -> Self:
        if self.op == "cx":
            if self.control is None:
                raise ValueError("cx requires a control qubit")
            if self.control == self.target:
                raise ValueError("cx control and target must differ")
        elif self.control is not None:
            raise ValueError(f"{self.op} takes no control qubit")
        return self


class NoiseConfig(BaseModel):
    """Simple, documented noise: depolarizing gate errors plus symmetric readout error."""

    depolarizing_1q: float = Field(default=0.0, ge=0.0, le=0.5)
    depolarizing_2q: float = Field(default=0.0, ge=0.0, le=0.5)
    readout: float = Field(default=0.0, ge=0.0, le=0.5)

    @property
    def is_zero(self) -> bool:
        return self.depolarizing_1q == 0 and self.depolarizing_2q == 0 and self.readout == 0


class CircuitSpec(BaseModel):
    num_qubits: int = Field(ge=1, le=MAX_QUBITS)
    gates: list[Gate] = Field(default_factory=list, max_length=MAX_GATES)


class RunRequest(CircuitSpec):
    shots: int = Field(default=1024, ge=1, le=MAX_SHOTS)
    noise: NoiseConfig | None = None
    seed: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def _check_qubit_indices(self) -> Self:
        for index, gate in enumerate(self.gates):
            used = [gate.target] + ([gate.control] if gate.control is not None else [])
            if any(q >= self.num_qubits for q in used):
                raise ValueError(f"gate {index} uses a qubit outside 0..{self.num_qubits - 1}")
        return self


class Amplitude(BaseModel):
    basis: str
    re: float
    im: float
    probability: float


class RunResult(BaseModel):
    counts: dict[str, int]
    probabilities: dict[str, float]
    statevector: list[Amplitude] | None
    diagram: str
    depth: int
    shots: int
    noisy: bool
    elapsed_ms: float
    bit_order: str = "Qiskit little-endian: rightmost bit is qubit 0"


class Preset(BaseModel):
    id: str
    name: str
    description: str
    circuit: CircuitSpec
