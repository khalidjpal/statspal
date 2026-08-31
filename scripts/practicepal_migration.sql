-- PracticePal — practice drill tracking for VolleyballPal.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DATA SEPARATION — READ THIS FIRST
-- ═══════════════════════════════════════════════════════════════════════════
-- Practice reps are NOT match statistics and must never be mixed into them.
-- Everything PracticePal records lives in the two tables below and nowhere
-- else. This migration does not touch, alter, or add columns to
-- player_game_stats, completed_games, schedule, tournaments or any other
-- existing table — it only creates new ones.
--
-- The app reads game stats for the practice-vs-game comparison, but that read
-- is strictly read-only; no PracticePal code path writes to a game table.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY THE COLUMN NAMES MATCH player_game_stats
-- ═══════════════════════════════════════════════════════════════════════════
-- pass_3 / pass_2 / pass_1 / pass_0, receives, kills, errors and attempts are
-- named identically to their player_game_stats counterparts ON PURPOSE. Same
-- names means the SAME client-side functions — passAvg() and hpct() in
-- src/utils/stats.js — compute both, so a practice passing average and a game
-- passing average are produced by one implementation and are genuinely
-- comparable rather than merely similar. Shared names, separate tables.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- MODEL
-- ═══════════════════════════════════════════════════════════════════════════
-- practice_sessions : one practice / drill instance for a team.
-- practice_stats    : one row PER PLAYER PER SESSION (an aggregate tally, not
--                     one row per rep). A drill is hundreds of reps; storing
--                     the running tally keeps writes to a single upsert per
--                     player and makes every read a plain sum. Rep-by-rep
--                     ordering only matters during tracking, where it lives in
--                     client state as the undo history.
--
-- Only the columns for the session's drill_type are ever non-zero; the rest
-- stay at 0. One wide table beats four narrow ones here — every query
-- (session detail, player trend, practice-vs-game) reads across drill types.
--
-- Idempotent: safe to re-run.

-- ── Sessions ──────────────────────────────────────────────────────────────
create table if not exists practice_sessions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade not null,

  -- Date of the practice. Separate from created_at so a coach can log a
  -- session against the day it was actually run.
  session_date date not null default current_date,

  -- Optional human label, e.g. "Tuesday AM — short serve receive".
  name text,

  -- 'serve_receive' | 'hitting' | 'serving' | 'custom'
  drill_type text not null default 'serve_receive',

  -- Name of the drill when drill_type = 'custom' (e.g. "Pepper to 20").
  -- Null for the three built-in drill types.
  custom_label text,

  created_by uuid,                                -- accounts.id; no FK — auth is app-managed
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Idempotent upgrades for installs that ran an earlier version of this file.
alter table practice_sessions add column if not exists session_date date not null default current_date;
alter table practice_sessions add column if not exists name         text;
alter table practice_sessions add column if not exists drill_type   text not null default 'serve_receive';
alter table practice_sessions add column if not exists custom_label text;
alter table practice_sessions add column if not exists created_by   uuid;
alter table practice_sessions add column if not exists updated_at   timestamptz default now();

-- Guard the drill vocabulary. Added conditionally rather than inline so
-- re-running the file on a table that already has the constraint is a no-op
-- instead of an error.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'practice_sessions_drill_type_check'
  ) then
    alter table practice_sessions
      add constraint practice_sessions_drill_type_check
      check (drill_type in ('serve_receive', 'hitting', 'serving', 'custom'));
  end if;
end $$;

create index if not exists idx_practice_sessions_team on practice_sessions(team_id);
create index if not exists idx_practice_sessions_date on practice_sessions(team_id, session_date desc);

-- ── Per-player stats ──────────────────────────────────────────────────────
create table if not exists practice_stats (
  id uuid primary key default gen_random_uuid(),
  practice_session_id uuid references practice_sessions(id) on delete cascade not null,
  player_id uuid references players(id) on delete cascade not null,

  -- SERVE-RECEIVE / PASSING ────────────────────────────────────────────────
  -- Identical 0–3 scale to StatsPal: 3 perfect, 2 good, 1 poor, 0 aced.
  -- `receives` is the total attempt count, incremented once per rating press
  -- whichever grade was pressed — exactly its meaning in player_game_stats.
  --   passing average = (3*pass_3 + 2*pass_2 + 1*pass_1) / receives
  receives integer not null default 0,
  pass_3   integer not null default 0,
  pass_2   integer not null default 0,
  pass_1   integer not null default 0,
  pass_0   integer not null default 0,

  -- HITTING ────────────────────────────────────────────────────────────────
  --   hitting % = (kills - errors) / attempts
  -- A kill press and an error press each also bump attempts, so attempts is
  -- always >= kills + errors and the percentage cannot leave [-1, +1].
  kills    integer not null default 0,
  errors   integer not null default 0,
  attempts integer not null default 0,

  -- SERVING ────────────────────────────────────────────────────────────────
  -- serve_attempts counts every serve. serves_in counts the ones that landed
  -- in, ACES INCLUDED (an ace is by definition in), so:
  --   in%    = serves_in     / serve_attempts
  --   ace%   = aces          / serve_attempts
  --   error% = serve_errors  / serve_attempts
  -- and serves_in + serve_errors = serve_attempts.
  aces           integer not null default 0,
  serve_errors   integer not null default 0,
  serves_in      integer not null default 0,
  serve_attempts integer not null default 0,

  -- CUSTOM / FREE DRILL ────────────────────────────────────────────────────
  -- A plain made/missed tally for any drill the coach invents.
  --   success % = made / (made + missed)
  made   integer not null default 0,
  missed integer not null default 0,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Idempotent upgrades.
alter table practice_stats add column if not exists receives       integer not null default 0;
alter table practice_stats add column if not exists pass_3         integer not null default 0;
alter table practice_stats add column if not exists pass_2         integer not null default 0;
alter table practice_stats add column if not exists pass_1         integer not null default 0;
alter table practice_stats add column if not exists pass_0         integer not null default 0;
alter table practice_stats add column if not exists kills          integer not null default 0;
alter table practice_stats add column if not exists errors         integer not null default 0;
alter table practice_stats add column if not exists attempts       integer not null default 0;
alter table practice_stats add column if not exists aces           integer not null default 0;
alter table practice_stats add column if not exists serve_errors   integer not null default 0;
alter table practice_stats add column if not exists serves_in      integer not null default 0;
alter table practice_stats add column if not exists serve_attempts integer not null default 0;
alter table practice_stats add column if not exists made           integer not null default 0;
alter table practice_stats add column if not exists missed         integer not null default 0;
alter table practice_stats add column if not exists updated_at     timestamptz default now();

-- One row per player per session. This is what lets the client re-save a
-- session with upsert(..., { onConflict: 'practice_session_id,player_id' })
-- instead of deleting and re-inserting.
create unique index if not exists idx_practice_stats_session_player
  on practice_stats(practice_session_id, player_id);

create index if not exists idx_practice_stats_session on practice_stats(practice_session_id);
create index if not exists idx_practice_stats_player  on practice_stats(player_id);

-- ── RLS ───────────────────────────────────────────────────────────────────
-- The app signs in against its own `accounts` table using the Supabase ANON
-- key, so PostgREST sees the `anon` role — not `authenticated`. Both policies
-- are created on both tables: the authenticated one for parity with the rest
-- of the schema, the anon one because that is the role the client actually
-- presents. Same shape as game_plans / tournaments.
alter table practice_sessions enable row level security;
alter table practice_stats    enable row level security;

drop policy if exists "practice_sessions_all_authenticated" on practice_sessions;
create policy "practice_sessions_all_authenticated"
  on practice_sessions for all to authenticated
  using (true) with check (true);

drop policy if exists "practice_sessions_all_anon" on practice_sessions;
create policy "practice_sessions_all_anon"
  on practice_sessions for all to anon
  using (true) with check (true);

drop policy if exists "practice_stats_all_authenticated" on practice_stats;
create policy "practice_stats_all_authenticated"
  on practice_stats for all to authenticated
  using (true) with check (true);

drop policy if exists "practice_stats_all_anon" on practice_stats;
create policy "practice_stats_all_anon"
  on practice_stats for all to anon
  using (true) with check (true);

-- PostgREST caches the table schema. Supabase normally reloads it via an event
-- trigger after DDL, but that can lag — and a stale cache reports a table that
-- genuinely exists as "Could not find the table in the schema cache". This
-- forces the reload immediately.
notify pgrst, 'reload schema';

-- ── Verification ──────────────────────────────────────────────────────────
-- 1) Both tables exist with the expected columns:
--   select table_name, column_name, data_type
--   from information_schema.columns
--   where table_name in ('practice_sessions', 'practice_stats')
--   order by table_name, ordinal_position;
--
-- 2) Four policies, two per table (anon + authenticated):
--   select tablename, policyname, roles
--   from pg_policies
--   where tablename in ('practice_sessions', 'practice_stats')
--   order by tablename, policyname;
--
-- 3) Nothing was added to the game tables — this must return ZERO rows:
--   select column_name from information_schema.columns
--   where table_name = 'player_game_stats'
--     and column_name in ('made', 'missed', 'serves_in', 'serve_attempts');
