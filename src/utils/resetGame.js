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

  // 4. Any stale in-progress live session for this team
  await supabase.from('live_game_sessions').delete().eq('team_id', teamId);

  // 5. Re-create the schedule entry so it appears as upcoming again
  const insSched = await supabase.from('schedule').insert({
    team_id: teamId,
    opponent: game.opponent,
    game_date: game.game_date,
    location: game.location || null,
    is_league: !!game.is_league,
    league_team_id: game.league_team_id || null,
  });
  if (insSched.error) return { error: insSched.error };

  return { error: null };
}
