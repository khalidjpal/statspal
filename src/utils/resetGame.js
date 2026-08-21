import { supabase } from '../supabase';

// Reverse a completed game: delete stats, delete completed row, delete league
// result, kill any stale live session, and re-create the schedule entry so the
// game shows up as upcoming again.
export async function resetGame({ game, teamId }) {
  // 1. Player stats for this game
  const delStats = await supabase.from('player_game_stats').delete().eq('game_id', game.id);
  if (delStats.error) return { error: delStats.error };

  // 2. League result (if applicable) — matched by team/opponent/date since
  //    league_results has no game_id column.
  if (game.is_league && game.league_team_id) {
    const { data: leagueTeams } = await supabase.from('league_teams')
      .select('*').eq('team_id', teamId).eq('is_us', true);
    const usTeam = leagueTeams?.[0];
    if (usTeam) {
      await supabase.from('league_results').delete()
        .eq('team_id', teamId)
        .or(`and(home_league_team_id.eq.${usTeam.id},away_league_team_id.eq.${game.league_team_id}),and(home_league_team_id.eq.${game.league_team_id},away_league_team_id.eq.${usTeam.id})`)
        .eq('game_date', game.game_date);
    }
  }

  // 3. Completed game row
  const delGame = await supabase.from('completed_games').delete().eq('id', game.id);
  if (delGame.error) return { error: delGame.error };

  // 4. Stale live session for this game.
  //    Scoped to sessions that are NOT in progress. A completed game's own
  //    session was already flipped to 'completed' by completeSession() during
  //    handleEndMatch, so this still clears what it was meant to clear — but it
  //    can no longer destroy an in-progress session belonging to a DIFFERENT
  //    game. That matters in a tournament, where resetting Game 1 while Game 3
  //    is being tracked live used to wipe Game 3's session.
  await supabase.from('live_game_sessions')
    .delete()
    .eq('team_id', teamId)
    .neq('status', 'in_progress');

  // 5. Re-create the schedule entry so it appears as upcoming again.
  //    Tournament fields come along so a reset tournament game returns to its
  //    tournament card rather than escaping to the standalone timeline, and the
  //    game keeps its identity: opponent, date, time, court, game number.
  const base = {
    team_id: teamId,
    opponent: game.opponent,
    game_date: game.game_date,
    location: game.location || null,
    is_league: !!game.is_league,
    league_team_id: game.league_team_id || null,
  };
  const withTournament = {
    ...base,
    tournament_id: game.tournament_id || null,
    tournament_game_no: game.tournament_game_no ?? null,
  };

  // Widest payload first, then shed optional column groups one at a time. The
  // order matters: losing the schedule slot is a smaller loss than losing the
  // tournament link, so time/court go first.
  let insSched = await supabase.from('schedule').insert({
    ...withTournament,
    game_time: game.game_time || null,
    court: game.court || null,
  });
  if (insSched.error) {
    console.warn('[resetGame] Insert with time/court failed, retrying without:', insSched.error.message);
    insSched = await supabase.from('schedule').insert(withTournament);
  }
  if (insSched.error) {
    // Pre-migration database — still restore the game, just unlinked.
    console.warn('[resetGame] Insert with tournament fields failed, retrying without:', insSched.error.message);
    insSched = await supabase.from('schedule').insert(base);
  }
  if (insSched.error) return { error: insSched.error };

  return { error: null };
}
