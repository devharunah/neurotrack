from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool

from app.auth import AuthenticatedUser
from app.quantum.circuits import run_circuit
from app.quantum.presets import PRESETS
from app.quantum.qml import QmlCompareRequest, QmlCompareResult, compare
from app.quantum.schemas import Preset, RunRequest, RunResult

router = APIRouter(prefix="/quantum", tags=["quantum"])


@router.get("/presets", response_model=list[Preset])
def list_presets() -> list[Preset]:
    return PRESETS


@router.post("/run", response_model=RunResult)
async def run(request: RunRequest, _user: AuthenticatedUser) -> RunResult:
    # Simulation is CPU-bound; keep the event loop free. Schema caps bound the work.
    return await run_in_threadpool(run_circuit, request)


@router.post("/qml/compare", response_model=QmlCompareResult)
async def qml_compare(request: QmlCompareRequest, _user: AuthenticatedUser) -> QmlCompareResult:
    return await run_in_threadpool(compare, request)
