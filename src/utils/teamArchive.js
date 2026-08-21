import { supabase } from '../supabase';

// Team archiving.
//
// `teams.archived` is a soft flag: an archived team keeps every row it ever
// owned and simply stops appearing in the normal app. Only God Mode reads or
// writes it, and only God Mode can hard-delete a team.
//
// The column arrives with scripts/team_archive_migration.sql. Until that has
// been run the column is absent from every row, so `archived` reads undefined
// and isArchived() answers false — the app behaves exactly as it did before,
// and only the archive/restore writes fail (with a message that says so).

export function isArchived(team) {
  return team?.archived === true;
}

export function activeOnly(teams) {
  return (teams || []).filter(t => !isArchived(t));
}

export function archivedOnly(teams) {
  return (teams || []).filter(t => isArchived(t));
}

// A write to `archived` against a database that hasn't run the migration comes
// back as a missing-column / stale-schema-cache error. Rewrite it into the one
// instruction that actually fixes it.
function archiveError(err) {
  if (!err) return null;
  const msg = err.message || '';
  if (/archived|schema cache|column/i.test(msg)) {
    return new Error('The teams.archived column is missing — run scripts/team_archive_migration.sql in Supabase.');
  }
  return err;
}

export async function setTeamArchived(teamId, archived) {
  const { error } = await supabase.from('teams').update({ archived }).eq('id', teamId);
  return { error: archiveError(error) };
}

// PostgREST puts the filter in the query string, so a very long `in.(...)` list
// can blow the URL limit. Batch it.
async function deleteIn(table, column, values) {
  for (let i = 0; i < values.length; i += 100) {
    const { error } = await supabase.from(table).delete().in(column, values.slice(i, i + 100));
    if (error) return { error };
  }
  return { error: null };
}

// Tables that only exist once their own migration has been run. A missing table
// is not a failed delete — there is nothing there to orphan — so those errors
// are swallowed rather than aborting the cascade.
const OPTIONAL_TEAM_TABLES = [
  'game_plans',
  'tournaments',
  'calendar_events',
  'formation_presets',
  'playground_sessions',
  'live_game_sessions',
];

// Hard-delete a team and everything hanging off it, children first.
//
// This does NOT rely on the database's ON DELETE rules: some of the original
// tables predate this app's migrations and their foreign keys aren't all
// cascading, so deleting the team row alone can either fail on a constraint or
// leave stats stranded behind a game that no longer exists. Deleting in
// dependency order makes the outcome the same whatever the schema says.
//
// Accounts are deliberately NOT deleted — they are people, not team data. A
// coach or player account that pointed at this team is detached (team_id and,
// for a player login, player_id set to null) and stays available to reassign.
export async function deleteTeamPermanently(team) {
  const teamId = team?.id;
  if (!teamId) return { error: new Error('No team given') };

  // player_game_stats has no team_id — it hangs off completed_games.id and
  // players.id, so both parents have to be collected before anything is cut.
  const { data: games, error: gErr } = await supabase
    .from('completed_games').select('id').eq('team_id', teamId);
  if (gErr) return { error: gErr };
  const { data: roster, error: pErr } = await supabase
    .from('players').select('id').eq('team_id', teamId);
  if (pErr) return { error: pErr };

  const gameIds = (games || []).map(g => g.id);
  const playerIds = (roster || []).map(p => p.id);

  if (gameIds.length) {
    const r = await deleteIn('player_game_stats', 'game_id', gameIds);
    if (r.error) return { error: r.error };
  }
  if (playerIds.length) {
    // Belt and braces: a stat row whose game was already removed by hand would
    // otherwise survive its player.
    const r = await deleteIn('player_game_stats', 'player_id', playerIds);
    if (r.error) return { error: r.error };
  }

  for (const table of OPTIONAL_TEAM_TABLES) {
    const { error } = await supabase.from(table).delete().eq('team_id', teamId);
    // 42P01 = undefined_table; PGRST205 = PostgREST doesn't know the table.
    if (error && !/does not exist|schema cache|PGRST205|42P01/i.test(error.message || error.code || '')) {
      return { error };
    }
  }

  // Ordered: the game tables come after game_plans (which references schedule),
  // and league_results before league_teams (which it references).
  for (const table of ['schedule', 'completed_games', 'league_results', 'league_teams', 'coach_team_assignments']) {
    const { error } = await supabase.from(table).delete().eq('team_id', teamId);
    if (error) return { error };
  }

  // Detach the people before their rows go.
  if (playerIds.length) {
    const { error } = await supabase.from('accounts').update({ player_id: null }).in('player_id', playerIds);
    if (error) return { error };
  }
  const { error: accErr } = await supabase.from('accounts').update({ team_id: null }).eq('team_id', teamId);
  if (accErr) return { error: accErr };

  const { error: plErr } = await supabase.from('players').delete().eq('team_id', teamId);
  if (plErr) return { error: plErr };

  const { error: tErr } = await supabase.from('teams').delete().eq('id', teamId);
  if (tErr) return { error: tErr };

  return { error: null };
}

// What a permanent delete would take with it — spelled out in the confirm
// dialog so the decision is made against real numbers, not a generic warning.
export function teamDataCounts(team, data) {
  const teamId = team?.id;
  const players = (data.players || []).filter(p => p.team_id === teamId);
  const playerIds = new Set(players.map(p => p.id));
  const games = (data.completedGames || []).filter(g => g.team_id === teamId);
  const gameIds = new Set(games.map(g => g.id));
  return {
    players: players.length,
    games: games.length,
    scheduled: (data.schedule || []).filter(s => s.team_id === teamId).length,
    tournaments: (data.tournaments || []).filter(t => t.team_id === teamId).length,
    stats: (data.playerGameStats || [])
      .filter(s => gameIds.has(s.game_id) || playerIds.has(s.player_id)).length,
    accounts: (data.accounts || []).filter(a => a.team_id === teamId).length
      + (data.coachAssignments || []).filter(a => a.team_id === teamId).length,
  };
}
