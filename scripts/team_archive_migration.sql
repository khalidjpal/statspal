-- Team archiving for VolleyballPal.
--
-- Archiving is a SOFT flag, never a delete. `teams.archived = true` hides a
-- team from every normal surface (the team picker, the hub, RotationPal's team
-- list, coach assignment dropdowns) while leaving the team row and ALL of its
-- data — players, schedule, completed_games, player_game_stats, tournaments,
-- game_plans, league_teams/results, calendar_events, formation_presets,
-- playground_sessions — completely untouched. Restoring is a single flip back
-- to false and the team returns exactly as it was.
--
-- Archiving, restoring and permanent deletion are God Mode only; nothing in the
-- normal app reads or writes this column.
--
-- Type: boolean not null default false. NOT NULL + default so every existing
-- row is backfilled as active by the ALTER itself and the client never has to
-- reason about a null. The client also treats a MISSING column as "not
-- archived", so the app keeps working (minus archiving) until this is run.
--
-- Idempotent: safe to re-run.

alter table teams add column if not exists archived boolean not null default false;

-- Belt and braces for an install that somehow got the column as nullable.
update teams set archived = false where archived is null;

-- The app filters "where not archived" on essentially every screen, and there
-- are far more active teams than archived ones, so index the archived rows.
create index if not exists idx_teams_archived on teams(archived) where archived;

-- RLS: nothing to add. This is a new column on the existing `teams` table, and
-- Postgres row-level security is per-ROW, not per-column — whatever policies
-- already let the app select and update `teams` (it does both today: God Mode
-- edits team info, CreateTeamModal inserts) cover `archived` automatically for
-- both the anon and authenticated roles. No column-level grants are in play.
--
-- To confirm the policies in force for yourself:
--   select tablename, policyname, roles, cmd
--   from pg_policies
--   where tablename = 'teams'
--   order by policyname;

-- PostgREST caches the table schema. Supabase normally reloads it via an event
-- trigger after DDL, but that can lag — and a stale cache reports a column that
-- genuinely exists as "Could not find the 'archived' column ... in the schema
-- cache". This forces the reload immediately.
notify pgrst, 'reload schema';

-- Verification — should return one row: archived, boolean, false.
--   select column_name, data_type, column_default, is_nullable
--   from information_schema.columns
--   where table_name = 'teams' and column_name = 'archived';
--
-- And every existing team should read as active:
--   select archived, count(*) from teams group by archived;
