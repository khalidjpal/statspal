-- Game time + court number for VolleyballPal.
--
-- Tournament days run on a published schedule ("Court 3 at 10:30"), so a game
-- needs a start time and a court alongside its date. Both are OPTIONAL: a game
-- is still quick-added in one tap with neither, and they can be filled in later
-- from the edit dialog as the day's schedule is posted.
--
-- As with tournament_id, there is no single `games` table — a game lives in
-- `schedule` until it's tracked and is MOVED to `completed_games` afterwards, so
-- both columns have to exist on BOTH tables and are carried across the hand-off
-- by the client (App.jsx handleEndMatch).
--
-- Types:
--   game_time  text  — the HTML <input type="time"> value, "HH:MM" 24-hour.
--                      Deliberately text, not `time`: it round-trips the input
--                      value exactly, never rejects a stray format from a
--                      browser, and nothing in the app sorts or filters on it.
--                      Rendered as "10:30 AM" by formatGameTime().
--   court      text  — free text, exactly as typed: "Court 1", "Ct 3B", "12".
--
-- Idempotent: safe to re-run.

alter table schedule        add column if not exists game_time text;
alter table schedule        add column if not exists court     text;

alter table completed_games add column if not exists game_time text;
alter table completed_games add column if not exists court     text;

-- RLS: nothing to add. These are new columns on existing tables, and Postgres
-- row-level security is per-ROW, not per-column — the policies already on
-- `schedule` and `completed_games` (which the app reads and writes today)
-- cover these columns automatically for both the anon and authenticated roles.
-- No column-level grants are in play either; the app's existing selects/updates
-- on these tables already prove the roles hold table-wide privileges.
--
-- If you want to confirm that for yourself, this lists the policies in force:
--   select tablename, policyname, roles, cmd
--   from pg_policies
--   where tablename in ('schedule', 'completed_games')
--   order by tablename, policyname;

-- Verification — should return four rows, game_time + court on each table.
--   select table_name, column_name, data_type
--   from information_schema.columns
--   where table_name in ('schedule', 'completed_games')
--     and column_name in ('game_time', 'court')
--   order by table_name, column_name;
