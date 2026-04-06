-- Add persistent_stats column to profiles for cross-device achievement sync.
-- Stores the full PersistentSnapshot JSON (unlocked achievements + lifetime stats).

alter table public.profiles
  add column if not exists persistent_stats jsonb not null default '{}'::jsonb;
