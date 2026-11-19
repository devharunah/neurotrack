# Deploying NeuroTrack

NeuroTrack has three parts, deployed separately:

| Part | What it is | Suggested host |
|---|---|---|
| Database and auth | Postgres with RLS, Supabase Auth | Supabase (hosted project) |
| Web app | Next.js 16 (App Router, Server Actions) | Vercel |
| API | FastAPI + Qiskit, Docker image in `api/` | Render (`render.yaml`), Hugging Face Spaces (Docker) or Fly.io |

Browsers talk only to the web app and Supabase. The web app calls the API server-to-server with
the user's access token; the API verifies it against the Supabase JWKS. The API has no CORS and
should not be advertised to browsers.

Do the steps in order. Nothing in this repository deploys by itself: CI only checks and builds.

## 0. Before the first deploy

- [ ] **Upgrade Next.js.** `pnpm audit --prod` (the CI `security` job) reports critical advisories
      against the pinned `next` (16.3.4) that are fixed in 16.4.1 or later, including remote code
      execution in image optimisation. Upgrade `next` (and `eslint-config-next` to match), run
      every check and the E2E suite, then deploy. Do not deploy a version the audit flags as
      critical.
- [ ] CI is green on `main`, including `api-image` (the Docker image builds and passes its own
      healthcheck).
- [ ] Decide the public URLs, for example `https://neurotrack.example.org` (web) and
      `https://neurotrack-api.onrender.com` (API). You need them below.

## 1. Supabase

1. **Create the project** in the region closest to your users. Note the project URL
   (`https://<ref>.supabase.co`) and the **publishable** key (Project Settings → API Keys). The
   web app and API never need the secret/service-role key.
2. **Apply the migrations** in `supabase/migrations/` in file-name order, from a machine with the
   Supabase CLI:

   ```bash
   supabase login
   supabase link --project-ref <ref>
   supabase db push --dry-run   # review exactly which migrations will run
   supabase db push
   ```

   Then run the checks at the end of `supabase/tests/rls_checklist.md` in the SQL editor; each
   query must return no rows. Migrations are forward-only; to undo one, write a new migration.
3. **Auth URLs** (Authentication → URL Configuration):
   - *Site URL*: the web app's public URL, e.g. `https://neurotrack.example.org`.
   - *Redirect URLs*: `https://neurotrack.example.org/auth/callback` (add preview URLs, e.g.
     `https://*-<team>.vercel.app/auth/callback`, only if you test sign-up on previews).
   The app builds `emailRedirectTo` as `<site origin>/auth/callback?next=…`, and
   `/auth/callback` accepts both the PKCE `code` flow and the `token_hash` flow.
4. **Email templates** (Authentication → Emails). The default templates work with the PKCE flow.
   If you customise them, link to
   `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email&next=/dashboard`
   (use `type=recovery` for password reset). Set up custom SMTP before real users sign up: the
   built-in sender is meant for testing and is heavily rate limited (check Supabase's current
   limits).
5. **Auth settings**: keep email confirmation on, set a minimum password length, and review the
   auth rate limits.

## 2. The API

The image is defined by `api/Dockerfile`: Python 3.12 slim, dependencies installed from
`uv.lock` without dev tools, non-root user, `uvicorn` on `$PORT` with `$WEB_CONCURRENCY` workers,
and a `HEALTHCHECK` on `/health`.

### Environment variables

| Variable | Required | Value |
|---|---|---|
| `SUPABASE_URL` | yes | `https://<ref>.supabase.co` |
| `ENVIRONMENT` | yes (image default) | `production`: enables HSTS and refuses `ALLOWED_HOSTS=*` |
| `ALLOWED_HOSTS` | yes | The API's host name(s), comma-separated, e.g. `neurotrack-api.onrender.com` |
| `TRUST_PROXY_HEADERS` | behind a platform proxy | `true` on Render, Fly.io and Hugging Face Spaces |
| `PORT` | set by most platforms | Port to listen on (default 8000) |
| `WEB_CONCURRENCY` | no | uvicorn workers (default 1). Rate limits are per worker |
| `NCBI_API_KEY` | no | Raises the PubMed E-utilities rate limit |
| `RATE_LIMIT_*`, `MAX_BODY_BYTES` | no | See `api/.env.example` for the defaults |

`OLLAMA_URL` is for local development; leave it unset in production unless you run an Ollama
server you control on a private network.

### Option A: Render (`render.yaml`)

1. In Render, choose **New → Blueprint** and select this repository. Render reads `render.yaml`.
2. Fill in the variables marked `sync: false` (`SUPABASE_URL`, `ALLOWED_HOSTS`, optionally
   `NCBI_API_KEY`). `ALLOWED_HOSTS` is the service's `*.onrender.com` host name.
3. Deploy, then open `https://<service>.onrender.com/health`.

The free instance type sleeps when idle, so the first request after a pause is slow, and its
memory is limited. Check Render's current limits before relying on it; a paid instance avoids
both.

### Option B: Hugging Face Spaces (Docker)

1. Create a Space with the **Docker** SDK and push the contents of `api/` to it (the Space's
   repository root must contain the `Dockerfile`).
2. Spaces route traffic to the port given by `app_port` in the Space's `README.md` front matter;
   set `app_port: 8000` (the image's default `PORT`).
3. Add `SUPABASE_URL`, `ALLOWED_HOSTS=<owner>-<space>.hf.space` and `TRUST_PROXY_HEADERS=true`
   as Space secrets/variables.
4. Make the Space public or call it with a token; check Spaces' current sleep and hardware
   limits.

### Option C: Fly.io

```bash
cd api
fly launch --no-deploy        # generates fly.toml from the Dockerfile; set internal_port = 8000
fly secrets set SUPABASE_URL=https://<ref>.supabase.co ALLOWED_HOSTS=<app>.fly.dev TRUST_PROXY_HEADERS=true
fly deploy
```

Add an HTTP check on `/health` in `fly.toml`.

### Rolling back the API

The API is stateless, so rolling back is redeploying the previous image: on Render use
**Rollback** on an earlier deploy, on Fly.io `fly releases` then `fly deploy --image <previous>`,
on Spaces revert the commit. Roll the API back on its own only if the web app does not depend on
a newer API response shape (`src/lib/api/schema.d.ts` is generated from `api/openapi.json`; a
change there means web and API move together).

## 3. The web app on Vercel

1. Import the repository in Vercel. Framework preset: Next.js. Install command:
   `pnpm install --frozen-lockfile`; build command: `pnpm build`.
2. Set the environment variables for **Production** (and Preview if you use previews):

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | Also baked into the CSP `connect-src` at build time: redeploy after changing it |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the publishable key | Public by design; RLS protects the data |
| `NEUROTRACK_API_URL` | `https://<api host>` | Server-only. Never prefix with `NEXT_PUBLIC_` |

3. Deploy, then add your custom domain and update Supabase's Site URL and Redirect URLs to match.

The app sends HSTS, a CSP without `unsafe-eval` in production, `frame-ancestors 'none'` and the
other security headers from `next.config.ts` on every route.

### Rolling back the web app

Use Vercel's **Instant Rollback** to an earlier production deployment. Database migrations are not
rolled back with it: every migration should stay compatible with the previous web release, or
be applied together with a matching web deploy.

## 4. Post-deploy smoke test

Run after every production deploy (the Playwright suite covers more, against any environment,
with `E2E_*` set):

1. `curl -fsS https://<api host>/health` returns `{"status":"ok",…}`, and the response has
   `strict-transport-security` and `x-request-id` headers.
2. `curl -sI https://<web host>/` shows `content-security-policy`, `strict-transport-security`
   and `x-content-type-options: nosniff`.
3. Open the landing page; the footer links to Privacy and Terms.
4. Sign up with a test address, confirm the email, and land on `/dashboard`.
5. QuantumLab: load the presets and run a Bell-state circuit (exercises web → API → JWKS).
6. NeuroLab: the 3D brain renders (or the no-WebGL notice appears) with no CSP errors in the
   browser console.
7. BehaviourLab: create a synthetic study, generate synthetic data, run the analysis, export the
   CSV, then delete the study.
8. Research Assistant: run a literature search and open a result link.
9. Settings: download your data, then delete the test account's experiment history.
10. Check the API logs show one JSON line per request, with no tokens or bodies.

If any step fails, roll back the part that changed (above) before investigating.
