"""Supabase access-token verification.

The Next.js server forwards the signed-in user's Supabase access token as a Bearer token.
We verify its signature against the project's published JWKS (asymmetric signing keys), so the
API never needs the Supabase JWT secret or the service-role key.
"""

from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import Settings, get_settings

_bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class CurrentUser:
    id: str
    email: str | None
    role: str


@lru_cache
def _jwks_client(supabase_url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(
        f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json", cache_keys=True
    )


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> CurrentUser:
    if credentials is None:
        raise _unauthorized("Missing bearer token")
    if not settings.supabase_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication is not configured (SUPABASE_URL is unset)",
        )

    token = credentials.credentials
    try:
        signing_key = _jwks_client(settings.supabase_url).get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256"],
            audience=settings.supabase_jwt_audience,
        )
    except (jwt.PyJWTError, jwt.PyJWKClientError) as exc:
        raise _unauthorized("Invalid or expired token") from exc

    subject = claims.get("sub")
    if not isinstance(subject, str):
        raise _unauthorized("Token has no subject")

    return CurrentUser(id=subject, email=claims.get("email"), role=claims.get("role", ""))


AuthenticatedUser = Annotated[CurrentUser, Depends(get_current_user)]
