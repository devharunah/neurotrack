# NeuroTrack

An open-source research and learning platform that brings together addiction neuroscience,
behavioural research and experimental quantum computing.

> **Educational and experimental.** NeuroTrack does not diagnose, predict relapse, recommend
> treatment or measure brain activity. Quantum experiments make no claim of quantum advantage.

| Lab | Status | What it does |
|---|---|---|
| **QuantumLab** | ✅ Working | Circuit builder (X, Y, Z, H, CNOT), local Qiskit Aer simulation, noise models, histograms, statevectors, guided Bell/GHZ experiments, quantum-kernel vs classical classifier comparison |
| **NeuroLab** | Next (M2) | 3D brain explorer, region pages with verified citations, Rescorla-Wagner and TD reward-learning models |
| **BehaviourLab** | Planned (M3) | Consented observation studies, trend dashboards, association analysis, pseudonymous export. Synthetic data until ethics approval |
| **Research Assistant** | Planned (M4) | Europe PMC and PubMed search with citation-validated summaries. Works with no paid AI provider |

## Architecture

```
Browser ──► Next.js 16 (Vercel)  ──Server Actions──►  FastAPI (Python 3.12, uv)
             │  src/proxy.ts: session refresh          │  Qiskit 2 + Aer, scikit-learn
             │  (app)/ labs, (auth)/ login             │  verifies Supabase JWT via JWKS
             ▼                                          ▼
          Supabase: Auth + Postgres (RLS on every table)
```

- The browser never calls the API directly. Server Actions forward the user's access token, and
  the API verifies it against the Supabase JWKS. This means no CORS, and no secrets shared
  between the two services.
- The API's OpenAPI schema is the contract. `pnpm api:types` regenerates the TypeScript types, and
  CI fails if the committed schema is stale.
- Curated scientific content lives in the repo, reviewed through PRs. The database holds only
  user-generated data.

## Getting started

Prerequisites:
- Node 20+ and pnpm 10.
- [uv](https://docs.astral.sh/uv/), which installs Python 3.12 for you.
- A free [Supabase](https://supabase.com) project.

```bash
pnpm install
cd api && uv sync && cd ..

cp .env.example .env.local          # Supabase URL + publishable key, NEUROTRACK_API_URL
cp api/.env.example api/.env        # SUPABASE_URL

supabase link --project-ref <ref>
supabase db push                    # applies supabase/migrations

pnpm dev:all                        # Next.js on :3000, API on :8000
```

API docs: http://127.0.0.1:8000/docs

## Commands

| Command | What it does |
|---|---|
| `pnpm dev:all` | Web and API together |
| `pnpm verify` | Lint, typecheck, Jest, Playwright |
| `pnpm api:types` | Regenerate `api/openapi.json` and `src/lib/api/schema.d.ts` |
| `cd api && uv run pytest` | API tests (includes the Bell-state distribution check) |

## Roadmap

1. **M0, Foundation** ✅ Monorepo, auth, RLS schema, typed API bridge, CI, landing page.
2. **M1, QuantumLab** ✅ Circuits, noise, Bell state, quantum-kernel comparison.
3. **M2, NeuroLab:** brain explorer (React Three Fiber) and reward-learning models.
4. **M3, BehaviourLab:** studies, consent, observations, analytics, export.
5. **M4, Research Assistant:** literature search, citation-grounded summaries.
6. **M5, Hardening:** API hosting, rate limits, RLS privacy tests, docs.

Read `.claude/rules/scientific-integrity.md` and the model cards in `docs/models/` before
contributing to any model or analysis.

## Credit

Built on [claude-nextjs-supabase-template](https://github.com/devharunah/claude-nextjs-supabase-template).
The Claude Code configuration in `.claude/` is MIT-licensed work by Affaan Mustafa, from
[everything-claude-code](https://github.com/affaan-m/everything-claude-code).
