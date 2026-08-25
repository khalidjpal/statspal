import { supabase } from '../supabase';
import { todayIsoLocal } from './recurrence';

// Team format.
//
// `teams.format` says how a team's season is shaped, and the dashboard swaps
// its top-left panel on it:
//
//   'high_school' — league play        → Standings panel (the original)
//   'club'        — tournaments/one-offs → Next Up panel
//
// This is NOT `teams.school_type`, which stays what it always was: the kind of
// school, and therefore which grade/level vocabulary the roster offers.
//
// The column arrives with scripts/team_format_migration.sql. Until that has
// been run the column is absent from every row, so `format` reads undefined and
// teamFormat() answers 'high_school' — every team keeps the standings dashboard
// it has today, and only the format writes fail (with a message that says so).

export const HIGH_SCHOOL = 'high_school';
export const CLUB = 'club';

export const FORMATS = [
  { value: HIGH_SCHOOL, label: 'High School format', hint: 'League play — the dashboard shows standings.' },
  { value: CLUB,        label: 'Club format',        hint: 'Tournaments and one-off games — the dashboard shows what’s next.' },
];

export const FORMAT_LABEL = {
  [HIGH_SCHOOL]: 'High School',
  [CLUB]: 'Club',
};

// Anything that isn't exactly 'club' — including a missing column — is
// high_school. Never let an unknown value blank out the dashboard.
export function teamFormat(team) {
  return team?.format === CLUB ? CLUB : HIGH_SCHOOL;
}

export function isClubFormat(team) {
  return teamFormat(team) === CLUB;
}

// A write to `format` against a database that hasn't run the migration comes
// back as a missing-column / stale-schema-cache error. Rewrite it into the one
// instruction that actually fixes it.
export function formatError(err) {
  if (!err) return null;
  const msg = err.message || '';
  if (/format|schema cache|column/i.test(msg)) {
    return new Error('The teams.format column is missing — run scripts/team_format_migration.sql in Supabase.');
  }
  return err;
}

export async function setTeamFormat(teamId, format) {
  const value = format === CLUB ? CLUB : HIGH_SCHOOL;
  const { error } = await supabase.from('teams').update({ format: value }).eq('id', teamId);
  return { error: formatError(error) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Next event
// ─────────────────────────────────────────────────────────────────────────────
// What the club dashboard's Next Up panel shows: the SOONER of the next
// tournament and the next standalone game.
//
// "Upcoming" means future or in progress:
//   tournament — its last day (end_date, or start_date for a single-day event)
//                has not passed. A tournament running right now is upcoming.
//   game       — it is still in `schedule` (unplayed) and its date has not
//                passed. A completed game is over by definition, and a
//                past-dated unplayed game is a missing result, not a fixture —
//                the schedule widget already files those under PAST.
//
// Games belonging to a tournament are deliberately excluded: the tournament
// itself is the event, and listing its Game 1 alongside it would show the same
// thing twice.

// Sort key for a tournament: its start date, except that a tournament already
// under way is pulled forward to today — it is happening NOW, so nothing dated
// later can be sooner.
function tournamentSortDate(t, today) {
  const start = t.start_date || '';
  return start < today ? today : start;
}

// Minutes past midnight for a stored "HH:MM", or Infinity when the game has no
// time — an untimed game belongs after every timed one on the same day.
function timeKey(value) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value || '').trim());
  if (!m) return Infinity;
  const h = Number(m[1]), min = Number(m[2]);
  if (!(h >= 0 && h <= 23) || !(min >= 0 && min <= 59)) return Infinity;
  return h * 60 + min;
}

export function nextTeamEvent({ team, schedule, tournaments, today = todayIsoLocal() }) {
  const teamId = team?.id;
  if (!teamId) return null;

  const candidates = [];

  for (const t of tournaments || []) {
    if (t.team_id !== teamId) continue;
    const last = t.end_date || t.start_date || '';
    if (!last || last < today) continue;
    candidates.push({
      kind: 'tournament',
      tournament: t,
      date: tournamentSortDate(t, today),
      // All-day: a tournament owns its whole day, so it sorts ahead of a timed
      // game sharing that date.
      time: -1,
      inProgress: (t.start_date || '') <= today,
    });
  }

  for (const g of schedule || []) {
    if (g.team_id !== teamId) continue;
    if (g.tournament_id) continue;          // belongs to a tournament — that's the event
    if (!g.game_date || g.game_date < today) continue;
    candidates.push({
      kind: 'game',
      game: g,
      date: g.game_date,
      time: timeKey(g.game_time),
      inProgress: g.game_date === today,
    });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.time !== b.time) return a.time - b.time;
    // Stable last resort so the panel never flips between renders.
    const ida = a.kind === 'tournament' ? a.tournament.id : a.game.id;
    const idb = b.kind === 'tournament' ? b.tournament.id : b.game.id;
    return String(ida).localeCompare(String(idb));
  });

  return candidates[0];
}
