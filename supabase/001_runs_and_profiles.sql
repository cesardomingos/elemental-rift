-- =============================================================
-- Elemental Rift — leaderboard + run history
-- Run this migration against your Supabase project.
-- Prerequisites: enable Anonymous Sign-In in Authentication > Settings.
-- =============================================================

-- profiles: minimal user identity (auto-created via trigger)
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Alquimista',
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_public" on public.profiles
  for select using (true);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- runs: each finished (or failed) run with full build snapshot
create table if not exists public.runs (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references auth.users(id) on delete set null,
  player_name        text not null default 'Alquimista',
  game_version       text not null,
  score              integer not null default 0,
  battles_won        smallint not null default 0,
  deepest_floor      smallint not null default 0,
  campaign_completed boolean not null default false,
  campaign_phase     smallint not null default 0,
  combat_rounds      integer not null default 0,
  damage_dealt       integer not null default 0,
  build_json         jsonb not null default '{}'::jsonb,
  run_stats_json     jsonb not null default '{}'::jsonb,
  finished_at        timestamptz not null default now()
);

alter table public.runs enable row level security;

create policy "runs_select_public" on public.runs
  for select using (true);
create policy "runs_insert_own" on public.runs
  for insert with check (auth.uid() = user_id);

-- Leaderboard performance
create index idx_runs_leaderboard on public.runs (score desc);
create index idx_runs_user       on public.runs (user_id);

-- Auto-create a profile row whenever a new user signs up (including anonymous)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', 'Alquimista')
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
