-- Playground sessions for RotationPal.
--
-- A playground session is a free coaching sandbox — a saved formation/lineup
-- arrangement NOT linked to any scheduled game. The full GameplanBuilder
-- modal opens against one of these rows in playground mode.
--
-- `plans` is a single jsonb blob holding the entire plan shape used by the
-- modal: assigned_players, formations, colors, subs, confirmed_subs,
-- libero_pairs, libero_auto, sub_log, rotation_index, notes, etc. Storing
-- it as one column keeps the schema tiny and lets the client evolve the
-- plan shape without future migrations.
--
-- Idempotent: safe to re-run.

create table if not exists playground_sessions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade not null,
  name text not null default 'Untitled Session',
  plans jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Idempotent upgrades for older installs.
alter table playground_sessions add column if not exists plans jsonb not null default '{}'::jsonb;

create index if not exists idx_playground_sessions_team on playground_sessions(team_id);

-- RLS — open to authenticated users (same policy shape as game_plans).
alter table playground_sessions enable row level security;

drop policy if exists "playground_sessions_all_authenticated" on playground_sessions;
create policy "playground_sessions_all_authenticated"
  on playground_sessions
  for all
  to authenticated
  using (true)
  with check (true);

-- Verification — should list id, team_id, name, plans, created_at, updated_at.
--   select column_name, data_type
--   from information_schema.columns
--   where table_name = 'playground_sessions'
--   order by ordinal_position;
