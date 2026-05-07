-- Gameplan storage for VolleyballPal.
--
-- A gameplan is one named scheme attached to an upcoming game. Each plan
-- holds the 6 players assigned to it plus 12 independent formations:
-- 6 rotations (R1..R6) × 2 modes (serve / serve-receive). Bubbles are
-- positioned freely within each formation; rotation order rules are
-- enforced as soft warnings, not hard constraints.
--
-- Apply once in the Supabase SQL editor. Re-running is safe (every
-- statement is idempotent).

create table if not exists game_plans (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade not null,
  schedule_game_id uuid references schedule(id) on delete cascade not null,
  name text not null default 'Plan A',

  -- Legacy v1 fields (kept for backward compat — new UI doesn't read them).
  lineup jsonb not null default '{}'::jsonb,
  positions jsonb not null default '{}'::jsonb,

  -- v2 — current UI:
  -- ordered list of player UUIDs (max 6); index maps to R1 starting slot
  assigned_players jsonb not null default '[]'::jsonb,
  -- formations[<1..6>][<'serve'|'receive'>][<player_uuid>] = { x, y }
  formations jsonb not null default '{}'::jsonb,
  -- colors[<player_uuid>] = palette key ('cyan'|'green'|'purple'|'orange'|'pink'|'blue'|'gold')
  colors jsonb not null default '{}'::jsonb,

  rotation_index integer not null default 1,
  position integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Idempotent upgrades for installs that ran v1 migrations.
alter table game_plans add column if not exists positions        jsonb not null default '{}'::jsonb;
alter table game_plans add column if not exists assigned_players jsonb not null default '[]'::jsonb;
alter table game_plans add column if not exists formations       jsonb not null default '{}'::jsonb;
alter table game_plans add column if not exists colors           jsonb not null default '{}'::jsonb;

create index if not exists idx_game_plans_schedule_game on game_plans(schedule_game_id);
create index if not exists idx_game_plans_team on game_plans(team_id);
