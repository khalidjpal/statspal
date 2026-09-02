-- ═══════════════════════════════════════════════════════════════════════════
-- StatsPal — serve attempts on player_game_stats
-- ───────────────────────────────────────────────────────────────────────────
-- The live trackers now count a SERVE ATTEMPT the way they already count an
-- attack attempt: an ace and a service error each log their outcome and the
-- serve behind it, and a new "In" button covers the serve that landed and kept
-- the rally alive. That gives a denominator, which is what serve-in % and
-- ace % have always needed:
--
--   serve-in % = (serve_attempts - serve_errors) / serve_attempts
--   ace %      = aces / serve_attempts
--
-- practice_stats already had this column. player_game_stats did not, so until
-- this runs, StatsPal's live game counts serve attempts on screen and
-- insertPlayerStats() drops the column on save rather than losing the match.
-- Run this and it persists.
--
-- Idempotent: safe to run more than once, and safe to run on a project that
-- has already been part-migrated.
--
-- Paste into the Supabase SQL editor and run.
-- ═══════════════════════════════════════════════════════════════════════════

alter table player_game_stats
  add column if not exists serve_attempts integer not null default 0;

-- Existing rows recorded aces and errors but never the serves behind them, so
-- their attempt count is unknown, not zero. Leaving it at 0 is what keeps that
-- honest: every rate helper returns null when serve_attempts is 0, so those
-- games read "not tracked" rather than inventing a 0% or a 100%.
--
-- Do NOT backfill serve_attempts = aces + serve_errors. That would count only
-- the serves that ended a rally and silently overstate both rates.

-- PostgREST caches the schema; without this the new column stays invisible to
-- the client until the project restarts.
notify pgrst, 'reload schema';
