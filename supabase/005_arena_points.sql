-- Arena ranking: each profile starts at 1000 AP (Silver tier).
alter table public.profiles
  add column if not exists arena_points integer not null default 1000;

-- Leaderboard query: top arena players.
create index if not exists idx_profiles_arena_points
  on public.profiles (arena_points desc);
