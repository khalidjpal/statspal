-- Formation presets for VolleyballPal.
--
-- A preset is a player-agnostic formation template: 6 role markers
-- (S, OH1, OH2, MB1, MB2, OPP, plus an optional L) with their R1..R6
-- positions for both serve and serve-receive modes. Coaches reuse them
-- across gameplans — selecting one auto-populates all 12 formation slots
-- with the marker positions and auto-assigns the team's players to the
-- markers based on each player's position tag.
--
-- `rotations` is a single jsonb blob shaped like:
--   {
--     "1": { "serve":   { "S": {x,y}, "OH1": {x,y}, ... },
--            "receive": { ... } },
--     "2": { ... },
--     ...
--     "6": { ... }
--   }
--
-- Idempotent: safe to re-run.

create table if not exists formation_presets (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade not null,
  name text not null default 'New Preset',
  rotations jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Idempotent column upgrades for older installs.
alter table formation_presets add column if not exists rotations  jsonb   not null default '{}'::jsonb;
alter table formation_presets add column if not exists is_default boolean not null default false;
alter table formation_presets add column if not exists updated_at timestamptz default now();

create index if not exists idx_formation_presets_team on formation_presets(team_id);

-- RLS — open to authenticated users (same shape as game_plans / playground_sessions).
alter table formation_presets enable row level security;

drop policy if exists "formation_presets_all_authenticated" on formation_presets;
create policy "formation_presets_all_authenticated"
  on formation_presets
  for all
  to authenticated
  using (true)
  with check (true);

-- Verification — should list id, team_id, name, rotations, is_default, timestamps.
--   select column_name, data_type
--   from information_schema.columns
--   where table_name = 'formation_presets'
--   order by ordinal_position;
