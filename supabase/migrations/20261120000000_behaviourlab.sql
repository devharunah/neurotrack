-- NeuroTrack M3: BehaviourLab studies, consent and observations.
--
-- PRIVACY MODEL
-- =============
-- 1. Pseudonymous by construction. No table here stores a name, email, phone number or any other
--    identifier. A participant is a random pseudonym (`P-7F3K` for people who joined with a code,
--    `S-7F3K` for generated synthetic participants) scoped to one study.
-- 2. One mapping, hidden from researchers. `participant_links` is the only table that connects a
--    signed-in account (auth.users.id) to a pseudonym. Researchers have no policy on it, so they
--    can never read it. A signed-in person can read only their own link rows.
-- 3. Consent gates everything a participant does. Joining goes through the security definer RPC
--    `join_study`, which creates the participant, the link and a consent record (version plus a
--    SHA-256 hash of the exact consent text shown) in one transaction. A participant can insert
--    and read observations only while they hold an un-withdrawn consent
--    (`current_participant_ids()`). `withdraw_consent` stamps `withdrawn_at`; from then on no new
--    observations are accepted, and the participant can optionally delete what they submitted.
-- 4. Researchers see aggregates of pseudonyms. Study members (`study_members`: owner or
--    researcher) can read their studies, the pseudonymous participant rows, consent status and
--    observations, and nothing else. Exports are logged in `export_audit`.
-- 5. Synthetic first. Every study starts with `synthetic = true`. The CHECK constraint
--    `studies_real_data_requires_ethics` makes it impossible to switch a study to real data
--    without a non-empty `ethics_approval_ref`; real participant data needs institutional and
--    ethical approval, including applicable Ugandan requirements. A study cannot mix synthetic
--    and real participants (`studies_guard_synthetic_switch`).
-- 6. Nobody else can read anything. RLS is enabled on every table, `anon` gets nothing, and every
--    helper is `security definer` with `set search_path = ''`.

-- ---------------------------------------------------------------------------------------------
-- Types and random identifiers
-- ---------------------------------------------------------------------------------------------

create type public.study_status as enum ('draft', 'active', 'closed');
create type public.study_role as enum ('owner', 'researcher');

-- Random code from an unambiguous 32-letter alphabet (no 0/O, 1/I). The bytes come from
-- gen_random_uuid(), which uses a cryptographically strong source. 256 is a multiple of 32, so
-- `byte % 32` is unbiased. Bytes 6 and 8 carry the UUID version and variant, so they are skipped.
create function public.random_code(p_length integer)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  raw bytea;
  usable integer[] := array[0, 1, 2, 3, 4, 5, 7, 9, 10, 11, 12, 13, 14, 15];
  result text := '';
  i integer;
begin
  if p_length < 1 or p_length > 14 then
    raise exception 'random_code length must be between 1 and 14';
  end if;
  raw := uuid_send(gen_random_uuid());
  for i in 1..p_length loop
    result := result || substr(alphabet, (get_byte(raw, usable[i]) % 32) + 1, 1);
  end loop;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

create table public.studies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  synthetic boolean not null default true,
  ethics_approval_ref text check (char_length(ethics_approval_ref) <= 200),
  join_code text not null unique default public.random_code(8)
    check (join_code ~ '^[2-9A-HJ-NP-Z]{8}$'),
  questionnaire jsonb not null default '{
    "version": 1,
    "fields": {
      "mood": true, "stress": true, "sleep_quality": true, "craving_intensity": true,
      "environment": true, "social_context": true, "substance_use": false
    },
    "custom": []
  }'::jsonb
    check (
      jsonb_typeof(questionnaire) = 'object'
      and jsonb_typeof(questionnaire -> 'fields') = 'object'
      and jsonb_typeof(questionnaire -> 'custom') = 'array'
      and jsonb_array_length(questionnaire -> 'custom') <= 5
    ),
  schedule jsonb not null default '{"prompts_per_day": 1, "duration_days": 30, "timezone": "Africa/Kampala"}'::jsonb
    check (
      jsonb_typeof(schedule) = 'object'
      and coalesce((schedule ->> 'prompts_per_day')::int, 0) between 1 and 6
      and coalesce((schedule ->> 'duration_days')::int, 0) between 1 and 365
    ),
  status public.study_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint studies_real_data_requires_ethics check (
    synthetic or (ethics_approval_ref is not null and char_length(btrim(ethics_approval_ref)) > 0)
  )
);

create index studies_owner_idx on public.studies (owner_id);

create table public.study_members (
  study_id uuid not null references public.studies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.study_role not null default 'researcher',
  created_at timestamptz not null default now(),
  primary key (study_id, user_id)
);

create index study_members_user_idx on public.study_members (user_id);

-- No personally identifying information, ever. Just a pseudonym scoped to a study.
create table public.participants (
  id uuid primary key default gen_random_uuid(),
  study_id uuid not null references public.studies (id) on delete cascade,
  pseudonym text not null check (pseudonym ~ '^[PS]-[2-9A-HJ-NP-Z]{4,8}$'),
  synthetic boolean not null default true,
  created_at timestamptz not null default now(),
  unique (study_id, pseudonym),
  -- Lets child tables prove the participant belongs to the study they name.
  unique (id, study_id),
  -- S- pseudonyms are generated by the seeder and are always synthetic. P- pseudonyms belong to
  -- people who joined with a code; they are synthetic too when the study is (practice runs).
  constraint participants_generated_are_synthetic check (synthetic or left(pseudonym, 2) = 'P-')
);

-- The only person-to-pseudonym mapping. Researchers have no policy here and never read it.
create table public.participant_links (
  participant_id uuid primary key,
  study_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  foreign key (participant_id, study_id)
    references public.participants (id, study_id) on delete cascade,
  unique (user_id, study_id)
);

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants (id) on delete cascade,
  consent_version text not null check (consent_version ~ '^[0-9A-Za-z.\-]{1,32}$'),
  consent_text_hash text not null check (consent_text_hash ~ '^[0-9a-f]{64}$'),
  given_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  check (withdrawn_at is null or withdrawn_at >= given_at)
);

create index consents_participant_idx on public.consents (participant_id);
-- At most one active consent per participant.
create unique index consents_one_active_idx
  on public.consents (participant_id) where withdrawn_at is null;

create table public.observations (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null,
  study_id uuid not null,
  observed_at timestamptz not null default now(),
  mood smallint check (mood between 0 and 10),
  stress smallint check (stress between 0 and 10),
  sleep_quality smallint check (sleep_quality between 0 and 10),
  craving_intensity smallint check (craving_intensity between 0 and 10),
  environment text check (
    environment in ('home', 'work_or_school', 'social_venue', 'outdoors', 'transit', 'other')
  ),
  social_context text check (
    social_context in ('alone', 'family', 'friends', 'colleagues', 'strangers', 'other')
  ),
  -- Voluntary disclosure: null means "not answered", never "no".
  substance_use boolean,
  answers jsonb not null default '{}'::jsonb
    check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 4096),
  created_at timestamptz not null default now(),
  foreign key (participant_id, study_id)
    references public.participants (id, study_id) on delete cascade
);

create index observations_study_observed_idx on public.observations (study_id, observed_at);
create index observations_participant_idx on public.observations (participant_id, observed_at);

create table public.export_audit (
  id uuid primary key default gen_random_uuid(),
  study_id uuid not null references public.studies (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  row_count integer not null check (row_count >= 0),
  exported_at timestamptz not null default now()
);

create index export_audit_study_idx on public.export_audit (study_id, exported_at desc);

-- ---------------------------------------------------------------------------------------------
-- Security definer helpers. They read across RLS, so each one only ever answers about auth.uid().
-- ---------------------------------------------------------------------------------------------

create function public.is_study_member(p_study_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.study_members m
    where m.study_id = p_study_id and m.user_id = (select auth.uid())
  );
$$;

create function public.is_study_owner(p_study_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.study_members m
    where m.study_id = p_study_id and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

-- Participant ids of the caller that currently hold an un-withdrawn consent.
create function public.current_participant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.participant_id
  from public.participant_links l
  where l.user_id = (select auth.uid())
    and exists (
      select 1 from public.consents c
      where c.participant_id = l.participant_id and c.withdrawn_at is null
    );
$$;

-- True when the study is synthetic and the caller is a member: the only case where a researcher
-- may write participants or observations (the synthetic-data seeder).
create function public.can_seed_study(p_study_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_study_member(p_study_id)
    and exists (select 1 from public.studies s where s.id = p_study_id and s.synthetic);
$$;

-- Participants cannot read `studies`, so their insert policy asks through this helper.
create function public.is_study_active(p_study_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.studies s where s.id = p_study_id and s.status = 'active');
$$;

-- True for participants made by the seeder (S- prefix), never for a person who joined.
create function public.is_generated_participant(p_participant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.participants p
    where p.id = p_participant_id and p.synthetic and left(p.pseudonym, 2) = 'S-'
  );
$$;

-- ---------------------------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------------------------

create function public.studies_add_owner_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.study_members (study_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

create trigger studies_add_owner_member
  after insert on public.studies
  for each row execute function public.studies_add_owner_member();

create function public.studies_guard_synthetic_switch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.synthetic is distinct from old.synthetic then
    if exists (
      select 1 from public.participants p
      where p.study_id = new.id and p.synthetic is distinct from new.synthetic
    ) then
      raise exception using
        errcode = 'check_violation',
        message = case when new.synthetic
          then 'This study already has real participants, so it cannot go back to synthetic data.'
          else 'Delete the synthetic data before switching this study to real data.'
        end;
    end if;
  end if;
  return new;
end;
$$;

create trigger studies_guard_synthetic_switch
  before update on public.studies
  for each row execute function public.studies_guard_synthetic_switch();

-- A participant's synthetic flag always matches the study at the time it is created.
create function public.participants_match_study()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.synthetic is distinct from (select s.synthetic from public.studies s where s.id = new.study_id) then
    raise exception using
      errcode = 'check_violation',
      message = 'A participant must be synthetic exactly when the study is synthetic.';
  end if;
  return new;
end;
$$;

create trigger participants_match_study
  before insert on public.participants
  for each row execute function public.participants_match_study();

-- ---------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------

alter table public.studies enable row level security;
alter table public.study_members enable row level security;
alter table public.participants enable row level security;
alter table public.participant_links enable row level security;
alter table public.consents enable row level security;
alter table public.observations enable row level security;
alter table public.export_audit enable row level security;

revoke all on public.studies, public.study_members, public.participants, public.participant_links,
  public.consents, public.observations, public.export_audit from anon;

-- studies ------------------------------------------------------------------------------------
-- The owner clause lets `insert ... returning` see the new row before the member trigger runs.
create policy "studies: members read"
  on public.studies for select to authenticated
  using ((select auth.uid()) = owner_id or (select public.is_study_member(id)));

create policy "studies: create as owner"
  on public.studies for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "studies: owner updates"
  on public.studies for update to authenticated
  using ((select public.is_study_owner(id)))
  with check ((select public.is_study_owner(id)));

create policy "studies: owner deletes"
  on public.studies for delete to authenticated
  using ((select public.is_study_owner(id)));

-- The owner and join code are always server-generated and fixed once a study exists.
revoke insert, update on public.studies from authenticated;
grant insert (title, description, synthetic, ethics_approval_ref, questionnaire, schedule, status)
  on public.studies to authenticated;
grant update (title, description, synthetic, ethics_approval_ref, questionnaire, schedule, status)
  on public.studies to authenticated;

-- study_members ------------------------------------------------------------------------------
create policy "study_members: members read"
  on public.study_members for select to authenticated
  using ((select public.is_study_member(study_id)));

create policy "study_members: owner removes researchers"
  on public.study_members for delete to authenticated
  using ((select public.is_study_owner(study_id)) and role = 'researcher');

-- participants -------------------------------------------------------------------------------
create policy "participants: members read pseudonyms"
  on public.participants for select to authenticated
  using ((select public.is_study_member(study_id)));

create policy "participants: read own while consented"
  on public.participants for select to authenticated
  using (id in (select public.current_participant_ids()));

create policy "participants: seed synthetic"
  on public.participants for insert to authenticated
  with check (
    synthetic and left(pseudonym, 2) = 'S-' and (select public.can_seed_study(study_id))
  );

create policy "participants: delete synthetic"
  on public.participants for delete to authenticated
  using (synthetic and (select public.is_study_member(study_id)));

-- participant_links: no researcher policy at all. People see only their own rows.
create policy "participant_links: read own"
  on public.participant_links for select to authenticated
  using ((select auth.uid()) = user_id);

-- consents -----------------------------------------------------------------------------------
create policy "consents: members read status"
  on public.consents for select to authenticated
  using (
    exists (
      select 1 from public.participants p
      where p.id = participant_id and (select public.is_study_member(p.study_id))
    )
  );

create policy "consents: read own"
  on public.consents for select to authenticated
  using (
    participant_id in (
      select l.participant_id from public.participant_links l
      where l.user_id = (select auth.uid())
    )
  );

-- observations -------------------------------------------------------------------------------
create policy "observations: members read"
  on public.observations for select to authenticated
  using ((select public.is_study_member(study_id)));

create policy "observations: participants read own while consented"
  on public.observations for select to authenticated
  using (participant_id in (select public.current_participant_ids()));

create policy "observations: participants insert own while consented"
  on public.observations for insert to authenticated
  with check (
    participant_id in (select public.current_participant_ids())
    and observed_at <= now() + interval '5 minutes'
    and observed_at >= now() - interval '7 days'
    and (select public.is_study_active(study_id))
  );

create policy "observations: seed synthetic"
  on public.observations for insert to authenticated
  with check (
    (select public.can_seed_study(study_id))
    and (select public.is_generated_participant(participant_id))
  );

-- export_audit -------------------------------------------------------------------------------
create policy "export_audit: members read"
  on public.export_audit for select to authenticated
  using ((select public.is_study_member(study_id)));

create policy "export_audit: members log own exports"
  on public.export_audit for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.is_study_member(study_id)));

-- ---------------------------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------------------------

-- What someone holding a join code may see before consenting. Nothing about other participants.
create function public.preview_study(p_join_code text)
returns table (title text, description text, synthetic boolean, prompts_per_day integer,
               duration_days integer, already_joined boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.title, s.description, s.synthetic,
         (s.schedule ->> 'prompts_per_day')::int,
         (s.schedule ->> 'duration_days')::int,
         exists (
           select 1 from public.participant_links l
           join public.consents c on c.participant_id = l.participant_id and c.withdrawn_at is null
           where l.study_id = s.id and l.user_id = (select auth.uid())
         )
  from public.studies s
  where s.join_code = upper(btrim(p_join_code)) and s.status = 'active'
    and (select auth.uid()) is not null;
$$;

-- Create (or re-consent) the caller's participant in one transaction. Returns the pseudonym.
create function public.join_study(
  p_join_code text,
  p_consent_version text,
  p_consent_text_hash text
)
returns text
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

  select * into target from public.studies s
  where s.join_code = upper(btrim(p_join_code)) and s.status = 'active'
  for share;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'No active study uses that join code.';
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
    return (select p.pseudonym from public.participants p where p.id = existing_participant);
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

  return new_pseudonym;
end;
$$;

-- Withdraw the caller's consent for a study. Optionally delete everything they submitted.
-- Returns the number of consent records withdrawn (0 when there was nothing to withdraw).
create function public.withdraw_consent(p_study_id uuid, p_delete_data boolean default false)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  target_participant uuid;
  withdrawn integer;
begin
  if uid is null then
    raise exception using errcode = '42501', message = 'You need to be signed in.';
  end if;

  select l.participant_id into target_participant
  from public.participant_links l
  where l.study_id = p_study_id and l.user_id = uid;
  if target_participant is null then
    return 0;
  end if;

  update public.consents c set withdrawn_at = now()
  where c.participant_id = target_participant and c.withdrawn_at is null;
  get diagnostics withdrawn = row_count;

  if p_delete_data then
    delete from public.observations o where o.participant_id = target_participant;
  end if;

  return withdrawn;
end;
$$;

-- The studies the caller takes part in, with only what a participant needs to see.
create function public.my_participations()
returns table (
  study_id uuid,
  title text,
  description text,
  synthetic boolean,
  status public.study_status,
  questionnaire jsonb,
  schedule jsonb,
  pseudonym text,
  joined_at timestamptz,
  consent_version text,
  consent_active boolean,
  observation_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.title, s.description, s.synthetic, s.status, s.questionnaire, s.schedule,
         p.pseudonym, l.created_at,
         latest.consent_version,
         latest.withdrawn_at is null,
         (select count(*)::int from public.observations o where o.participant_id = p.id)
  from public.participant_links l
  join public.participants p on p.id = l.participant_id
  join public.studies s on s.id = l.study_id
  cross join lateral (
    select c.consent_version, c.withdrawn_at from public.consents c
    where c.participant_id = p.id
    order by c.given_at desc
    limit 1
  ) latest
  where l.user_id = (select auth.uid())
  order by l.created_at desc;
$$;

-- ---------------------------------------------------------------------------------------------
-- Function privileges: signed-in users only.
-- ---------------------------------------------------------------------------------------------

revoke execute on function
  public.random_code(integer),
  public.is_study_member(uuid),
  public.is_study_owner(uuid),
  public.current_participant_ids(),
  public.can_seed_study(uuid),
  public.is_study_active(uuid),
  public.is_generated_participant(uuid),
  public.studies_add_owner_member(),
  public.studies_guard_synthetic_switch(),
  public.participants_match_study(),
  public.preview_study(text),
  public.join_study(text, text, text),
  public.withdraw_consent(uuid, boolean),
  public.my_participations()
from public, anon;

grant execute on function
  public.random_code(integer),
  public.is_study_member(uuid),
  public.is_study_owner(uuid),
  public.current_participant_ids(),
  public.can_seed_study(uuid),
  public.is_study_active(uuid),
  public.is_generated_participant(uuid),
  public.preview_study(text),
  public.join_study(text, text, text),
  public.withdraw_consent(uuid, boolean),
  public.my_participations()
to authenticated;
