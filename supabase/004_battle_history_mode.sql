-- Distinguish PvE from PvP battles so matchmaking only uses PvE data.
alter table public.battle_history
  add column if not exists mode text not null default 'pve';

-- Update the matchmaking index to include mode for efficient filtering.
drop index if exists idx_battle_history_matchmaking;
create index idx_battle_history_matchmaking
  on public.battle_history (mode, game_version, campaign_phase, chamber_index);
