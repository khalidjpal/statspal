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

// Quick-add a blank game to a tournament — one tap, no required fields.
// The opponent is the literal placeholder 'TBD' and can be renamed at any time
// as the day unfolds.
export async function quickAddTournamentGame({ tournament, games, opponent, gameDate, location }) {
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
