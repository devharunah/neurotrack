@AGENTS.md

# CLAUDE.md

## Project context

**NeuroTrack** is an open-source research and learning platform for addiction neuroscience,
behavioural research and experimental quantum computing, serving researchers, students and
healthcare professionals. It is educational and experimental, never clinical. Read
`.claude/rules/scientific-integrity.md` before touching any model, analysis or science copy.

Modules: **QuantumLab** (built), **NeuroLab** (next), **BehaviourLab**, **Research Assistant**.
The roadmap lives in the README.

**Stack**

- Framework: Next.js 16, App Router. Middleware is now `src/proxy.ts` (Next 16 rename)
- Language: TypeScript, strict
- UI: React 19, Tailwind CSS v4 through PostCSS, Recharts
- Data: Supabase (hosted), via `@supabase/ssr`. Schema in `supabase/migrations/`
- Science API: Python 3.12 FastAPI in `api/`, managed with `uv`. Qiskit 2, Qiskit Aer,
  qiskit-machine-learning, scikit-learn
- Package manager: pnpm, pinned in `packageManager`

**How the pieces talk**

Browser → Next.js Server Actions → FastAPI. The browser never calls the API. `src/lib/api/client.ts`
(server-only) forwards the user's Supabase access token; the API verifies it against the project
JWKS (`api/app/auth.py`). `NEUROTRACK_API_URL` is server-only. The API contract is FastAPI's
OpenAPI schema: after changing an API model, run `pnpm api:types` to regenerate
`src/lib/api/schema.d.ts` and commit both `api/openapi.json` and the types.

**Layout**

| Path | What lives there |
|---|---|
| `src/app/(marketing)/` | Landing page |
| `src/app/(auth)/` | Login, signup and their Server Actions |
| `src/app/(app)/` | Signed-in labs. The layout calls `requireUser()` |
| `src/proxy.ts` | Session refresh and the signed-out redirect for lab routes |
| `src/lib/auth.ts` | `getSessionUser`, `requireUser`, `getAccessToken` (server-only) |
| `src/lib/api/` | Typed server-only client for the FastAPI service and generated types |
| `src/lib/quantum/circuit.ts` | Pure circuit model and zod schema. Mirrors the API caps |
| `src/lib/experiments.ts` | Saves and lists rows in `experiments` (RLS: own rows only) |
| `api/` | FastAPI service. `uv run pytest`, `uv run ruff check .` |
| `supabase/migrations/` | SQL schema and RLS. Apply with `supabase db push` |
| `docs/models/` | Model cards. Every model needs one |
| `src/app/` | Routes, layouts and pages |
| `src/lib/` | Pure modules and the Supabase clients |
| `src/lib/supabase/server.ts` | Server client. Reads cookies through `next/headers` |
| `src/lib/supabase/browser.ts` | Browser client |
| `src/lib/env.ts` | `requireEnv`. Every environment variable goes through it |
| `next.config.ts` | Next config. Typed, and where `typedRoutes` and `typedEnv` are switched on |
| `eslint.config.ts` | ESLint flat config. TypeScript, loaded through `jiti` |
| `e2e/` | Playwright. Anything that renders or fetches belongs here |
| `**/__tests__/` | Jest. Pure modules only |
| `.claude/` | The Claude Code harness. See `.claude/README.md` |

## Environment

Never read `process.env` directly. Call `requireEnv` from `src/lib/env.ts`, so a missing variable
fails at the point of use with a message naming the variable and pointing at `.env.example`.

Add every new variable to `.env.example` in the same commit as the code that reads it. A variable
that only exists in someone's `.env.local` does not exist.

The service role key is server only. If a file that imports it is reachable from a client
component, that key ships to the browser.

## TypeScript

`strict` is on, and so are the flags `strict` leaves out. The ones that change how you write code:

| Flag | What it costs you |
|---|---|
| `noUncheckedIndexedAccess` | `arr[0]` and `record[key]` come back `T \| undefined`. Narrow before use |
| `exactOptionalPropertyTypes` | `{ a?: string }` will not accept `{ a: undefined }`. Omit the key instead |
| `noPropertyAccessFromIndexSignature` | Index signatures need brackets: `process.env["CI"]`, never `process.env.CI` |
| `verbatimModuleSyntax` | Type-only imports must say `import type`. No exceptions |
| `noUnusedLocals`, `noUnusedParameters` | An unused binding fails the build. Prefix with `_` if it has to stay |
| `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noImplicitOverride` | Every branch returns, every case breaks, every override is declared |

Biome's `useLiteralKeys` is off in `biome.json` because it is the exact inverse of
`noPropertyAccessFromIndexSignature`: it rewrites `process.env["CI"]` back to `process.env.CI`,
which the compiler then rejects. The compiler flag wins, so the lint rule goes. Do not switch it
back on without removing the compiler flag in the same commit.

`typedRoutes` generates route types into `.next/types`, so a bad `Link href` is a compile error.
`experimental.typedEnv` types the variables the dev server loaded. Both write into `.next/types`,
which a clean clone does not have, so `pnpm typecheck` runs `next typegen` first. That is why the
script is not a bare `tsc --noEmit`: without it, CI would typecheck a project whose route and env
types do not exist yet and pass for the wrong reason.

`next-env.d.ts` is generated and git-ignored, on Next's own instruction. Never edit it, and never
commit it back.

## The test split

This is the line that decides where a test goes:

- **Jest** covers pure modules. No DOM that matters, no network, no Supabase.
- **Playwright** covers anything that renders, fetches or runs on the server. It boots the real
  app, so it is the only place that can prove a Server Action actually runs. A `"use server"`
  module typechecks cleanly and still fails the first time a person presses submit.

Jest and Playwright both claim `*.spec.ts` by default. `jest.config.cjs` ignores `e2e/`
explicitly. Without that, Jest collects the Playwright suite, finds no browser, and reports a wall
of failures that look like the unit tests broke. **Name unit tests `*.test.ts`.**

## Before you push

```bash
pnpm verify
```

That chains lint, typecheck, Jest and Playwright. If you touched `api/`, also run
`cd api && uv run ruff check . && uv run ruff format --check . && uv run pytest`. Do not push if
any step fails. Keep the branch
buildable at every commit.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>
```

Types: `feat`, `fix`, `style`, `refactor`, `test`, `chore`, `docs`, `perf`, `ci`, `revert`.

Subject line in imperative mood, lowercase, no trailing period, 72 characters at most. Breaking
changes take a `!` after the type or scope and a `BREAKING CHANGE:` footer.

Commit early and often. One logical change per commit, never unrelated changes bundled together.

## Branches

Never push to `main`. Everything goes through a PR, and `main` stays deployable.

```
<type>/<short-description>
```

CI runs on every PR and must be green before merge.

## What the harness adds

`.claude/` carries subagents, slash commands, skills, rules and hooks, vendored from
[everything-claude-code](https://github.com/devharunah/everything-claude-code). Read
`.claude/README.md` for what is there and what was changed from upstream.

**This file wins.** Where a vendored rule disagrees with anything above, the text here is the
answer. The vendored rules were written for a general audience and know nothing about this
project.
