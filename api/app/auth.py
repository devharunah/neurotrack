"""Supabase access-token verification.

The Next.js server forwards the signed-in user's Supabase access token as a Bearer token.
We verify its signature against the project's published JWKS (asymmetric signing keys), so the
API never needs the Supabase JWT secret or the service-role key.
"""

from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated, Any

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


def decode_access_token(
    token: str, supabase_url: str, audience: str, *, refresh_unknown_keys: bool = True
) -> dict[str, Any]:
    """Verify a Supabase access token and return its claims. Raises PyJWT errors when invalid.

    `refresh_unknown_keys=False` only uses the cached JWKS: a token naming an unknown `kid` is
    rejected instead of triggering a fetch (used by the rate limiter, which runs on every request).
    """
    client = _jwks_client(supabase_url)
    if refresh_unknown_keys:
        signing_key = client.get_signing_key_from_jwt(token)
    else:
        kid = jwt.get_unverified_header(token).get("kid")
        signing_key = next((k for k in client.get_signing_keys() if k.key_id == kid), None)
        if signing_key is None:
            raise jwt.InvalidTokenError("Unknown signing key")
    return jwt.decode(token, signing_key.key, algorithms=["ES256", "RS256"], audience=audience)


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

    try:
        claims = decode_access_token(
            credentials.credentials, settings.supabase_url, settings.supabase_jwt_audience
        )
    except (jwt.PyJWTError, jwt.PyJWKClientError) as exc:
        raise _unauthorized("Invalid or expired token") from exc

    subject = claims.get("sub")
    if not isinstance(subject, str):
        raise _unauthorized("Token has no subject")

    return CurrentUser(id=subject, email=claims.get("email"), role=claims.get("role", ""))


AuthenticatedUser = Annotated[CurrentUser, Depends(get_current_user)]
