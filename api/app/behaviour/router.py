"""BehaviourLab analytics endpoints (M3). Stateless: the Next.js server sends rows in."""

from fastapi import APIRouter

router = APIRouter(prefix="/behaviour", tags=["behaviour"])
