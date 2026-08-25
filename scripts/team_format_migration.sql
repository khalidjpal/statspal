-- Team FORMAT for VolleyballPal.
--
-- `teams.format` says how a team's season is SHAPED, which is a different
-- question from `teams.school_type` (what kind of school it is, and which
-- grade/level vocabulary the roster uses):
--
--   'high_school' — league play. The dashboard's top-left panel is STANDINGS.
--   'club'        — no league; tournaments and one-off games. The top-left
--                   panel is NEXT UP (the soonest tournament or game).
--
-- Format is chosen when the team is created and can only be changed afterwards
-- in God Mode. Nothing else in the app writes it.
--
-- Type: text not null default 'high_school'. NOT NULL + default so the ALTER
-- itself backfills every existing team as high_school and the client never has
-- to reason about a null — existing teams keep exactly the behaviour they have
-- today. The client also treats a MISSING column as high_school, so the app
-- keeps working (minus club format) until this is run.
--
-- Idempotent: safe to re-run.

alter table teams add column if not exists format text not null default 'high_school';

-- Belt and braces for an install that somehow got the column as nullable, or
-- picked up a value from outside the app.
update teams set format = 'high_school' where format is null or format not in ('high_school', 'club');

-- Only the two values the client knows how to render. Added separately from the
-- column so re-running is safe whichever half already exists.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'teams_format_check' and conrelid = 'teams'::regclass
  ) then
    alter table teams add constraint teams_format_check
      check (format in ('high_school', 'club'));
  end if;
end $$;

-- RLS: nothing to add. This is a new column on the existing `teams` table, and
-- Postgres row-level security is per-ROW, not per-column — whatever policies
-- already let the app select and update `teams` (it does both today: God Mode
-- edits team info, CreateTeamModal inserts) cover `format` automatically for
-- both the anon and authenticated roles. No column-level grants are in play.
-- This is the same reasoning team_archive_migration.sql relies on for
-- `teams.archived`, which has been in production since.
--
-- To confirm the policies in force for yourself:
--   select tablename, policyname, roles, cmd
--   from pg_policies
--   where tablename = 'teams'
--   order by policyname;

-- PostgREST caches the table schema. Supabase normally reloads it via an event
-- trigger after DDL, but that can lag — and a stale cache reports a column that
-- genuinely exists as "Could not find the 'format' column ... in the schema
-- cache". This forces the reload immediately.
notify pgrst, 'reload schema';

-- Verification — should return one row: format, text, 'high_school'::text, NO.
--   select column_name, data_type, column_default, is_nullable
--   from information_schema.columns
--   where table_name = 'teams' and column_name = 'format';
--
-- And every existing team should read as high_school:
--   select format, count(*) from teams group by format;
