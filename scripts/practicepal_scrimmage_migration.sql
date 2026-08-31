-- PracticePal — SCRIMMAGE drill.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DATA SEPARATION — UNCHANGED
-- ═══════════════════════════════════════════════════════════════════════════
-- A scrimmage is an intrasquad practice match. It is tracked with StatsPal's
-- full stat set and keeps a score, but it is PRACTICE DATA: it lives in
-- practice_sessions / practice_stats and nothing here touches player_game_stats,
-- completed_games, schedule, live_game_sessions, tournaments or any other game
-- table. A scrimmage must never appear in a player's match statistics.
--
-- Run scripts/practicepal_migration.sql first — this file extends those tables.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT THIS ADDS
-- ═══════════════════════════════════════════════════════════════════════════
-- practice_sessions:
--   drill_type gains 'scrimmage'  (the CHECK constraint is rebuilt)
--   score_a / score_b             final intrasquad score
--
-- practice_stats:
--   side                          'team_a' | 'team_b', null for other drills
--   digs, assists, blocks, block_assists,
--   blocking_errors, digging_errors, ball_handling_errors
--
-- Those seven counters complete the StatsPal stat set. They are named
-- identically to their player_game_stats counterparts for the same reason the
-- earlier ones were: the SAME client functions compute both, so a scrimmage
-- hitting % and a match hitting % are produced by one implementation and are
-- genuinely comparable. Shared names, separate tables.
--
-- Idempotent: safe to re-run.

-- ── practice_sessions: allow the new drill type ───────────────────────────
-- The constraint has to be rebuilt rather than extended, so it is dropped
-- unconditionally and recreated with the full vocabulary.
alter table practice_sessions
  drop constraint if exists practice_sessions_drill_type_check;

alter table practice_sessions
  add constraint practice_sessions_drill_type_check
  check (drill_type in ('serve_receive', 'hitting', 'serving', 'custom', 'scrimmage'));

-- ── practice_sessions: the scrimmage score ────────────────────────────────
-- Null for every non-scrimmage drill. Kept as two plain integers because a
-- scrimmage is scored as one running game, not a best-of-N match.
alter table practice_sessions add column if not exists score_a integer;
alter table practice_sessions add column if not exists score_b integer;

-- ── practice_stats: which side the player was on ──────────────────────────
-- Null for every non-scrimmage drill, where the concept does not apply.
alter table practice_stats add column if not exists side text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'practice_stats_side_check'
  ) then
    alter table practice_stats
      add constraint practice_stats_side_check
      check (side is null or side in ('team_a', 'team_b'));
  end if;
end $$;

create index if not exists idx_practice_stats_side on practice_stats(practice_session_id, side);

-- ── practice_stats: the rest of the StatsPal stat set ─────────────────────
-- Only a scrimmage fills these in; the focused drills leave them at 0.
alter table practice_stats add column if not exists digs                 integer not null default 0;
alter table practice_stats add column if not exists assists              integer not null default 0;
alter table practice_stats add column if not exists blocks               integer not null default 0;
alter table practice_stats add column if not exists block_assists        integer not null default 0;
alter table practice_stats add column if not exists blocking_errors      integer not null default 0;
alter table practice_stats add column if not exists digging_errors       integer not null default 0;
alter table practice_stats add column if not exists ball_handling_errors integer not null default 0;

-- Backfill any nulls on rows written before these columns existed, so the
-- client never reads null where it expects a counter.
update practice_stats set digs                 = 0 where digs                 is null;
update practice_stats set assists              = 0 where assists              is null;
update practice_stats set blocks               = 0 where blocks               is null;
update practice_stats set block_assists        = 0 where block_assists        is null;
update practice_stats set blocking_errors      = 0 where blocking_errors      is null;
update practice_stats set digging_errors       = 0 where digging_errors       is null;
update practice_stats set ball_handling_errors = 0 where ball_handling_errors is null;

-- ── RLS ───────────────────────────────────────────────────────────────────
-- Both tables already have anon + authenticated policies from the first
-- migration, and policies are not column-scoped, so the new columns are
-- covered automatically. Re-asserted here so this file is self-contained and
-- a project that somehow missed them still ends up correct.
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

-- PostgREST caches the table schema; without this the new columns can come
-- back as "Could not find the 'side' column ... in the schema cache" even
-- though they exist.
notify pgrst, 'reload schema';

-- ── Verification ──────────────────────────────────────────────────────────
-- 1) The new columns exist — expect 9 rows:
--   select table_name, column_name, data_type
--   from information_schema.columns
--   where (table_name = 'practice_sessions' and column_name in ('score_a','score_b'))
--      or (table_name = 'practice_stats' and column_name in
--          ('side','digs','assists','blocks','block_assists',
--           'blocking_errors','digging_errors','ball_handling_errors'))
--   order by table_name, column_name;
--
-- 2) 'scrimmage' is an accepted drill type — expect the check clause to list it:
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conname = 'practice_sessions_drill_type_check';
--
-- 3) Nothing was added to the game tables — this must return ZERO rows:
--   select column_name from information_schema.columns
--   where table_name = 'player_game_stats' and column_name = 'side';
