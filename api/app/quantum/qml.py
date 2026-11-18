"""Classical-vs-quantum classifier comparison on a small SYNTHETIC behavioural dataset.

This is an educational experiment. The dataset is generated, not collected. Results on a toy
problem say nothing about quantum advantage on real data; see docs/models/quantum-kernel-svc.md.
"""

import time

import numpy as np
from pydantic import BaseModel, Field
from qiskit.circuit.library import zz_feature_map
from qiskit_machine_learning.kernels import FidelityStatevectorKernel
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import MinMaxScaler
from sklearn.svm import SVC

CAVEAT = (
    "Synthetic data, simulated (noise-free) quantum kernel. These numbers compare methods on a "
    "toy problem only. They do not demonstrate quantum advantage and say nothing about real "
    "behaviour or any individual."
)

FEATURES = ["stress_level", "sleep_quality"]


class QmlCompareRequest(BaseModel):
    samples: int = Field(default=80, ge=20, le=200)
    noise: float = Field(default=0.1, ge=0.0, le=0.5, description="Label-flip probability")
    feature_map_reps: int = Field(default=2, ge=1, le=3)
    feature_scale: float = Field(
        default=1.0,
        ge=0.1,
        le=3.1416,
        description="Features are scaled to [0, feature_scale] before encoding. This acts as "
        "the kernel bandwidth: too large and the kernel memorises (near-identity Gram matrix), "
        "too small and every point looks alike.",
    )
    seed: int = Field(default=7, ge=0)


class ModelScore(BaseModel):
    name: str
    family: str  # "quantum" | "classical"
    accuracy: float
    f1: float
    train_ms: float
    predict_ms: float
    notes: str


class QmlCompareResult(BaseModel):
    dataset: dict[str, object]
    quantum_resources: dict[str, int]
    models: list[ModelScore]
    caveat: str = CAVEAT


def make_synthetic_dataset(samples: int, noise: float, seed: int) -> tuple[np.ndarray, np.ndarray]:
    """Stress (0-10) and sleep quality (0-10) -> 'high reported craving' label.

    The rule is deliberately non-linear (an interaction plus a ring) so linear models struggle a
    little. It is an arbitrary teaching rule, not a claim about how cravings work.
    """
    rng = np.random.default_rng(seed)
    stress = rng.uniform(0, 10, samples)
    sleep = rng.uniform(0, 10, samples)
    score = (stress - 5) * (5 - sleep) / 25 + 0.3 * np.sin(stress / 1.5)
    labels = (score > 0.05).astype(int)
    flips = rng.random(samples) < noise
    labels = np.where(flips, 1 - labels, labels)
    return np.column_stack([stress, sleep]), labels


def _score(name: str, family: str, model, x_tr, y_tr, x_te, y_te, notes: str) -> ModelScore:
    t0 = time.perf_counter()
    model.fit(x_tr, y_tr)
    t1 = time.perf_counter()
    predictions = model.predict(x_te)
    t2 = time.perf_counter()
    return ModelScore(
        name=name,
        family=family,
        accuracy=round(float(accuracy_score(y_te, predictions)), 4),
        f1=round(float(f1_score(y_te, predictions, zero_division=0)), 4),
        train_ms=round((t1 - t0) * 1000, 2),
        predict_ms=round((t2 - t1) * 1000, 2),
        notes=notes,
    )


class _PrecomputedKernelSVC:
    """Adapts a quantum kernel to sklearn's fit/predict shape so all models are timed alike."""

    def __init__(self, kernel: FidelityStatevectorKernel) -> None:
        self._kernel = kernel
        self._svc = SVC(kernel="precomputed")
        self._x_train: np.ndarray | None = None

    def fit(self, x: np.ndarray, y: np.ndarray) -> "_PrecomputedKernelSVC":
        self._x_train = x
        self._svc.fit(self._kernel.evaluate(x_vec=x), y)
        return self

    def predict(self, x: np.ndarray) -> np.ndarray:
        assert self._x_train is not None
        return self._svc.predict(self._kernel.evaluate(x_vec=x, y_vec=self._x_train))


def compare(request: QmlCompareRequest) -> QmlCompareResult:
    x, y = make_synthetic_dataset(request.samples, request.noise, request.seed)
    stratify = y if len(set(y.tolist())) > 1 else None
    x_tr, x_te, y_tr, y_te = train_test_split(
        x, y, test_size=0.3, random_state=request.seed, stratify=stratify
    )
    # Angle encoding wants features on a bounded interval; its width is the kernel bandwidth.
    scaler = MinMaxScaler(feature_range=(0, request.feature_scale)).fit(x_tr)
    x_tr, x_te = scaler.transform(x_tr), scaler.transform(x_te)

    feature_map = zz_feature_map(feature_dimension=len(FEATURES), reps=request.feature_map_reps)
    quantum_kernel = FidelityStatevectorKernel(feature_map=feature_map)

    models = [
        _score(
            "Quantum kernel SVC (ZZ feature map)",
            "quantum",
            _PrecomputedKernelSVC(quantum_kernel),
            x_tr,
            y_tr,
            x_te,
            y_te,
            "Kernel = |<phi(x)|phi(x')>|^2 computed by exact statevector simulation.",
        ),
        _score(
            "RBF-kernel SVC",
            "classical",
            SVC(kernel="rbf", gamma="scale"),
            x_tr,
            y_tr,
            x_te,
            y_te,
            "Standard classical kernel baseline.",
        ),
        _score(
            "Logistic regression",
            "classical",
            LogisticRegression(),
            x_tr,
            y_tr,
            x_te,
            y_te,
            "Linear baseline.",
        ),
    ]

    return QmlCompareResult(
        dataset={
            "synthetic": True,
            "features": FEATURES,
            "label": "high_reported_craving",
            "train_size": len(y_tr),
            "test_size": len(y_te),
            "positive_rate": round(float(y.mean()), 4),
        },
        quantum_resources={
            "qubits": feature_map.num_qubits,
            "circuit_depth": feature_map.decompose().depth(),
            "kernel_entries_evaluated": len(y_tr) ** 2 + len(y_te) * len(y_tr),
        },
        models=models,
    )
