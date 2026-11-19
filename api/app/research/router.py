"""Research Assistant endpoints (M4): literature search and citation-grounded answers."""

from collections.abc import AsyncIterator
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth import AuthenticatedUser
from app.config import Settings, get_settings
from app.research.schemas import (
    MAX_QUERY_LENGTH,
    MAX_SEARCH_LIMIT,
    AnswerRequest,
    AnswerResult,
    SearchResult,
    SourceFilter,
)
from app.research.service import AllSourcesFailedError, LiteratureService
from app.research.sources import USER_AGENT, RetryPolicy

router = APIRouter(prefix="/research", tags=["research"])


async def get_http_client(
    settings: Annotated[Settings, Depends(get_settings)],
) -> AsyncIterator[httpx.AsyncClient]:
    """One outbound client per request. Tests override this with an ``httpx.MockTransport``."""
    async with httpx.AsyncClient(
        headers={"User-Agent": USER_AGENT},
        timeout=httpx.Timeout(settings.research_timeout_s, connect=5.0),
        follow_redirects=True,
    ) as client:
        yield client


def get_retry_policy() -> RetryPolicy:
    return RetryPolicy()


def get_literature_service(
    http: Annotated[httpx.AsyncClient, Depends(get_http_client)],
    settings: Annotated[Settings, Depends(get_settings)],
    policy: Annotated[RetryPolicy, Depends(get_retry_policy)],
) -> LiteratureService:
    return LiteratureService(http=http, settings=settings, policy=policy)


Service = Annotated[LiteratureService, Depends(get_literature_service)]


def _upstream_unavailable(exc: AllSourcesFailedError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"The literature sources are not answering right now ({', '.join(exc.failed)}). "
        "Try again in a minute.",
    )


@router.get("/search", response_model=SearchResult)
async def search(
    _user: AuthenticatedUser,
    service: Service,
    q: Annotated[str, Query(min_length=2, max_length=MAX_QUERY_LENGTH)],
    source: SourceFilter = "all",
    limit: Annotated[int, Query(ge=1, le=MAX_SEARCH_LIMIT)] = 10,
) -> SearchResult:
    query = " ".join(q.split())
    if len(query) < 2:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "q must not be blank")
    try:
        return await service.search(query, source, limit)
    except AllSourcesFailedError as exc:
        raise _upstream_unavailable(exc) from exc


@router.post("/answer", response_model=AnswerResult)
async def answer(
    request: AnswerRequest, _user: AuthenticatedUser, service: Service
) -> AnswerResult:
    try:
        return await service.answer(request.question, request.max_sources)
    except AllSourcesFailedError as exc:
        raise _upstream_unavailable(exc) from exc
