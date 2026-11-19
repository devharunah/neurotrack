-- NeuroTrack M5: hardening of BehaviourLab (carry-over from the M3 review, docs/build/m3.md).
--
-- 1. Join-code guessing is throttled. `preview_study` and `join_study` record every lookup of a
--    code that matches no active study in `join_attempts` and refuse further lookups once a user
--    has 10 failures in the last hour (SQLSTATE PT429, which PostgREST answers with HTTP 429).
--    A failed lookup returns no rows instead of raising, because an exception would roll back
--    the attempt row it just recorded (Postgres has no autonomous transactions).
-- 2. Consent text is verified. `consent_versions` lists every published consent version with the
--    SHA-256 of its canonical text (src/lib/behaviour/consent.ts). `join_study` rejects any
--    version/hash pair not in it, and a foreign key on `consents` enforces the same for new rows.
-- 3. Observations: `created_at` is always the server time, `answers` holds at most 5 keys (the
--    custom-question limit), and a person who joined with a code can submit at most one check-in
--    per minute per study. Generated synthetic participants (the seeder) are exempt from the rate.
-- 4. The export audit is written only by `log_study_export`, which counts the rows itself.
--    Researchers can no longer insert `export_audit` rows directly.
--
--    BY DESIGN: study members can still read a study's pseudonymous observations directly through
--    PostgREST, without an audit row. The audit records exports made through the app, not every
--    read; see docs/privacy-and-data.md.
-- 5. `join_study` now returns the study id with the pseudonym, so the app never has to look the
--    study up by pseudonym (pseudonyms are unique only within one study). Changing the return type
--    needs DROP + CREATE, so its grants are restated below.
-- 6. Trigger functions lose their default EXECUTE grants, and M0's tables lose anon's privileges.
--
-- Every function is security definer with `set search_path = ''`, and every name is qualified.

-- ---------------------------------------------------------------------------------------------
-- 1. Join-code throttling
-- ---------------------------------------------------------------------------------------------

-- Failed join-code lookups. Internal: no client can read or write it.
create table public.join_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index join_attempts_user_time_idx on public.join_attempts (user_id, attempted_at desc);

alter table public.join_attempts enable row level security;
revoke all on public.join_attempts from anon, authenticated;

-- Raises PT429 when the caller has 10 or more failed lookups in the last hour. Takes a per-user
-- advisory lock for the rest of the transaction, so parallel guesses are counted one at a time.
create function public.join_code_throttle()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  failures integer;
begin
  if uid is null then
    raise exception using errcode = '42501', message = 'You need to be signed in.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('neurotrack.join_attempts:' || uid::text, 0));
  -- Keep the table small: only the last day per user is ever needed.
  delete from public.join_attempts a
  where a.user_id = uid and a.attempted_at < now() - interval '1 day';
  select count(*) into failures
  from public.join_attempts a
  where a.user_id = uid and a.attempted_at > now() - interval '1 hour';
  if failures >= 10 then
    raise exception using
      errcode = 'PT429',
      message = 'Too many join codes that did not match a study. Wait an hour, then check the code with the researcher and try again.';
  end if;
end;
$$;

create function public.record_failed_join_attempt()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.join_attempts (user_id) values ((select auth.uid()));
$$;

-- Same signature and result columns as M3, now volatile so it can record failures.
create or replace function public.preview_study(p_join_code text)
returns table (title text, description text, synthetic boolean, prompts_per_day integer,
               duration_days integer, already_joined boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  target public.studies%rowtype;
begin
  if uid is null then
    return;
  end if;
  perform public.join_code_throttle();

  select * into target from public.studies s
  where s.join_code = upper(btrim(p_join_code)) and s.status = 'active';
  if not found then
    perform public.record_failed_join_attempt();
    return;
  end if;

  return query
    select target.title, target.description, target.synthetic,
           (target.schedule ->> 'prompts_per_day')::int,
           (target.schedule ->> 'duration_days')::int,
           exists (
             select 1 from public.participant_links l
             join public.consents c
               on c.participant_id = l.participant_id and c.withdrawn_at is null
             where l.study_id = target.id and l.user_id = uid
           );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. Published consent versions
-- ---------------------------------------------------------------------------------------------

-- Never update or delete a row: add a new version instead, so old consents stay verifiable.
create table public.consent_versions (
  version text primary key check (version ~ '^[0-9A-Za-z.\-]{1,32}$'),
  text_hash text not null check (text_hash ~ '^[0-9a-f]{64}$'),
  published_at timestamptz not null default now(),
  unique (version, text_hash)
);

alter table public.consent_versions enable row level security;
revoke all on public.consent_versions from anon, authenticated;
grant select on public.consent_versions to authenticated;

create policy "consent_versions: signed-in read"
  on public.consent_versions for select to authenticated
  using (true);

-- SHA-256 of consentText(V1) in src/lib/behaviour/consent.ts. A Jest test checks that this
-- migration seeds the hash the app computes, so the two cannot drift apart silently.
insert into public.consent_versions (version, text_hash)
values ('1.0', 'ab89c3548d0430161c1c11a8c8e60baf7cfe0eae8a2f4ea0e729d9d80d290fc4');

-- New consent rows must name a published version and its exact hash. NOT VALID: rows written
-- before this migration are not re-checked (they were validated by the Server Action).
alter table public.consents
  add constraint consents_published_version_fkey
  foreign key (consent_version, consent_text_hash)
  references public.consent_versions (version, text_hash)
  not valid;

-- ---------------------------------------------------------------------------------------------
-- 5. join_study returns (study id, pseudonym); 1 and 2 are enforced inside it
-- ---------------------------------------------------------------------------------------------

drop function public.join_study(text, text, text);

-- Create (or re-consent) the caller's participant in one transaction. Returns one row with the
-- study id and pseudonym, or no rows when no active study uses the code (counted as a failure).
-- The result columns are prefixed so they cannot clash with table columns inside the body.
create function public.join_study(
  p_join_code text,
  p_consent_version text,
  p_consent_text_hash text
)
returns table (joined_study_id uuid, joined_pseudonym text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  target public.studies%rowtype;
  existing_participant uuid;
  new_participant uuid;
  new_pseudonym text;
  attempts integer := 0;
begin
  if uid is null then
    raise exception using errcode = '42501', message = 'You need to be signed in.';
  end if;
  if p_consent_version is null or p_consent_version !~ '^[0-9A-Za-z.\-]{1,32}$' then
    raise exception using errcode = '22023', message = 'Invalid consent version.';
  end if;
  if p_consent_text_hash is null or p_consent_text_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid consent text hash.';
  end if;
  if not exists (
    select 1 from public.consent_versions v
    where v.version = p_consent_version and v.text_hash = p_consent_text_hash
  ) then
    raise exception using errcode = '22023',
      message = 'The consent text has changed. Reload the page and read the current version.';
  end if;

  perform public.join_code_throttle();

  select * into target from public.studies s
  where s.join_code = upper(btrim(p_join_code)) and s.status = 'active'
  for share;
  if not found then
    perform public.record_failed_join_attempt();
    return;
  end if;

  select l.participant_id into existing_participant
  from public.participant_links l
  where l.study_id = target.id and l.user_id = uid;

  if existing_participant is not null then
    insert into public.consents (participant_id, consent_version, consent_text_hash)
    select existing_participant, p_consent_version, p_consent_text_hash
    where not exists (
      select 1 from public.consents c
      where c.participant_id = existing_participant and c.withdrawn_at is null
    );
    return query
      select target.id, p.pseudonym from public.participants p where p.id = existing_participant;
    return;
  end if;

  loop
    attempts := attempts + 1;
    new_pseudonym := 'P-' || public.random_code(case when attempts > 5 then 6 else 4 end);
    insert into public.participants (study_id, pseudonym, synthetic)
    values (target.id, new_pseudonym, target.synthetic)
    on conflict (study_id, pseudonym) do nothing
    returning id into new_participant;
    exit when new_participant is not null;
    if attempts >= 20 then
      raise exception 'Could not allocate a pseudonym; try again.';
    end if;
  end loop;

  insert into public.participant_links (participant_id, study_id, user_id)
  values (new_participant, target.id, uid);

  insert into public.consents (participant_id, consent_version, consent_text_hash)
  values (new_participant, p_consent_version, p_consent_text_hash);

  return query select target.id, new_pseudonym;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. Observations: server timestamps, bounded answers, per-participant rate
-- ---------------------------------------------------------------------------------------------

create function public.observations_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  key_count integer;
begin
  -- Whatever the client sent, the row records when the server received it.
  new.created_at := now();

  -- One key per custom question; a study has at most 5 (the `studies.questionnaire` CHECK).
  if jsonb_typeof(new.answers) = 'object' then
    select count(*) into key_count from jsonb_object_keys(new.answers);
    if key_count > 5 then
      raise exception using
        errcode = 'check_violation',
        message = 'A check-in can hold at most 5 custom answers.';
    end if;
  end if;

  -- People submit at most one check-in per minute per study. The seeder's generated synthetic
  -- participants (S-) are exempt: it writes many observations for each in one request.
  if not public.is_generated_participant(new.participant_id) then
    perform pg_advisory_xact_lock(
      hashtextextended('neurotrack.observations:' || new.participant_id::text, 0)
    );
    if exists (
      select 1 from public.observations o
      where o.participant_id = new.participant_id
        and o.created_at > now() - interval '1 minute'
    ) then
      raise exception using
        errcode = 'PT429',
        message = 'You saved a check-in less than a minute ago. Please wait a moment before the next one.';
    end if;
  end if;

  return new;
end;
$$;

create trigger observations_before_insert
  before insert on public.observations
  for each row execute function public.observations_before_insert();

-- Observations are never edited. There is no update policy; remove the privilege as well.
revoke update on public.observations from authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. Trustworthy export audit
-- ---------------------------------------------------------------------------------------------

drop policy "export_audit: members log own exports" on public.export_audit;
revoke insert, update, delete, truncate on public.export_audit from authenticated;

-- Logs an export of the study by the caller and returns the number of observations it covers,
-- counted here rather than taken from the client.
create function public.log_study_export(p_study_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  observation_count integer;
begin
  if uid is null then
    raise exception using errcode = '42501', message = 'You need to be signed in.';
  end if;
  if not public.is_study_member(p_study_id) then
    raise exception using errcode = '42501', message = 'Only members of this study can export it.';
  end if;
  select count(*)::int into observation_count
  from public.observations o
  where o.study_id = p_study_id;
  insert into public.export_audit (study_id, user_id, row_count)
  values (p_study_id, uid, observation_count);
  return observation_count;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------------------------

-- Internal helpers and trigger functions: never called directly by a client. (Triggers fire
-- without an EXECUTE check; Supabase's default privileges grant EXECUTE to anon/authenticated.)
revoke execute on function
  public.join_code_throttle(),
  public.record_failed_join_attempt(),
  public.observations_before_insert(),
  public.handle_new_user(),
  public.studies_add_owner_member(),
  public.studies_guard_synthetic_switch(),
  public.participants_match_study()
from public, anon, authenticated;

-- M0 relied on policies alone for anon; make it explicit like every later migration.
revoke all on public.profiles, public.experiments from anon;

revoke execute on function
  public.preview_study(text),
  public.join_study(text, text, text),
  public.log_study_export(uuid)
from public, anon;

grant execute on function
  public.preview_study(text),
  public.join_study(text, text, text),
  public.log_study_export(uuid)
to authenticated;
