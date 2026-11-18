# NeuroTrack API

FastAPI service for scientific computation: Qiskit circuits on a local Aer simulator, the
classical-vs-quantum classifier comparison, and (later) behavioural analytics and literature
retrieval. It is called server-to-server by the Next.js app; browsers never call it directly.

```bash
uv sync                                   # Python 3.12 is pinned in .python-version
cp .env.example .env                      # set SUPABASE_URL
uv run uvicorn app.main:app --reload --port 8000
uv run pytest                             # tests
uv run ruff check . && uv run ruff format --check .
```

Interactive docs: http://127.0.0.1:8000/docs. Every route except `/health` and
`/quantum/presets` needs a Supabase access token as `Authorization: Bearer <token>`.
