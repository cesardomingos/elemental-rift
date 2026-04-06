-- =============================================================
-- Battle history: every chamber result with full player/enemy state.
-- Used for analytics and future "offline PvP" matchmaking
-- (match players at the same campaign_phase + chamber_index).
-- =============================================================

create table if not exists public.battle_history (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete set null,
  player_name     text not null default 'Alquimista',
  game_version    text not null,

  campaign_phase  smallint not null,
  chamber_index   smallint not null,
  won             boolean not null,

  -- Player build snapshot at the moment the battle started
  player_state    jsonb not null,
  -- Enemy template that was fought
  enemy_state     jsonb not null,

  -- Result metrics
  damage_dealt    integer not null default 0,
  damage_taken    integer not null default 0,
  combat_rounds   integer not null default 0,
  player_hp_end   integer not null default 0,
  enemy_hp_end    integer not null default 0,

  created_at      timestamptz not null default now()
);

alter table public.battle_history enable row level security;

create policy "battle_history_select_public" on public.battle_history
  for select using (true);
create policy "battle_history_insert_own" on public.battle_history
  for insert with check (auth.uid() = user_id);

-- Matchmaking: find opponents at the same level
create index idx_battle_history_matchmaking
  on public.battle_history (game_version, campaign_phase, chamber_index);

-- Per-user history lookup
create index idx_battle_history_user
  on public.battle_history (user_id, created_at desc);
