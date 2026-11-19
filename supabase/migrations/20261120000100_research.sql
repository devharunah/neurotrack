-- NeuroTrack M4: Research Assistant literature cache, saved references and query history.
--
-- DATA MODEL
-- ==========
-- 1. `literature_references` is a shared, append-only cache of publication metadata that came
--    from Europe PMC or PubMed through the NeuroTrack API. It holds public bibliographic data
--    only (titles, abstracts, authors as published), never anything about a NeuroTrack user.
--    Signed-in users can read it and add to it; nobody can update or delete through the API, so
--    one user cannot rewrite what another user saved a link to. A record is identified by its
--    PMID or DOI; each is unique when present (NULLs never collide), and at least one of them is
--    required so the cache cannot fill with duplicates that have no stable identifier.
-- 2. `saved_references` and `research_queries` are private to their owner (RLS: own rows only).
-- 3. Full-text search: `search` is a generated tsvector over title (weight A) and abstract
--    (weight B) with a GIN index, queried from the web app with PostgREST `textSearch`.
-- 4. RLS is enabled on every table and `anon` gets nothing.

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

create table public.literature_references (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('europepmc', 'pubmed')),
  pmid text unique check (pmid ~ '^[0-9]{1,10}$'),
  pmcid text check (pmcid ~ '^PMC[0-9]{1,12}$'),
  -- Stored lowercase without a resolver prefix, exactly as the API normalises it.
  doi text unique check (doi ~ '^10\.[0-9]{4,9}/\S+$' and doi = lower(doi) and char_length(doi) <= 300),
  title text not null check (char_length(btrim(title)) between 1 and 2000),
  authors text[] not null default '{}' check (cardinality(authors) <= 5000),
  journal text check (char_length(journal) <= 500),
  year integer check (year between 1800 and 2100),
  abstract text check (char_length(abstract) <= 50000),
  publication_types text[] not null default '{}' check (cardinality(publication_types) <= 50),
  url text not null check (url ~ '^https://' and char_length(url) <= 500),
  evidence text not null default 'other' check (
    evidence in (
      'systematic-review/meta-analysis', 'randomized-trial', 'review', 'primary-study', 'other'
    )
  ),
  fetched_at timestamptz not null default now(),
  search tsvector generated always as (
    setweight(to_tsvector('english'::regconfig, coalesce(title, '')), 'A')
    || setweight(to_tsvector('english'::regconfig, coalesce(abstract, '')), 'B')
  ) stored,
  constraint literature_references_has_identifier check (pmid is not null or doi is not null)
);

create index literature_references_search_idx
  on public.literature_references using gin (search);

create table public.saved_references (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reference_id uuid not null references public.literature_references (id) on delete cascade,
  note text not null default '' check (char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  unique (user_id, reference_id)
);

create index saved_references_user_created_idx
  on public.saved_references (user_id, created_at desc);
create index saved_references_reference_idx on public.saved_references (reference_id);

create table public.research_queries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  query text not null check (char_length(btrim(query)) between 1 and 300),
  -- Which tool ran the query: literature search, cited answer, or the user's own library.
  mode text not null default 'search' check (mode in ('search', 'answer', 'library')),
  created_at timestamptz not null default now()
);

create index research_queries_user_created_idx
  on public.research_queries (user_id, created_at desc);

-- ---------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------

alter table public.literature_references enable row level security;
alter table public.saved_references enable row level security;
alter table public.research_queries enable row level security;

revoke all on public.literature_references, public.saved_references, public.research_queries
  from anon;

-- literature_references: shared cache, read and append only --------------------------------
create policy "literature_references: authenticated read"
  on public.literature_references for select to authenticated
  using (true);

create policy "literature_references: authenticated insert"
  on public.literature_references for insert to authenticated
  with check (true);

-- No update or delete policy, and no privilege either: the cache is append-only for clients.
-- id, fetched_at and search are always server-generated.
revoke insert, update, delete, truncate on public.literature_references from authenticated;
grant insert (
  source, pmid, pmcid, doi, title, authors, journal, year, abstract, publication_types, url,
  evidence
) on public.literature_references to authenticated;

-- saved_references: own rows only ------------------------------------------------------------
create policy "saved_references: read own"
  on public.saved_references for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "saved_references: insert own"
  on public.saved_references for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "saved_references: update own"
  on public.saved_references for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "saved_references: delete own"
  on public.saved_references for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Only the note can change after saving.
revoke update on public.saved_references from authenticated;
grant update (note) on public.saved_references to authenticated;

-- research_queries: own rows only ------------------------------------------------------------
create policy "research_queries: read own"
  on public.research_queries for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "research_queries: insert own"
  on public.research_queries for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "research_queries: delete own"
  on public.research_queries for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke update on public.research_queries from authenticated;

-- ---------------------------------------------------------------------------------------------
-- Cache writes
-- ---------------------------------------------------------------------------------------------

-- Adds references to the cache and returns the cached id of every reference passed in, whether
-- it was new or already there. `on conflict do nothing` (with no conflict target) skips rows
-- whose PMID *or* DOI is already cached, which a PostgREST upsert keyed on one column cannot do.
-- Records without a PMID or DOI are skipped. Runs as the caller (security invoker), so the
-- insert policy and column grants above still apply.
create function public.cache_literature_references(p_refs jsonb)
returns table (reference_id uuid, ref_pmid text, ref_doi text)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if p_refs is null or jsonb_typeof(p_refs) <> 'array' then
    raise exception 'p_refs must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_refs) > 50 then
    raise exception 'At most 50 references can be cached at once' using errcode = '22023';
  end if;

  insert into public.literature_references (
    source, pmid, pmcid, doi, title, authors, journal, year, abstract, publication_types, url,
    evidence
  )
  select
    r.source, r.pmid, r.pmcid, r.doi, r.title, coalesce(r.authors, '{}'), r.journal, r.year,
    r.abstract, coalesce(r.publication_types, '{}'), r.url, coalesce(r.evidence, 'other')
  from jsonb_to_recordset(p_refs) as r (
    source text, pmid text, pmcid text, doi text, title text, authors text[], journal text,
    year integer, abstract text, publication_types text[], url text, evidence text
  )
  where r.pmid is not null or r.doi is not null
  on conflict do nothing;

  return query
    select distinct l.id, l.pmid, l.doi
    from public.literature_references as l
    join jsonb_to_recordset(p_refs) as r (pmid text, doi text)
      on l.pmid = r.pmid or l.doi = r.doi;
end;
$$;

revoke all on function public.cache_literature_references(jsonb) from public, anon;
grant execute on function public.cache_literature_references(jsonb) to authenticated;
