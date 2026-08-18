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
-- v4 — front/back pairs + set tracking:
--   fb_pairs        jsonb  — [{ front: pid, back: pid }] Front Row / Back Row pairs
--   set_number      integer — which set the 12-substitution budget is tracking
--
-- fb_pairs is NOT a rename of libero_pairs — the two coexist and are shaped
-- differently. See the note above the fb_pairs column below.
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

  -- v4 — Front Row / Back Row pairs. A LIST of { front, back } player-id
  -- pairs sharing one lineup slot: whichever member belongs in the row that
  -- slot currently occupies is on court, and the coach CONFIRMS every
  -- crossing before it fires.
  --
  -- Distinct from libero_pairs, which is a MAP of liberoPid -> [mbPid, mbPid]
  -- and swaps SILENTLY whenever a covered middle rotates to the back row.
  -- Different shape, different trigger, different rules — both are written on
  -- every save and both need their own column.
  fb_pairs jsonb not null default '[]'::jsonb,

  -- v4 — which set the 12-substitution budget is currently tracking.
  -- "New Set" clears subs/sub_log and increments this.
  set_number integer not null default 1,

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
alter table game_plans add column if not exists fb_pairs         jsonb   not null default '[]'::jsonb;
alter table game_plans add column if not exists set_number       integer not null default 1;

-- Backfill any rows that predate the columns so the client never reads null
-- where it expects a list / a number.
update game_plans set fb_pairs   = '[]'::jsonb where fb_pairs   is null;
update game_plans set set_number = 1           where set_number is null;

create index if not exists idx_game_plans_schedule_game on game_plans(schedule_game_id);
create index if not exists idx_game_plans_team          on game_plans(team_id);

-- RLS.
--
-- The app signs in against its own `accounts` table using the Supabase ANON
-- key, so PostgREST sees the `anon` role — not `authenticated`. Both policies
-- are created: the authenticated one for parity with the other tables, the
-- anon one because that is the role the client actually presents.
alter table game_plans enable row level security;

drop policy if exists "game_plans_all_authenticated" on game_plans;
create policy "game_plans_all_authenticated"
  on game_plans
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "game_plans_all_anon" on game_plans;
create policy "game_plans_all_anon"
  on game_plans
  for all
  to anon
  using (true)
  with check (true);

-- PostgREST caches the table schema. Supabase normally reloads it via an event
-- trigger after DDL, but that can lag — and a stale cache reports a column that
-- genuinely exists as "Could not find the 'x' column ... in the schema cache".
-- This forces the reload immediately.
notify pgrst, 'reload schema';

-- Verification query — run this after the migration and confirm all 20
-- expected columns appear (the client writes every one of them on save):
--   id, team_id, schedule_game_id, name, lineup, positions, assigned_players,
--   formations, colors, subs, confirmed_subs, fb_pairs, set_number,
--   libero_pairs, libero_auto, sub_log, rotation_index, position,
--   created_at, updated_at
--
--   select column_name, data_type
--   from information_schema.columns
--   where table_name = 'game_plans'
--   order by ordinal_position;
