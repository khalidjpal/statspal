import { supabase } from '../supabase';

// =============================================================================
// Tournament helpers
// =============================================================================
// A tournament is a container for a day/event's worth of games. Its games are
// split across the two game tables like every other game in the app:
//
//   schedule         → not played yet   (`_kind: 'scheduled'`)
//   completed_games  → played           (`_kind: 'completed'`)
//
// so anything that wants "the games in this tournament" has to look in both.
// tournamentGames() is that lookup; everything else here builds on it.
// =============================================================================

export const TBD = 'TBD';

// Is this opponent a placeholder rather than a real team name?
export function isTBD(opponent) {
  return !opponent || String(opponent).trim().toUpperCase() === TBD;
}

// Every game belonging to a tournament, from both tables, ordered by
// tournament_game_no (the stable "Game N" ordinal), with created_at as the
// tiebreaker for legacy rows that predate the column.
export function tournamentGames(tournamentId, schedule, completedGames) {
  const scheduled = (schedule || [])
    .filter(g => g.tournament_id === tournamentId)
    .map(g => ({ ...g, _kind: 'scheduled' }));
  const completed = (completedGames || [])
    .filter(g => g.tournament_id === tournamentId)
    .map(g => ({ ...g, _kind: 'completed' }));

  return [...scheduled, ...completed].sort((a, b) => {
    const na = a.tournament_game_no ?? Infinity;
    const nb = b.tournament_game_no ?? Infinity;
    if (na !== nb) return na - nb;
    return (new Date(a.created_at || 0).getTime() || 0) - (new Date(b.created_at || 0).getTime() || 0);
  });
}

// Next free "Game N" ordinal. Based on the max in use rather than the count, so
// deleting Game 2 doesn't make the next add collide with Game 3.
export function nextGameNo(games) {
  let max = 0;
  for (const g of games || []) {
    const n = Number(g.tournament_game_no) || 0;
    if (n > max) max = n;
  }
  return max + 1;
}

// Status of one tournament game. `activeSession` is the team's in-progress
// live_game_sessions row (or null) — a game is LIVE while StatsPal is tracking it.
export function gameStatus(game, activeSession) {
  if (game?._kind === 'completed') return game.result ? 'final' : 'noresult';
  if (activeSession && game && activeSession.schedule_game_id === game.id) return 'live';
  return 'upcoming';
}

export const STATUS_LABEL = {
  live: 'LIVE',
  final: 'FINAL',
  noresult: 'NO RESULT',
  upcoming: 'UPCOMING',
};

// Every YYYY-MM-DD the tournament covers, so a multi-day event can be painted
// across each of its days on the calendar. Capped at 31 days as a guard against
// a mistyped end date turning into an unbounded loop.
export function tournamentDays(t) {
  if (!t?.start_date) return [];
  const start = t.start_date;
  const end = t.end_date && t.end_date > start ? t.end_date : start;
  const days = [];
  const cur = new Date(start + 'T00:00:00');
  const last = new Date(end + 'T00:00:00');
  while (cur <= last && days.length < 31) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    days.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

// Where a date sits in a multi-day event — drives the calendar span styling.
export function dayPosition(t, dateStr) {
  const days = tournamentDays(t);
  if (days.length <= 1) return 'only';
  const i = days.indexOf(dateStr);
  if (i === -1) return null;
  if (i === 0) return 'start';
  if (i === days.length - 1) return 'end';
  return 'mid';
}

// W–L across the tournament's completed games.
export function tournamentRecord(games) {
  let w = 0, l = 0;
  for (const g of games || []) {
    if (g._kind !== 'completed') continue;
    if (g.result === 'W') w++;
    else if (g.result === 'L') l++;
  }
  return { w, l };
}

// "Oct 11" for a single-day event, "Oct 11 – Oct 12" for a range.
export function tournamentDateLabel(t) {
  if (!t?.start_date) return '';
  const fmt = d => new Date(d + 'T00:00:00')
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const start = fmt(t.start_date);
  if (!t.end_date || t.end_date === t.start_date) return start;
  return `${start} – ${fmt(t.end_date)}`;
}

// Display label for one game row: "Game 3 · TBD" / "Game 1 · vs Ridgeview".
export function gameLabel(game) {
  const no = game?.tournament_game_no;
  const prefix = no ? `Game ${no}` : 'Game';
  return isTBD(game?.opponent) ? `${prefix} · ${TBD}` : `${prefix} · vs ${game.opponent}`;
}

// The tournament's shared roster resolved against the team's players. Falls
// back to the whole team when the roster is empty or references players who
// have since been removed, so a tournament can never end up with nobody on it.
export function tournamentRoster(tournament, teamPlayers) {
  const ids = Array.isArray(tournament?.roster) ? tournament.roster : [];
  if (ids.length === 0) return teamPlayers || [];
  const set = new Set(ids.map(String));
  const matched = (teamPlayers || []).filter(p => set.has(String(p.id)));
  return matched.length > 0 ? matched : (teamPlayers || []);
}

// "10:30" (the HTML time-input value we store) → "10:30 AM". Tolerates the
// "HH:MM:SS" shape too, in case the column is ever migrated to a real `time`.
// Returns '' for anything unparseable, so callers can just test truthiness.
export function formatGameTime(value) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value || '').trim());
  if (!m) return '';
  const h = Number(m[1]);
  if (!(h >= 0 && h <= 23)) return '';
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${suffix}`;
}

// Where a fixture is played, as typed parts so the row can pair each with its
// own line icon. When and who are the fixture row's own columns — this is only
// the trailing detail that hangs off the matchup.
export function gamePlaceParts(game) {
  const parts = [];
  if (game?.court && String(game.court).trim()) {
    parts.push({ key: 'court', text: String(game.court).trim() });
  }
  // 'Neutral' is the quick-add default and says nothing; Home/Away do.
  if (game?.location && game.location !== 'Neutral') {
    parts.push({ key: 'location', text: game.location });
  }
  return parts;
}

// Minutes past midnight for a stored "HH:MM" time, or Infinity when the game
// has no time yet — which is exactly the sort key we want, since an untimed
// game belongs after every timed one on the same day.
function gameTimeKey(game) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(game?.game_time || '').trim());
  if (!m) return Infinity;
  const h = Number(m[1]), min = Number(m[2]);
  if (!(h >= 0 && h <= 23) || !(min >= 0 && min <= 59)) return Infinity;
  return h * 60 + min;
}

// Games in the order they are actually played: earliest day first, earliest
// time first within a day, untimed games after the timed ones they share a day
// with, and undated games at the very end. Ties fall back to the game number
// and then creation order, so the list never reshuffles between renders.
//
// This is deliberately NOT the order tournamentGames() returns. Every other
// surface lists a tournament by game number, which is the number a coach reads
// off the event's own schedule; only the fixture list re-sorts by clock time.
export function sortGamesBySchedule(games) {
  return [...(games || [])].sort((a, b) => {
    const da = a?.game_date || '', db = b?.game_date || '';
    if (!da !== !db) return da ? -1 : 1;
    if (da !== db) return da < db ? -1 : 1;

    const ta = gameTimeKey(a), tb = gameTimeKey(b);
    if (ta !== tb) return ta - tb;

    const na = a?.tournament_game_no ?? Infinity;
    const nb = b?.tournament_game_no ?? Infinity;
    if (na !== nb) return na - nb;

    return (new Date(a?.created_at || 0).getTime() || 0) - (new Date(b?.created_at || 0).getTime() || 0);
  });
}

// Schedule-ordered games cut into day blocks, preserving that order. Undated
// games collect under a null date at the end.
export function groupGamesByDay(games) {
  const days = [];
  for (const g of sortGamesBySchedule(games)) {
    const date = g?.game_date || null;
    const last = days[days.length - 1];
    if (last && last.date === date) last.games.push(g);
    else days.push({ date, games: [g] });
  }
  return days;
}

// "SAT · AUG 18" — the day divider over a multi-day tournament's fixtures.
export function gameDayHeading(dateStr) {
  if (!dateStr) return 'Date TBD';
  const d = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return dateStr;
  const wd = d.toLocaleDateString('en-US', { weekday: 'short' });
  const mo = d.toLocaleDateString('en-US', { month: 'short' });
  return `${wd} · ${mo} ${d.getDate()}`.toUpperCase();
}

// "Sat 8/18" — the compact date under a fixture's time, used only on a
// single-day list where there is no day divider to carry it.
export function gameDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return dateStr;
  const wd = d.toLocaleDateString('en-US', { weekday: 'short' });
  return `${wd} ${d.getMonth() + 1}/${d.getDate()}`;
}

// Quick-add a blank game to a tournament — one tap, no required fields.
// The opponent is the literal placeholder 'TBD' and can be renamed at any time
// as the day unfolds.
//
// gameTime and court are optional extras, and are left OUT of the payload
// entirely when blank rather than sent as null: that keeps the one-tap add
// working on an install that hasn't run game_time_court_migration.sql yet.
export async function quickAddTournamentGame({ tournament, games, opponent, gameDate, location, gameTime, court }) {
  const payload = {
    team_id: tournament.team_id,
    opponent: (opponent || '').trim() || TBD,
    game_date: gameDate || tournament.start_date,
    location: location || 'Neutral',
    is_league: false,
    league_team_id: null,
    tournament_id: tournament.id,
    tournament_game_no: nextGameNo(games),
  };
  if (gameTime && String(gameTime).trim()) payload.game_time = String(gameTime).trim();
  if (court && String(court).trim()) payload.court = String(court).trim();

  const { data, error } = await supabase.from('schedule').insert(payload).select().single();
  return { data, error };
}

// Remove one game from a tournament. A completed game's player_game_stats rows
// go first — completed_games has no cascade to them.
export async function deleteTournamentGame(game) {
  const table = game._kind === 'completed' ? 'completed_games' : 'schedule';
  if (table === 'completed_games') {
    const del = await supabase.from('player_game_stats').delete().eq('game_id', game.id);
    if (del.error) return { error: del.error };
  }
  const { error } = await supabase.from(table).delete().eq('id', game.id);
  return { error };
}
