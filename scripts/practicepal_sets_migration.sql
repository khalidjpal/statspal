-- PracticePal — per-SET scrimmage stats.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DATA SEPARATION — UNCHANGED
-- ═══════════════════════════════════════════════════════════════════════════
-- Still practice data only. Nothing here touches player_game_stats,
-- completed_games, schedule, live_game_sessions, tournaments or any other
-- game table.
--
-- Run scripts/practicepal_migration.sql and
-- scripts/practicepal_scrimmage_migration.sql first.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT THIS CHANGES, AND THE ONE THING TO READ CAREFULLY
-- ═══════════════════════════════════════════════════════════════════════════
-- A scrimmage can now run several sets, and each set's stats have to stay
-- separable. That means a player no longer has ONE row per session — they have
-- one row per session PER SET. So the uniqueness key has to widen:
--
--   before:  unique (practice_session_id, player_id)
--   after:   unique (practice_session_id, player_id, set_number)
--
-- This is the only migration in the series that REPLACES an existing index
-- rather than only adding things. Every existing row is backfilled to
-- set_number = 1 before the new index is built, so the widened key holds for
-- data written before sets existed and nothing is lost.
--
-- The client upserts on the three-column key. It carries a fallback for the
-- window between deploying the code and running this file: if the new key is
-- missing it merges each player's sets into one row and upserts on the old
-- two-column key, so saving still works — but per-set detail is lost for those
-- saves. Run this migration and that fallback never fires.
--
-- practice_sessions also gains set_scores: the per-set points, in order.
--   set_scores  jsonb  [{ "a": 25, "b": 21 }, { "a": 18, "b": 25 }, ...]
-- With sets in play, score_a / score_b hold SETS WON rather than points; the
-- points for each individual set live in set_scores.
--
-- Idempotent: safe to re-run.

-- ── practice_stats: which set each row belongs to ─────────────────────────
alter table practice_stats add column if not exists set_number integer not null default 1;

-- Backfill anything written before the column existed. This has to happen
-- BEFORE the new unique index is created, or rows with a null set_number
-- would not collide the way the key expects.
update practice_stats set set_number = 1 where set_number is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'practice_stats_set_number_check'
  ) then
    alter table practice_stats
      add constraint practice_stats_set_number_check
      check (set_number >= 1);
  end if;
end $$;

-- ── Widen the uniqueness key ──────────────────────────────────────────────
-- Create the new index FIRST, so that if anything is wrong the old one is
-- still standing and the app keeps saving.
create unique index if not exists idx_practice_stats_session_player_set
  on practice_stats(practice_session_id, player_id, set_number);

-- Only now retire the narrow one. Dropping it is required, not cosmetic: while
-- it exists a second set for the same player violates it and the save fails.
drop index if exists idx_practice_stats_session_player;

create index if not exists idx_practice_stats_set on practice_stats(practice_session_id, set_number);

-- ── practice_sessions: the per-set scores ─────────────────────────────────
alter table practice_sessions add column if not exists set_scores jsonb not null default '[]'::jsonb;
update practice_sessions set set_scores = '[]'::jsonb where set_scores is null;

-- ── RLS ───────────────────────────────────────────────────────────────────
-- Policies are not column-scoped, so the new columns are already covered.
-- Re-asserted so this file stands alone.
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

notify pgrst, 'reload schema';

-- ── Verification ──────────────────────────────────────────────────────────
-- 1) The new columns exist — expect set_number and set_scores:
--   select table_name, column_name, data_type, column_default
--   from information_schema.columns
--   where (table_name = 'practice_stats'    and column_name = 'set_number')
--      or (table_name = 'practice_sessions' and column_name = 'set_scores');
--
-- 2) THE IMPORTANT ONE — the key was actually swapped. Expect exactly one row,
--    idx_practice_stats_session_player_set. If the old two-column index is
--    still listed, a second set will fail to save:
--   select indexname, indexdef from pg_indexes
--   where tablename = 'practice_stats' and indexdef like '%UNIQUE%';
--
-- 3) Every pre-existing row was backfilled — expect ZERO rows:
--   select count(*) from practice_stats where set_number is null or set_number < 1;
--
-- 4) Nothing was added to the game tables — expect ZERO rows:
--   select column_name from information_schema.columns
--   where table_name = 'player_game_stats' and column_name in ('set_number', 'set_scores');
