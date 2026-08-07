-- Gameplan storage for VolleyballPal.
--
-- A gameplan is one named scheme attached to an upcoming game. Each plan
-- holds the 6 players assigned to it plus 12 independent formations:
-- 6 rotations (R1..R6) × 2 modes (serve / serve-receive). Bubbles are
-- positioned freely within each formation; rotation order rules are
-- enforced as soft warnings, not hard constraints.
--
-- v3 — live-set fields:
--   subs            jsonb  — generic pair list  [{ a, b }, ...]
--   confirmed_subs  jsonb  — rotation → list of confirmed pair indices
--   libero_pairs    jsonb  — { [liberoPid]: [mbPid1, mbPid2] }
--   libero_auto     boolean — global auto-swap toggle (default true)
--   sub_log         jsonb  — chronological regular-sub history for undo + counter
--
-- Apply once in the Supabase SQL editor (or re-run safely — every statement
-- is idempotent).

create table if not exists game_plans (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade not null,
  schedule_game_id uuid references schedule(id) on delete cascade not null,
  name text not null default 'Plan A',

  -- Legacy v1 fields (kept for backward compat — new UI doesn't read them).
  lineup jsonb not null default '{}'::jsonb,
  positions jsonb not null default '{}'::jsonb,

  -- v2 — current UI:
  assigned_players jsonb not null default '[]'::jsonb,
  formations jsonb not null default '{}'::jsonb,
  colors jsonb not null default '{}'::jsonb,

  -- v3 — live-set + sub system:
  subs jsonb not null default '[]'::jsonb,
  confirmed_subs jsonb not null default '{}'::jsonb,
  libero_pairs jsonb not null default '{}'::jsonb,
  libero_auto boolean not null default true,
  sub_log jsonb not null default '[]'::jsonb,

  rotation_index integer not null default 1,
  position integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Idempotent upgrades for installs that ran earlier migrations.
alter table game_plans add column if not exists positions        jsonb   not null default '{}'::jsonb;
alter table game_plans add column if not exists assigned_players jsonb   not null default '[]'::jsonb;
alter table game_plans add column if not exists formations       jsonb   not null default '{}'::jsonb;
alter table game_plans add column if not exists colors           jsonb   not null default '{}'::jsonb;
alter table game_plans add column if not exists subs             jsonb   not null default '[]'::jsonb;
alter table game_plans add column if not exists confirmed_subs   jsonb   not null default '{}'::jsonb;
alter table game_plans add column if not exists libero_pairs     jsonb   not null default '{}'::jsonb;
alter table game_plans add column if not exists libero_auto      boolean not null default true;
alter table game_plans add column if not exists sub_log          jsonb   not null default '[]'::jsonb;

create index if not exists idx_game_plans_schedule_game on game_plans(schedule_game_id);
create index if not exists idx_game_plans_team          on game_plans(team_id);

-- RLS — allow the app's authenticated role to read/write its own team's plans.
-- Adjust the policies below if your project uses a different role model.
alter table game_plans enable row level security;

drop policy if exists "game_plans_all_authenticated" on game_plans;
create policy "game_plans_all_authenticated"
  on game_plans
  for all
  to authenticated
  using (true)
  with check (true);

-- Verification query — run this after the migration and confirm all
-- expected columns appear.
--   select column_name, data_type
--   from information_schema.columns
--   where table_name = 'game_plans'
--   order by ordinal_position;
