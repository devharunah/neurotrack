# Sequential build: M2 → M3 → M4 → M5

This folder is the **durable state** of the M2–M5 build. Each milestone has its own brief and its
own checklist (`m2.md` … `m5.md`). Builders tick a box (`- [x]`) in the same commit as the work it
describes, so the checklists always match what is actually committed. If a session stops (usage
limits, crash, closed laptop), any new session can read these files and carry on.
`scripts/resume-build.ps1` (or `.sh`) does that automatically.

## Branches and worktrees

| Milestone | Branch | Worktree (sibling of the main checkout) |
|---|---|---|
| Base (shared seams) | `feat/m2-m5` | `neurotrack/` |
| M2 NeuroLab | `feat/m2-neurolab` | `../nt-m2` |
| M3 BehaviourLab | `feat/m3-behaviourlab` | `../nt-m3` |
| M4 Research Assistant | `feat/m4-research` | `../nt-m4` |
| M5 Hardening & deploy | `feat/m5-hardening` | `../nt-m5` |

**The build is sequential: M2, then M3, then M4, then M5.** Each milestone goes through these
steps before the next one starts:

1. **Build.** The builder works through every box in its checklist.
2. **Independent review.** A reviewer fixes the serious issues it finds.
3. **PR to `main`.** The branch is rebased onto the latest `main` first:
   `git rebase --onto origin/main feat/m2-m5`.
4. **CI must be green.** If it fails, fix it and push again.
5. **Apply the milestone's migrations** to the hosted Supabase project (dry run first).
6. **Run the Playwright E2E suite** locally against the real project, with the API running.
7. **Squash-merge.**

`feat/m2-m5` only marks the scaffold commit every milestone branch started from. Do not add
commits to it.

## Rules for every builder

1. **Work only in your own worktree, on your own branch.** Never touch another milestone's
   worktree. Never push, and never merge.
2. **Stay inside your own files.** The shared seams already exist on the base branch:
   - The dependencies are installed: `three`, `@react-three/fiber`, `@react-three/drei` and
     `@types/three` for the web app, and `pandas` for the API.
   - The API routers are registered in `api/app/main.py`: `app/behaviour/router.py` and
     `app/research/router.py`.
   - The sidebar (`src/app/(app)/nav-links.tsx`) already links every lab.

   Do not add dependencies unless you truly need one. If you do, say so in your milestone notes.
   Avoid editing these shared files unless your brief tells you to:
   - `nav-links.tsx`, `dashboard/page.tsx`, `README.md` and `CLAUDE.md` (integration updates them).
   - `package.json`, `api/pyproject.toml` and the lockfiles.
3. **Migrations.** Use the migration file name given in your brief. **Never run
   `supabase db push`** or anything else that touches the hosted database. Integration applies
   the migrations.
4. **Generated API types.** After changing API models, run `pnpm api:types` and commit
   `api/openapi.json` and `src/lib/api/schema.d.ts`. Merge conflicts in those two files are
   expected; integration regenerates them.
5. **Checks before every commit that claims a box:**
   - Web: `pnpm lint`, `pnpm typecheck` and `pnpm test`.
   - API (if you touched `api/`): `cd api && uv run ruff check . && uv run ruff format --check . && uv run pytest -q`.
   - Run `pnpm build` at least once before you finish.

   **Do not run `pnpm e2e`.** The orchestrator runs it at step 6 of the sequence. Write your Playwright
   specs and leave running them to the orchestrator.
6. **Setup in a fresh worktree:** `pnpm install --frozen-lockfile`, then
   `cd api && uv sync --locked`. Copy `.env.local` and `api/.env` from the main checkout
   (`../neurotrack/`) if they exist. They are git-ignored, so you must copy them by hand.
7. **Scientific integrity** (`.claude/rules/scientific-integrity.md`) is non-negotiable:
   - Every citation must be resolved first, through the Crossref API (`https://api.crossref.org/works/<doi>`) or NCBI E-utilities.
   - Synthetic data must be labelled as synthetic.
   - Associations must never be worded as causes.
   - Nothing may diagnose or predict anything about an individual.
8. **Commit early, in small Conventional Commits.** Each commit must leave the branch building.
   End every commit message with:
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
9. **When finished,** fill in your brief's `## Notes` section with:
   - What you built.
   - Deviations from the brief and why.
   - Anything left unchecked, and why.

## Status

The checklists in `m2.md` to `m5.md` are the status. A milestone is done when every box is ticked
and its checks pass.
