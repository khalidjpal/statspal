import { supabase } from '../supabase';

/**
 * Save or update a live game session (upsert by team_id where status = in_progress).
 * Uses delete-then-insert pattern to enforce one active session per team.
 */
export async function saveSession(teamId, sessionData) {
  // Check if an existing in_progress session exists for this team
  const { data: existing } = await supabase
    .from('live_game_sessions')
    .select('id')
    .eq('team_id', teamId)
    .eq('status', 'in_progress')
    .maybeSingle();

  const payload = {
    team_id: teamId,
    opponent: sessionData.opponent,
    game_format: sessionData.bestOf,
    current_set: sessionData.currentSet,
    home_score: sessionData.homeScore,
    away_score: sessionData.awayScore,
    home_sets: sessionData.homeSetsWon,
    away_sets: sessionData.awaySetsWon,
    set_history: sessionData.sets || [],
    player_stats: sessionData.stats || {},
    lineup: sessionData.lineup || [],
    is_league: sessionData.isLeague || false,
    league_team_id: sessionData.leagueTeamId || null,
    schedule_game_id: sessionData.scheduledGameId || null,
    game_date: sessionData.gameDate || null,
    location: sessionData.location || 'Home',
    history: sessionData.history || [],
    status: 'in_progress',
    last_updated: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await supabase
      .from('live_game_sessions')
      .update(payload)
      .eq('id', existing.id);
    return { error };
  } else {
    const { error } = await supabase
      .from('live_game_sessions')
      .insert(payload);
    return { error };
  }
}

/**
 * Get the active in_progress session for a team (at most one).
 */
export async function getActiveSession(teamId) {
  const { data, error } = await supabase
    .from('live_game_sessions')
    .select('*')
    .eq('team_id', teamId)
    .eq('status', 'in_progress')
    .maybeSingle();
  return { data, error };
}

/**
 * Mark session as completed (when match ends normally).
 */
export async function completeSession(teamId) {
  const { error } = await supabase
    .from('live_game_sessions')
    .update({ status: 'completed', last_updated: new Date().toISOString() })
    .eq('team_id', teamId)
    .eq('status', 'in_progress');
  return { error };
}

/**
 * Abandon (delete) the active session for a team.
 */
export async function abandonSession(teamId) {
  const { error } = await supabase
    .from('live_game_sessions')
    .delete()
    .eq('team_id', teamId)
    .eq('status', 'in_progress');
  return { error };
}
