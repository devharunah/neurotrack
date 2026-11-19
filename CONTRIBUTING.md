# Contributing to NeuroTrack

Thank you for helping. NeuroTrack is an educational, open-source research platform for addiction
neuroscience, behavioural research and experimental quantum computing. Because it touches health
topics and data about people, scientific integrity and privacy rules apply to every change.

## Setup

You need Node.js 20+, [pnpm](https://pnpm.io) 10 (pinned in `package.json`), and
[uv](https://docs.astral.sh/uv/), which installs Python 3.12 for the API.

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local            # Supabase URL + publishable key, NEUROTRACK_API_URL
cd api && uv sync --locked && cp .env.example .env && cd ..
pnpm dev:all                          # web on :3000, API on :8000
```

Apply the migrations in `supabase/migrations/` to your own Supabase project (or a local one with
`supabase start`). Never point development at a production database.

## Checks

Run these before every commit; CI runs the same ones.

```bash
pnpm check          # Biome formatting and import order (pnpm biome check --write . fixes it)
pnpm lint           # ESLint + Biome lint
pnpm typecheck
pnpm test           # Jest, for pure modules
pnpm build          # at least before opening a PR

cd api
uv run ruff check . && uv run ruff format --check .
uv run pytest -q
```

- After changing API models, run `pnpm api:types` and commit `api/openapi.json` and
  `src/lib/api/schema.d.ts`.
- Playwright specs live in `e2e/`. Signed-in specs need dedicated test users (`E2E_*` in
  `.env.example`); `pnpm e2e` builds and starts the app itself.
- Database changes go in a new, timestamped file in `supabase/migrations/`. Enable RLS on every
  new table, revoke everything from `anon`, make definer functions `set search_path = ''`, and
  add the table to `supabase/tests/rls_checklist.md`.
- Read `AGENTS.md` and `CLAUDE.md` for the code conventions (strict TypeScript, `requireEnv`,
  Next.js 16 APIs, no secrets in client code).

## Commits and pull requests

Use [Conventional Commits](https://www.conventionalcommits.org): `feat(scope): …`, `fix: …`,
`docs: …`, `test: …`, `refactor: …`, `ci: …`, `chore: …`. Keep commits small and leave the branch
building at each one. Open pull requests against `main`, describe what changed and how you
tested it, and keep CI green.

Do not add dependencies without a clear need; say why in the PR. Never commit `.env*` files,
keys or real participant data.

## Scientific integrity (non-negotiable)

The full rules are in `.claude/rules/scientific-integrity.md`. In short:

- **Never invent a citation.** Every reference must be resolved through Crossref
  (`https://api.crossref.org/works/<doi>`) or NCBI E-utilities. If you cannot verify one, leave
  `TODO(citation)`.
- **Associations are never causes.** Behavioural analytics report associations with their
  uncertainty and sample size, and are worded that way.
- **Nothing diagnoses, predicts an individual's relapse, or recommends treatment.** Models do not
  measure dopamine or brain activity.
- **No claimed quantum advantage.** Quantum results sit next to classical baselines on the same
  data.
- **Synthetic data is labelled synthetic**, in API responses and in the UI. Real participant data
  needs documented institutional and ethical approval, including applicable Ugandan
  requirements.
- Every computational model has a model card in `docs/models/`, and every lab page shows the
  educational disclaimer.

## Reporting security issues

Please follow `SECURITY.md` and report privately, not in a public issue.
