-- "Play as" (makeshift position) for gameplans.
--
-- game_plans.play_as holds, per plan, the role a player is standing in for:
--   { "<player id>": "MB", ... }
-- It never changes a player's real role in the players table.
--
-- Playground sessions need nothing here — they keep the whole plan in
-- playground_sessions.plans (jsonb), play_as included.
--
-- Safe to re-run.

alter table game_plans add column if not exists play_as jsonb not null default '{}'::jsonb;

alter table game_plans enable row level security;

drop policy if exists "game_plans_open" on game_plans;
create policy "game_plans_open"
  on game_plans
  for all
  using (true)
  with check (true);

-- Make PostgREST see the new column straight away.
notify pgrst, 'reload schema';
