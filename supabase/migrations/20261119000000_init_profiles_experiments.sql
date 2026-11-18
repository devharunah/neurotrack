-- NeuroTrack M0 schema: profiles and experiment history.
-- RLS is enabled on every table. Users only ever see their own rows.

create type public.user_role as enum ('student', 'researcher', 'admin');
create type public.lab_module as enum ('quantum', 'neuro', 'behaviour', 'research');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  role public.user_role not null default 'student',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: read own"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

-- Users may edit their display name, but never their role.
create policy "profiles: update own"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

-- Create a profile for every new auth user.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)), 80));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.experiments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  module public.lab_module not null,
  kind text not null check (char_length(kind) <= 64),
  title text check (char_length(title) <= 120),
  config jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create index experiments_user_created_idx on public.experiments (user_id, created_at desc);

alter table public.experiments enable row level security;

create policy "experiments: read own"
  on public.experiments for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "experiments: insert own"
  on public.experiments for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "experiments: delete own"
  on public.experiments for delete to authenticated
  using ((select auth.uid()) = user_id);
