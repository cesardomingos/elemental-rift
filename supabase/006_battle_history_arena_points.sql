-- Store the player's arena rank at the time of battle for skill-based matchmaking.
alter table public.battle_history
  add column if not exists arena_points integer not null default 1000;
