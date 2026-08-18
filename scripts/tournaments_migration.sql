-- Tournaments for VolleyballPal.
--
-- A tournament is a CONTAINER for a day/event's worth of games: one name, one
-- date (or date range), one shared roster. Club play is tournament-shaped;
-- high school stays one-off games, so a game either belongs to a tournament
-- (tournament_id set) or is standalone (tournament_id null).
--
-- IMPORTANT — there is no single `games` table in this app. A game lives in
-- `schedule` while it's unplayed and is MOVED to `completed_games` when live
-- tracking ends (App.jsx handleEndMatch inserts the completed row, then deletes
-- the schedule row). player_game_stats.game_id points at completed_games.id.
-- So tournament_id has to exist on BOTH tables and is carried across the
-- hand-off by the client.
--
-- roster: jsonb array of players.id — the shared roster picked once at the
-- tournament level. Every game in the tournament starts with exactly this
-- lineup; the coach is never prompted for a roster per game.
--
-- tournament_game_no: stable 1-based ordinal used for the "Game 1 / Game 2 /
-- Game 3" labels. It's stored (not derived from row order) precisely because a
-- game changes tables mid-event, and because quick-added games have no opponent
-- to identify them by yet.
--
-- Idempotent: safe to re-run.

create table if not exists tournaments (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid references teams(id) on delete cascade not null,
  name        text not null default 'Tournament',
  start_date  date not null,
  end_date    date,                                -- null = single-day event
  location    text,
  roster      jsonb not null default '[]'::jsonb,  -- array of players.id
  created_by  uuid,                                -- accounts.id; no FK — auth is app-managed
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Idempotent column upgrades for installs that ran an earlier version.
alter table tournaments add column if not exists end_date   date;
alter table tournaments add column if not exists location   text;
alter table tournaments add column if not exists roster     jsonb not null default '[]'::jsonb;
alter table tournaments add column if not exists created_by uuid;
alter table tournaments add column if not exists updated_at timestamptz default now();

-- Link games to their tournament.
--
-- on delete set null (not cascade): deleting a tournament releases its games as
-- standalone games. It must never cascade away completed games or the
-- player_game_stats rows hanging off them.
alter table schedule        add column if not exists tournament_id uuid references tournaments(id) on delete set null;
alter table completed_games add column if not exists tournament_id uuid references tournaments(id) on delete set null;

alter table schedule        add column if not exists tournament_game_no integer;
alter table completed_games add column if not exists tournament_game_no integer;

create index if not exists idx_tournaments_team           on tournaments(team_id);
create index if not exists idx_schedule_tournament        on schedule(tournament_id);
create index if not exists idx_completed_games_tournament on completed_games(tournament_id);

-- RLS — same shape as calendar_events / game_plans / playground_sessions.
alter table tournaments enable row level security;

drop policy if exists "tournaments_all_authenticated" on tournaments;
create policy "tournaments_all_authenticated"
  on tournaments
  for all
  to authenticated
  using (true)
  with check (true);

-- The app logs in against its own `accounts` table using the Supabase anon key,
-- so PostgREST sees the `anon` role, not `authenticated`. Mirrored policy so
-- reads/writes actually go through. Drop this one if your other tables get by
-- without an anon policy.
drop policy if exists "tournaments_all_anon" on tournaments;
create policy "tournaments_all_anon"
  on tournaments
  for all
  to anon
  using (true)
  with check (true);

-- Verification — should list id, team_id, name, start_date, end_date, location,
-- roster, created_by, created_at, updated_at.
--   select column_name, data_type
--   from information_schema.columns
--   where table_name = 'tournaments'
--   order by ordinal_position;
--
-- And the two new columns on each game table:
--   select table_name, column_name, data_type
--   from information_schema.columns
--   where column_name in ('tournament_id', 'tournament_game_no')
--   order by table_name, column_name;
