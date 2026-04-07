# StatsPal — Claude Code Build Instructions

## What you are building
A real volleyball stats web app for West HS called StatsPal.
The complete working prototype already exists as a single HTML file (statspal_prototype.html).
Your job is to convert it into a proper React + Supabase + Vercel app.

## Step 1 — Read the prototype
The file `statspal_prototype.html` in this folder contains the COMPLETE working app.
Every screen, every feature, every calculation is already built and working in that file.
Use it as your exact blueprint — match the design, colors, and behavior precisely.

## Step 2 — Tech stack
- React + Vite (already scaffolded)
- Supabase for database and auth
- Vercel for deployment
- No UI library needed — use plain CSS matching the prototype styles

## Step 3 — Database schema
Create these tables in Supabase:

```sql
-- Teams
create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  gender text,
  level text,
  color text default '#1a3a8f',
  season text default '2025-26',
  league_name text,
  created_at timestamp default now()
);

-- Players
create table players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  name text not null,
  initials text,
  position text,
  jersey_number text,
  height text,
  grade text,
  colors jsonb,
  player_index integer,
  created_at timestamp default now()
);

-- Accounts
create table accounts (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  role text not null check (role in ('admin','coach','player')),
  name text not null,
  team_id uuid references teams(id) on delete set null,
  player_id uuid references players(id) on delete set null,
  active boolean default true,
  created_at timestamp default now()
);

-- Schedule (upcoming games)
create table schedule (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  opponent text not null,
  game_date date not null,
  location text default 'Home',
  created_at timestamp default now()
);

-- Completed games
create table completed_games (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  opponent text not null,
  game_date date not null,
  location text default 'Home',
  result text check (result in ('W','L')),
  home_sets integer default 0,
  away_sets integer default 0,
  set_scores jsonb,
  created_at timestamp default now()
);

-- Player game stats
create table player_game_stats (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references completed_games(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  kills integer default 0,
  aces integer default 0,
  digs integer default 0,
  assists integer default 0,
  blocks integer default 0,
  errors integer default 0,
  attempts integer default 0,
  sets_played integer default 0
);

-- League teams (opponents in standings)
create table league_teams (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  name text not null,
  dot_color text default '#888888',
  text_color text default '#888888',
  is_us boolean default false
);

-- League results
create table league_results (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  home_league_team_id uuid references league_teams(id) on delete cascade,
  away_league_team_id uuid references league_teams(id) on delete cascade,
  home_sets integer default 0,
  away_sets integer default 0,
  game_date date,
  created_at timestamp default now()
);
```

## Step 4 — App structure
```
src/
  main.jsx
  App.jsx
  supabase.js          ← Supabase client
  styles.css           ← All styles from prototype
  contexts/
    AuthContext.jsx    ← currentUser, login, logout
    DataContext.jsx    ← all teams, players, games data
  screens/
    Login.jsx
    Hub.jsx            ← admin hub with team cards + Create Team button
    TeamDashboard.jsx  ← strip + tabs (Schedule, Standings, Averages, Roster)
    PreGame.jsx
    LiveGame.jsx
    LiveStats.jsx
    GameSummary.jsx
    PlayerDetail.jsx   ← coach view of one player
    PlayerGameDetail.jsx
    TeamAdmin.jsx      ← tabs: Accounts, Schedule, Players, Danger
    Export.jsx
    GodMode.jsx        ← tabs: Teams, Players, Games, Stats
    PlayerHome.jsx     ← player view: Season, Bests, Games, Efficiency, Schedule, Standings
    PlayerGameDetailPlayer.jsx
  components/
    StatsStrip.jsx
    ScheduleTab.jsx
    StandingsTab.jsx
    AveragesTab.jsx
    RosterTab.jsx
    AccountsTab.jsx
    modals/
      AddPlayerModal.jsx
      AddGameModal.jsx
      CreateTeamModal.jsx
      EditTeamModal.jsx
      PlayerLoginModal.jsx
      CoachLoginModal.jsx
      EditAccountModal.jsx
      CredsModal.jsx
      AddLeagueTeamModal.jsx
      AddResultModal.jsx
      GodStatsModal.jsx
      PreGameModals.jsx   ← lastpoint, setover, setsum, endmatch
  utils/
    stats.js           ← hpct, hstr, hcol, hlbl, bw, n2, n3, playerTotals, teamTotals, teamRecord, computeStandings
    colors.js          ← pColors, mkInit
    sort.js            ← sortedUpcoming, sortedCompleted, nextGame
```

## Step 5 — Key business logic (copy exactly from prototype)

### Hitting %
```js
function hpct(k, e, att) { return att > 0 ? (k - e) / att : null; }
```

### Color scale
```js
function hcol(k, e, att) {
  const h = hpct(k, e, att);
  if (h === null) return '#888';
  if (h <= 0.100) return '#C0392B';
  if (h <= 0.150) return '#E05A2B';
  if (h <= 0.200) return '#E67E22';
  if (h <= 0.250) return '#27AE60';
  if (h <= 0.300) return '#1E8449';
  return '#0F6E56';
}
```

### Standings engine (tiebreaker: 1. head-to-head, 2. set ratio)
See computeStandings() in prototype.

### Single source of truth
Every stat, average, record, and standing is computed live from the database on every render.
Never hardcode computed values. One refresh call updates everything everywhere.

### Schedule sorting
Always sort by date. Past games display newest first. Upcoming games display oldest first (next game first).

### Live game deuce logic
Sets 1-4 target score = 25. Final set target = 15.
A set ends only when one team leads by 2 or more at or above target score.

### Account rules
- Player logins: ONLY creatable for players that exist on the roster
- Coach logins: any name, no roster restriction
- Admin creates all accounts — no self-signup

## Step 6 — Colors and design
Primary navy: #1a3a8f
Dark navy: #122970  
Deepest navy: #0d1f5c
God Mode purple: #7b1fa2
Gold accent: #c9a84c
Win green: #1a5c2a on #e8f5e9
Loss red: #8b1a1a on #fdecea

Match the prototype exactly for all screen layouts, card styles, tab bars, modals, and the stats strip.

## Step 7 — After building, deploy
1. Push to GitHub
2. Connect to Vercel
3. Add Supabase environment variables to Vercel
4. Deploy

The live URL will be something like statspal-west.vercel.app
