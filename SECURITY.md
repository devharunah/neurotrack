# Security policy

NeuroTrack stores account data and, in BehaviourLab, pseudonymous research data about people.
We take reports seriously and are grateful for them.

## Reporting a vulnerability

**Please do not open a public issue, discussion or pull request for a security problem.**

Report it privately through GitHub's private vulnerability reporting:
[Security → Report a vulnerability](https://github.com/devharunah/neurotrack/security/advisories/new).

Include, as far as you can:

- what is affected (web app route, API endpoint, migration, policy or function) and the commit
  or deployment you tested;
- the steps to reproduce, and what an attacker gains (for example, reading another user's rows
  or a participant's account-to-pseudonym link);
- any suggested fix.

We aim to acknowledge a report within a few working days, keep you informed while we fix it,
and credit you in the advisory unless you prefer otherwise. This is a volunteer-maintained,
open-source project, so there is no bug bounty.

## Scope

In scope: this repository's code, including the Next.js app, the FastAPI service, the Supabase
migrations and their row-level security, and the deployment configuration (`api/Dockerfile`,
`render.yaml`, CI workflows).

Out of scope: denial of service by volume, findings that need a compromised device or a
malicious browser extension, missing hardening on third-party platforms we do not control, and
reports from automated scanners without a demonstrated impact.

## Testing rules

- Test only against your own local instance or a deployment you run. Never against someone
  else's deployment or real participants' data.
- Use test accounts you own. Do not access, change or delete other people's data; if you reach
  any by accident, stop and tell us what you saw.
- Do not attempt to re-identify BehaviourLab participants.

## Supported versions

Only the latest commit on `main` receives security fixes. Operators of their own deployments
should follow `main` and the Dependabot and `security` CI job results.

## How the project protects data

See `docs/privacy-and-data.md` (data inventory and consent model),
`supabase/tests/rls_checklist.md` (every table and its policies) and `docs/deploy.md`
(production configuration).
