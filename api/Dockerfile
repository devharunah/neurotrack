# syntax=docker/dockerfile:1
#
# NeuroTrack API image. Build from the api/ directory:
#   docker build -t neurotrack-api api
#   docker run --rm -p 8000:8000 -e SUPABASE_URL=https://<ref>.supabase.co \
#     -e ALLOWED_HOSTS=localhost,127.0.0.1 neurotrack-api
#
# Runtime env (see api/.env.example): SUPABASE_URL, ALLOWED_HOSTS (required: the image defaults
# to ENVIRONMENT=production, which refuses "*"), TRUST_PROXY_HEADERS=true behind a platform proxy,
# PORT (default 8000) and WEB_CONCURRENCY (uvicorn workers, default 1). Rate limits are kept per
# worker, so N workers allow up to N times the configured rate.

# uv is copied from its official image; Dependabot (docker ecosystem) keeps both tags current.
FROM ghcr.io/astral-sh/uv:0.13.7 AS uv

# ---- Build stage: resolve and install the locked runtime dependencies into /app/.venv --------
FROM python:3.12-slim AS builder

COPY --from=uv /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/app/.venv

WORKDIR /app

# Dependencies first, so source edits do not invalidate this layer. --locked fails the build if
# uv.lock is out of date with pyproject.toml; --no-dev leaves pytest and ruff out.
COPY pyproject.toml uv.lock .python-version ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-install-project

# ---- Runtime stage: no uv, no build cache, non-root ------------------------------------------
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:${PATH}" \
    ENVIRONMENT=production \
    PORT=8000 \
    WEB_CONCURRENCY=1

RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --no-create-home --shell /usr/sbin/nologin app

WORKDIR /app
COPY --from=builder /app/.venv /app/.venv
COPY app ./app

USER app
EXPOSE 8000

# /health is exempt from rate limiting and from the Host check, so the probe works by IP.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD ["python", "-c", "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/health' % os.environ.get('PORT', '8000'), timeout=4)"]

# Shell form so $PORT and $WEB_CONCURRENCY expand at start-up; exec makes uvicorn PID 1 so it
# receives SIGTERM and shuts down gracefully.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port \"${PORT}\" --workers \"${WEB_CONCURRENCY}\" --no-server-header"]
