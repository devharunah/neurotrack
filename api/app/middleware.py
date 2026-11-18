"""Request hardening: request IDs, access logs, security headers, body-size and rate limits.

Everything here is plain ASGI middleware (no BaseHTTPMiddleware), so streaming bodies are counted
as they arrive and nothing is buffered. `install_hardening` wires it all into an app in the right
order; `main.py` calls it once.

Order, outermost first:

1. `RequestContextMiddleware`: request ID, JSON access log, security headers, and the last-resort
   500 handler, so even rejected or crashed requests are logged and carry the headers.
2. `TrustedHostMiddleware` (Starlette): rejects unexpected `Host` headers with 400.
3. `BodySizeLimitMiddleware`: 413 for oversized bodies.
4. `RateLimitMiddleware`: 429 with `Retry-After`.
"""

from __future__ import annotations

import base64
import binascii
import json
import logging
import math
import re
import sys
import threading
import time
import uuid
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config import Settings

REQUEST_ID_HEADER = "x-request-id"
_SAFE_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
# Interactive docs load Swagger UI / ReDoc assets from a CDN, so they get no strict CSP.
_DOCS_PATHS = ("/docs", "/redoc", "/openapi.json")

access_logger = logging.getLogger("neurotrack.access")
error_logger = logging.getLogger("neurotrack.error")


# --------------------------------------------------------------------------------------------
# Logging
# --------------------------------------------------------------------------------------------


class JsonFormatter(logging.Formatter):
    """One JSON object per line. Only fields passed through `extra={"fields": ...}` are added."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname.lower(),
            "logger": record.name,
            "msg": record.getMessage(),
        }
        fields = getattr(record, "fields", None)
        if isinstance(fields, dict):
            payload.update(fields)
        if record.exc_info:
            # Stack traces go to the server log only, never to the client.
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging() -> None:
    """Attach a JSON stdout handler to the NeuroTrack loggers once."""
    for logger in (access_logger, error_logger):
        if any(isinstance(h.formatter, JsonFormatter) for h in logger.handlers):
            continue
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JsonFormatter())
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        logger.propagate = False


# --------------------------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------------------------


def _header(scope: Scope, name: bytes) -> str | None:
    for key, value in scope.get("headers", []):
        if key == name:
            return value.decode("latin-1")
    return None


def client_ip(scope: Scope, *, trust_proxy_headers: bool) -> str:
    if trust_proxy_headers:
        forwarded = _header(scope, b"x-forwarded-for")
        if forwarded:
            first = forwarded.split(",")[0].strip()
            if first:
                return first
    client = scope.get("client")
    return client[0] if client else "unknown"


def jwt_subject(scope: Scope) -> str | None:
    """Read `sub` from a Bearer JWT payload WITHOUT verifying it.

    Only used to pick a rate-limit bucket. A forged token gets its own bucket but is then
    rejected with 401 by `get_current_user` before any expensive work runs, so forging buys
    nothing. The bucket table is bounded, so rotating forged subjects cannot exhaust memory.
    """
    auth = _header(scope, b"authorization")
    if not auth or not auth.lower().startswith("bearer "):
        return None
    parts = auth[7:].strip().split(".")
    if len(parts) != 3:
        return None
    segment = parts[1]
    try:
        raw = base64.urlsafe_b64decode(segment + "=" * (-len(segment) % 4))
        claims = json.loads(raw)
    except (binascii.Error, ValueError):
        return None
    sub = claims.get("sub") if isinstance(claims, dict) else None
    if isinstance(sub, str) and 0 < len(sub) <= 128:
        return sub
    return None


def rate_limit_key(scope: Scope, *, trust_proxy_headers: bool) -> str:
    sub = jwt_subject(scope)
    if sub is not None:
        return f"sub:{sub}"
    return f"ip:{client_ip(scope, trust_proxy_headers=trust_proxy_headers)}"


async def _send_json(
    send: Send, status: int, body: dict[str, Any], headers: list[tuple[bytes, bytes]] | None = None
) -> None:
    payload = json.dumps(body).encode()
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(payload)).encode()),
                *(headers or []),
            ],
        }
    )
    await send({"type": "http.response.body", "body": payload})


# --------------------------------------------------------------------------------------------
# Request context: ID, access log, security headers, last-resort 500
# --------------------------------------------------------------------------------------------


def security_headers(path: str, *, production: bool) -> list[tuple[bytes, bytes]]:
    headers = [
        (b"x-content-type-options", b"nosniff"),
        (b"x-frame-options", b"DENY"),
        (b"referrer-policy", b"no-referrer"),
        (b"permissions-policy", b"camera=(), microphone=(), geolocation=(), payment=()"),
        (b"cross-origin-opener-policy", b"same-origin"),
        (b"cross-origin-resource-policy", b"same-origin"),
    ]
    if not path.startswith(_DOCS_PATHS):
        headers.append((b"content-security-policy", b"default-src 'none'; frame-ancestors 'none'"))
        headers.append((b"cache-control", b"no-store"))
    if production:
        headers.append((b"strict-transport-security", b"max-age=63072000; includeSubDomains"))
    return headers


class RequestContextMiddleware:
    def __init__(self, app: ASGIApp, *, production: bool, trust_proxy_headers: bool) -> None:
        self.app = app
        self.production = production
        self.trust_proxy_headers = trust_proxy_headers

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = _header(scope, REQUEST_ID_HEADER.encode())
        request_id = incoming if incoming and _SAFE_REQUEST_ID.match(incoming) else uuid.uuid4().hex
        scope.setdefault("state", {})["request_id"] = request_id
        path: str = scope.get("path", "")
        extra_headers = [
            (REQUEST_ID_HEADER.encode(), request_id.encode()),
            *security_headers(path, production=self.production),
        ]
        status_holder = {"status": 500, "started": False}
        started = time.perf_counter()

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                status_holder["status"] = message["status"]
                status_holder["started"] = True
                existing = {k.lower() for k, _ in message.get("headers", [])}
                message["headers"] = [
                    *message.get("headers", []),
                    *(h for h in extra_headers if h[0] not in existing),
                ]
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception:
            error_logger.exception(
                "unhandled exception",
                extra={
                    "fields": {
                        "request_id": request_id,
                        "method": scope.get("method"),
                        "path": path,
                    }
                },
            )
            if not status_holder["started"]:
                await _send_json(
                    send_wrapper,
                    500,
                    {"detail": "Internal server error", "request_id": request_id},
                )
        finally:
            # Path only: query strings can carry secrets. No bodies, no headers, no tokens.
            access_logger.info(
                "request",
                extra={
                    "fields": {
                        "request_id": request_id,
                        "method": scope.get("method"),
                        "path": path,
                        "status": status_holder["status"],
                        "duration_ms": round((time.perf_counter() - started) * 1000, 2),
                        "client_ip": client_ip(scope, trust_proxy_headers=self.trust_proxy_headers),
                    }
                },
            )


# --------------------------------------------------------------------------------------------
# Body size limit
# --------------------------------------------------------------------------------------------


class _BodyTooLarge(Exception):
    pass


class BodySizeLimitMiddleware:
    def __init__(self, app: ASGIApp, *, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        declared = _header(scope, b"content-length")
        if declared is not None:
            try:
                if int(declared) > self.max_bytes:
                    await self._reject(send)
                    return
            except ValueError:
                await _send_json(send, 400, {"detail": "Invalid Content-Length"})
                return

        # Chunked or lying clients: count the bytes as they stream in. Frameworks may catch the
        # exception raised here and answer 400 themselves (FastAPI does while parsing a body),
        # so once the limit is crossed any response the app tries to send is replaced by 413.
        received = 0
        exceeded = False
        response_started = False

        async def counting_receive() -> Message:
            nonlocal received, exceeded
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    exceeded = True
                    raise _BodyTooLarge
            return message

        async def guarded_send(message: Message) -> None:
            nonlocal response_started
            if exceeded:
                if message["type"] == "http.response.start" and not response_started:
                    response_started = True
                    await self._reject(send)
                return
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, counting_receive, guarded_send)
        except _BodyTooLarge:
            if not response_started:
                await self._reject(send)

    async def _reject(self, send: Send) -> None:
        await _send_json(
            send,
            413,
            {"detail": f"Request body too large (limit {self.max_bytes} bytes)"},
            [(b"connection", b"close")],
        )


# --------------------------------------------------------------------------------------------
# Rate limiting
# --------------------------------------------------------------------------------------------


@dataclass
class _Bucket:
    tokens: float
    updated: float


class TokenBucketLimiter:
    """Thread-safe, in-memory token buckets with a bounded LRU table.

    Per process: with several uvicorn workers each worker has its own table, so the effective
    limit is `workers x limit`. Good enough for one small instance; use Redis if that changes.
    """

    def __init__(
        self,
        *,
        capacity: int,
        per_minute: int,
        max_keys: int = 10_000,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.capacity = float(capacity)
        self.rate = per_minute / 60.0
        self.max_keys = max_keys
        self.clock = clock
        self._buckets: OrderedDict[str, _Bucket] = OrderedDict()
        self._lock = threading.Lock()

    def take(self, key: str) -> float:
        """Spend one token. Returns 0 when allowed, otherwise seconds until a token is free."""
        now = self.clock()
        with self._lock:
            bucket = self._buckets.get(key)
            if bucket is None:
                bucket = _Bucket(tokens=self.capacity, updated=now)
                self._buckets[key] = bucket
                if len(self._buckets) > self.max_keys:
                    self._buckets.popitem(last=False)
            else:
                self._buckets.move_to_end(key)
                bucket.tokens = min(
                    self.capacity, bucket.tokens + (now - bucket.updated) * self.rate
                )
                bucket.updated = now

            if bucket.tokens >= 1.0:
                bucket.tokens -= 1.0
                return 0.0
            return (1.0 - bucket.tokens) / self.rate


class RateLimitMiddleware:
    # Liveness probes must never be throttled.
    exempt_paths = frozenset({"/health"})

    def __init__(self, app: ASGIApp, *, settings: Settings) -> None:
        self.app = app
        self.trust_proxy_headers = settings.trust_proxy_headers
        self.strict_prefixes = tuple(settings.rate_limit_strict_prefixes)
        self.default = TokenBucketLimiter(
            capacity=settings.rate_limit_burst, per_minute=settings.rate_limit_per_minute
        )
        self.strict = TokenBucketLimiter(
            capacity=settings.rate_limit_strict_burst,
            per_minute=settings.rate_limit_strict_per_minute,
        )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path: str = scope.get("path", "")
        if scope["type"] != "http" or path in self.exempt_paths:
            await self.app(scope, receive, send)
            return

        key = rate_limit_key(scope, trust_proxy_headers=self.trust_proxy_headers)
        limiter = self.strict if path.startswith(self.strict_prefixes) else self.default
        retry_after = limiter.take(key)
        if retry_after > 0:
            await _send_json(
                send,
                429,
                {"detail": "Too many requests. Slow down and try again shortly."},
                [(b"retry-after", str(max(1, math.ceil(retry_after))).encode())],
            )
            return
        await self.app(scope, receive, send)


# --------------------------------------------------------------------------------------------
# Wiring
# --------------------------------------------------------------------------------------------


async def unhandled_exception_handler(request: Request, _exc: Exception) -> JSONResponse:
    """Registered for `Exception`; a generic body with the request ID, never a stack trace."""
    request_id = getattr(request.state, "request_id", None)
    error_logger.error(
        "unhandled exception",
        exc_info=_exc,
        extra={"fields": {"request_id": request_id, "path": request.url.path}},
    )
    return JSONResponse(
        status_code=500, content={"detail": "Internal server error", "request_id": request_id}
    )


def install_hardening(app: FastAPI, settings: Settings) -> None:
    """Add every hardening layer to `app`. Starlette runs the last-added middleware first."""
    configure_logging()
    app.add_exception_handler(Exception, unhandled_exception_handler)
    if settings.rate_limit_enabled:
        app.add_middleware(RateLimitMiddleware, settings=settings)
    app.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.max_body_bytes)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)
    app.add_middleware(
        RequestContextMiddleware,
        production=settings.environment == "production",
        trust_proxy_headers=settings.trust_proxy_headers,
    )
