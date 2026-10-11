// Fictional sample data for the landing page's dashboard preview. Every team,
// player and result here is made up; nothing is read from the database. The
// shapes match the rows DataContext hands the real dashboard widgets, so the
// preview renders through exactly the same components.

export const SAMPLE_TEAM = {
  id: 'sample-team',
  name: 'Harbor Point Herons',
  color: '#58a6ff',
  format: 'high_school',
};

const T = SAMPLE_TEAM.id;

// Dates are relative to today so "Upcoming" always has games in it.
function isoDaysFromToday(days) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const SAMPLE_LEAGUE_TEAMS = [
  { id: 'lt-herons', team_id: T, name: 'Harbor Point', is_us: true, dot_color: '#58a6ff' },
  { id: 'lt-cedar', team_id: T, name: 'Cedar Ridge', dot_color: '#f0a500' },
  { id: 'lt-lakeview', team_id: T, name: 'Lakeview', dot_color: '#3fb950' },
  { id: 'lt-north', team_id: T, name: 'North Shore', dot_color: '#bc8cff' },
  { id: 'lt-mesa', team_id: T, name: 'Mesa Vista', dot_color: '#f85149' },
];

function result(id, home, away, homeSets, awaySets, days) {
  return {
    id, team_id: T,
    home_league_team_id: home, away_league_team_id: away,
    home_sets: homeSets, away_sets: awaySets,
    game_date: isoDaysFromToday(days),
  };
}

export const SAMPLE_LEAGUE_RESULTS = [
  result('lr1', 'lt-herons', 'lt-lakeview', 3, 1, -21),
  result('lr2', 'lt-cedar', 'lt-herons', 3, 2, -17),
  result('lr3', 'lt-herons', 'lt-mesa', 3, 0, -14),
  result('lr4', 'lt-north', 'lt-herons', 1, 3, -10),
  result('lr5', 'lt-herons', 'lt-cedar', 3, 1, -3),
  result('lr6', 'lt-cedar', 'lt-lakeview', 3, 0, -20),
  result('lr7', 'lt-cedar', 'lt-north', 3, 2, -12),
  result('lr8', 'lt-mesa', 'lt-cedar', 1, 3, -7),
  result('lr9', 'lt-lakeview', 'lt-north', 3, 2, -15),
  result('lr10', 'lt-mesa', 'lt-lakeview', 2, 3, -9),
  result('lr11', 'lt-north', 'lt-mesa', 3, 1, -5),
];

export const SAMPLE_COMPLETED_GAMES = [
  { id: 'cg1', team_id: T, opponent: 'Cedar Ridge', game_date: isoDaysFromToday(-3), location: 'Home', result: 'W', home_sets: 3, away_sets: 1 },
  { id: 'cg2', team_id: T, opponent: 'North Shore', game_date: isoDaysFromToday(-10), location: 'Away', result: 'W', home_sets: 3, away_sets: 1 },
  { id: 'cg3', team_id: T, opponent: 'Mesa Vista', game_date: isoDaysFromToday(-14), location: 'Home', result: 'W', home_sets: 3, away_sets: 0 },
];

export const SAMPLE_SCHEDULE = [
  { id: 's1', team_id: T, opponent: 'Lakeview', game_date: isoDaysFromToday(2), location: 'Away' },
  { id: 's2', team_id: T, opponent: 'Mesa Vista', game_date: isoDaysFromToday(6), location: 'Home' },
  { id: 's3', team_id: T, opponent: 'North Shore', game_date: isoDaysFromToday(9), location: 'Home' },
];

const P = (n, name, jersey_number, position) =>
  ({ id: `sp${n}`, team_id: T, name, jersey_number, position, player_index: n });

export const SAMPLE_PLAYERS = [
  P(1, 'Jess Tran', '4', 'Setter'),
  P(2, 'Priya Natarajan', '3', 'Setter'),
  P(3, 'Maya Okafor', '12', 'Outside Hitter'),
  P(4, 'Kenzie Park', '2', 'Outside Hitter'),
  P(5, 'Nora Castellanos', '18', 'Outside Hitter'),
  P(6, 'Riley Brooks', '9', 'Middle Blocker'),
  P(7, 'Hana Lindqvist', '21', 'Middle Blocker'),
  P(8, 'Sofia Reyes', '15', 'Right Side'),
  P(9, 'Ana Lima', '7', 'Libero'),
  P(10, 'Tess Whitaker', '10', 'Defensive Specialist'),
];
