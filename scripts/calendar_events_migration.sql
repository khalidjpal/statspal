-- Calendar events for RotationPal.
--
-- One row per *event series* — even single-day events live here. The
-- recurrence_rule jsonb describes when the event occurs; the client expands
-- the rule into concrete dates when rendering the calendar. Storing the
-- rule once is dramatically cheaper than one row per occurrence for daily
-- practices across a 12-week season.
--
-- recurrence_rule shape (all keys optional; mode picks which apply):
--   {
--     "mode": "single" | "range" | "manual",
--     "date":  "YYYY-MM-DD",                 // when mode = "single"
--     "start": "YYYY-MM-DD",                 // when mode = "range"
--     "end":   "YYYY-MM-DD",                 // when mode = "range"
--     "days":  [0,1,2,3,4,5,6],              // 0=Sun…6=Sat, when mode = "range"
--     "dates": ["YYYY-MM-DD", ...],          // when mode = "manual"
--     "start_time": "HH:MM",                 // 24-hour stored, rendered as 12h
--     "end_time":   "HH:MM"
--   }
--
-- exceptions: jsonb array of YYYY-MM-DD strings that should be skipped from
-- the expanded occurrences (used by "delete this occurrence only").
--
-- Idempotent: safe to re-run.

create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade not null,
  title text not null default 'New Event',
  color text not null default '#bc8cff',
  recurrence_rule jsonb not null default '{}'::jsonb,
  exceptions jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table calendar_events add column if not exists recurrence_rule jsonb not null default '{}'::jsonb;
alter table calendar_events add column if not exists exceptions      jsonb not null default '[]'::jsonb;
alter table calendar_events add column if not exists updated_at      timestamptz default now();

create index if not exists idx_calendar_events_team on calendar_events(team_id);

alter table calendar_events enable row level security;

drop policy if exists "calendar_events_all_authenticated" on calendar_events;
create policy "calendar_events_all_authenticated"
  on calendar_events
  for all
  to authenticated
  using (true)
  with check (true);

-- Verification — should list id, team_id, title, color, recurrence_rule, exceptions, timestamps.
--   select column_name, data_type
--   from information_schema.columns
--   where table_name = 'calendar_events'
--   order by ordinal_position;
