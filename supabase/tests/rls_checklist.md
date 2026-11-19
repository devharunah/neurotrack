# Row-level security checklist

Every table in `public`, the migration that creates it, and the access it is meant to allow. Use
it at integration to review each migration, and after `supabase db push` to check the live
project with the SQL at the end. `e2e/privacy.spec.ts` exercises the cross-user rows marked ✱.

Conventions in every migration:

- RLS is enabled on every table, and `anon` has no privileges on any of them.
- Policies are written `to authenticated` and compare against `(select auth.uid())`.
- Helpers that read across RLS are `security definer`, `set search_path = ''`, and only ever
  answer questions about `auth.uid()`. Their EXECUTE is revoked from `public, anon`.
- No `service_role` key is used by the web app or the API. The operator's dashboard access is
  outside this model.

Migrations: M0 `20261119000000_init_profiles_experiments.sql`, M3
`20261120000000_behaviourlab.sql`, M4 `20261120000100_research.sql`, M5
`20261120000200_hardening.sql`. M2 NeuroLab adds no tables; it saves runs to `experiments`.

## Tables

| Table | From | SELECT | INSERT | UPDATE | DELETE | Notes |
|---|---|---|---|---|---|---|
| `profiles` ✱ | M0 | own row | none (trigger `handle_new_user` on `auth.users`) | own row, **`display_name` column only** (column grant) | none (cascades from `auth.users`) | `role` is never client-writable. ✱ B cannot read/update/delete A; nobody changes their own role. |
| `experiments` ✱ | M0 | own rows | own rows (`user_id = auth.uid()`) | none (no policy) | own rows | `/settings` deletes all own rows. ✱ B cannot read/update/delete A's rows or insert as A. |
| `studies` | M3 | owner or study member | as owner (`owner_id = auth.uid()`); column grant excludes `owner_id`, `join_code` | owner only; same column grant | owner only | CHECK: real data needs `ethics_approval_ref`. Trigger blocks mixing synthetic and real participants. |
| `study_members` | M3 | members of the study | none (trigger adds the owner) | none | owner removes `researcher` rows | |
| `participants` | M3 | study members; the person themself while consented | members of a *synthetic* study, `S-` pseudonyms only (seeder) | none | members, synthetic rows only | Joined (`P-`) participants are created only by `join_study`. No PII column exists. |
| `participant_links` | M3 | own rows only | none (`join_study` only) | none | none (cascades) | The only account-to-pseudonym mapping. **No researcher policy.** ✱ B cannot read A's links. |
| `consents` | M3 | study members (status); the person themself | none (`join_study` only) | none (`withdraw_consent` only) | none (cascades) | M5: FK `(consent_version, consent_text_hash)` → `consent_versions` (NOT VALID). |
| `observations` | M3, M5 | study members; the person themself while consented | the person, for their own participant, while consented and the study is active, `observed_at` within [-7 days, +5 min]; seeder for `S-` participants of synthetic studies | none (M5 revokes the privilege too) | none directly (`withdraw_consent(..., true)` deletes own; cascades) | M5 trigger: `created_at := now()`, ≤ 5 `answers` keys, ≤ 1 per minute per joined participant (PT429). Members reading observations directly is by design and not audited. |
| `export_audit` | M3, M5 | study members | **none** (M5 dropped the policy and the privilege) — only `log_study_export()` | none | none (cascades) | M5: the RPC checks membership and counts `row_count` itself. |
| `literature_references` | M4 | own rows (`inserted_by`) | own rows, listed columns only | none (privilege revoked) | none (privilege revoked) | Per-user cache, so nobody can plant records for others. |
| `saved_references` ✱ | M4 | own rows | own rows, referencing own cached record only | own rows, `note` column only | own rows | ✱ B cannot read A's. |
| `research_queries` ✱ | M4 | own rows | own rows | none (privilege revoked) | own rows | ✱ B cannot read A's. |
| `join_attempts` ✱ | M5 | **none** (no policy, all privileges revoked) | none (definer RPCs only) | none | none (RPC prunes > 1 day) | Failed join-code lookups per user. ✱ a client read is refused. |
| `consent_versions` | M5 | any signed-in user | none (migrations only) | none | none | Public metadata: version and SHA-256 of the consent text. |

## Functions callable by signed-in users

| Function | Kind | Purpose and guard |
|---|---|---|
| `preview_study(text)` | definer, volatile (M5) | Study summary for a join code. Throttled: 10 failed codes per user per hour (PT429). |
| `join_study(text, text, text)` | definer (M5 returns `joined_study_id, joined_pseudonym`) | Creates participant, link and consent. Rejects unpublished consent hashes; throttled like preview. |
| `withdraw_consent(uuid, boolean)` | definer | Withdraws the caller's own consent; optionally deletes their observations. |
| `my_participations()` | definer, stable | The caller's own participations only. |
| `log_study_export(uuid)` | definer (M5) | Members only; inserts the audit row with a server-side count. |
| `cache_literature_references(jsonb)` | **invoker** | Convenience upsert into the caller's own cache; RLS still applies. |
| `random_code`, `is_study_member`, `is_study_owner`, `current_participant_ids`, `can_seed_study`, `is_study_active`, `is_generated_participant` | definer helpers | Used by policies and defaults; each answers only about `auth.uid()`. |

Internal only (EXECUTE revoked from `authenticated` too): `join_code_throttle()`,
`record_failed_join_attempt()`, and all trigger functions (`handle_new_user`,
`studies_add_owner_member`, `studies_guard_synthetic_switch`, `participants_match_study`,
`observations_before_insert`).

## Checking the live project

Run in the Supabase SQL editor after applying the migrations. Each query should return no rows.

```sql
-- 1. Tables in public without RLS.
select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

-- 2. Any table privilege held by anon.
select table_name, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon';

-- 3. Public functions anon can execute.
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');

-- 4. Security definer functions without a pinned search_path.
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) s where s like 'search_path=%');

-- 5. Tables in public missing from this checklist (update the list when adding a table).
select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and c.relname not in (
    'profiles', 'experiments', 'studies', 'study_members', 'participants', 'participant_links',
    'consents', 'observations', 'export_audit', 'literature_references', 'saved_references',
    'research_queries', 'join_attempts', 'consent_versions'
  );
```

Then run `e2e/privacy.spec.ts` with two test users (see `.env.example`).
