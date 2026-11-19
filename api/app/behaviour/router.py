"""BehaviourLab analytics endpoints (M3). Stateless: the Next.js server sends rows in.

The API never stores or reads participant data itself. It receives pseudonymous, already
RLS-filtered rows from the signed-in researcher's session and returns aggregate statistics.
"""

from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool

from app.auth import AuthenticatedUser
from app.behaviour.schemas import (
    AssociationsRequest,
    AssociationsResult,
    RowsRequest,
    SummaryResult,
)
from app.behaviour.stats import associations, summary

router = APIRouter(prefix="/behaviour", tags=["behaviour"])


@router.post("/associations", response_model=AssociationsResult)
async def post_associations(
    request: AssociationsRequest, _user: AuthenticatedUser
) -> AssociationsResult:
    # The bootstrap is CPU-bound; keep the event loop free. MAX_ROWS bounds the work.
    return await run_in_threadpool(associations, request)


@router.post("/summary", response_model=SummaryResult)
async def post_summary(request: RowsRequest, _user: AuthenticatedUser) -> SummaryResult:
    return await run_in_threadpool(summary, request)
