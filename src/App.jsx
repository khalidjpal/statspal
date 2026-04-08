import { useState, useCallback } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useData } from './contexts/DataContext';
import { supabase } from './supabase';
import Login from './screens/Login';
import Hub from './screens/Hub';
import TeamDashboard from './screens/TeamDashboard';
import PreGame from './screens/PreGame';
import LiveGame from './screens/LiveGame';
import GameSummary from './screens/GameSummary';
import PlayerDetail from './screens/PlayerDetail';
import PlayerGameDetail from './screens/PlayerGameDetail';
import TeamAdmin from './screens/TeamAdmin';
import Export from './screens/Export';
import GodMode from './screens/GodMode';
import PlayerHome from './screens/PlayerHome';
import PlayerGameDetailPlayer from './screens/PlayerGameDetailPlayer';

const SCREENS = {
  LOGIN: 'login',
  HUB: 'hub',
  TEAM_DASHBOARD: 'team_dashboard',
  PRE_GAME: 'pre_game',
  LIVE_GAME: 'live_game',
  GAME_SUMMARY: 'game_summary',
  PLAYER_DETAIL: 'player_detail',
  PLAYER_GAME_DETAIL: 'player_game_detail',
  TEAM_ADMIN: 'team_admin',
  EXPORT: 'export',
  GOD_MODE: 'god_mode',
  PLAYER_HOME: 'player_home',
  PLAYER_GAME_DETAIL_PLAYER: 'player_game_detail_player',
};

export default function App() {
  const { currentUser } = useAuth();
  const { refresh } = useData();

  const [screen, setScreen] = useState(SCREENS.LOGIN);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [selectedGame, setSelectedGame] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [gameInfo, setGameInfo] = useState(null);
  const [scheduledGameForLive, setScheduledGameForLive] = useState(null);

  const nav = useCallback((s) => setScreen(s), []);

  const getHomeScreen = () => {
    if (!currentUser) return SCREENS.LOGIN;
    if (currentUser.role === 'player') return SCREENS.PLAYER_HOME;
    return SCREENS.HUB;
  };

  const effectiveScreen = !currentUser ? SCREENS.LOGIN : screen;

  if (currentUser && screen === SCREENS.LOGIN) {
    const home = getHomeScreen();
    if (screen !== home) setScreen(home);
  }

  // === HANDLERS ===

  function handleSelectTeam(team) {
    setSelectedTeam(team);
    nav(SCREENS.TEAM_DASHBOARD);
  }

  function handleSelectGame(game) {
    setSelectedGame(game);
    nav(SCREENS.GAME_SUMMARY);
  }

  function handleSelectPlayer(player) {
    setSelectedPlayer(player);
    nav(SCREENS.PLAYER_DETAIL);
  }

  function handleSelectPlayerGame(player, game) {
    setSelectedPlayer(player);
    setSelectedGame(game);
    nav(SCREENS.PLAYER_GAME_DETAIL);
  }

  function handleSelectPlayerGameFromPlayer(player, game) {
    setSelectedPlayer(player);
    setSelectedGame(game);
    nav(SCREENS.PLAYER_GAME_DETAIL_PLAYER);
  }

  // Start game from dashboard "Start Game" button (no scheduled game)
  function handlePreGame(team) {
    setSelectedTeam(team);
    setScheduledGameForLive(null);
    nav(SCREENS.PRE_GAME);
  }

  // Start live tracking from a specific scheduled game
  function handleStartLive(scheduledGame) {
    setScheduledGameForLive(scheduledGame);
    nav(SCREENS.PRE_GAME);
  }

  function handleStartGame(info) {
    setGameInfo(info);
    nav(SCREENS.LIVE_GAME);
  }

  // League sync helper
  async function syncLeagueStandings(teamId, gameData) {
    if (!gameData.isLeague || !gameData.leagueTeamId) return;

    // Find the "us" league team
    const { data: leagueTeams } = await supabase.from('league_teams')
      .select('*')
      .eq('team_id', teamId)
      .eq('is_us', true);
    const usTeam = leagueTeams?.[0];
    if (!usTeam) return;

    const isHome = (gameData.location || 'Home') === 'Home';
    await supabase.from('league_results').insert({
      team_id: teamId,
      home_league_team_id: isHome ? usTeam.id : gameData.leagueTeamId,
      away_league_team_id: isHome ? gameData.leagueTeamId : usTeam.id,
      home_sets: isHome ? gameData.homeSetsWon : gameData.awaySetsWon,
      away_sets: isHome ? gameData.awaySetsWon : gameData.homeSetsWon,
      game_date: gameData.gameDate,
    });
  }

  async function handleEndMatch(matchResult) {
    // Save completed game
    const { data: newGame, error } = await supabase.from('completed_games').insert({
      team_id: selectedTeam.id,
      opponent: gameInfo.opponent,
      game_date: gameInfo.gameDate,
      location: gameInfo.location,
      result: matchResult.result,
      home_sets: matchResult.homeSetsWon,
      away_sets: matchResult.awaySetsWon,
      set_scores: matchResult.sets,
      is_league: gameInfo.isLeague || false,
      league_team_id: gameInfo.leagueTeamId || null,
    }).select().single();

    if (!error && newGame) {
      // Save player stats
      if (matchResult.stats) {
        const rows = gameInfo.roster
          .map(p => ({
            game_id: newGame.id,
            player_id: p.id,
            ...(matchResult.stats[p.id] || { kills: 0, aces: 0, digs: 0, assists: 0, blocks: 0, errors: 0, attempts: 0, sets_played: 0 }),
          }))
          .filter(r => r.sets_played > 0 || r.kills > 0 || r.aces > 0 || r.digs > 0);

        if (rows.length > 0) {
          await supabase.from('player_game_stats').insert(rows);
        }
      }

      // Remove from schedule
      if (gameInfo.scheduledGameId) {
        await supabase.from('schedule').delete().eq('id', gameInfo.scheduledGameId);
      }

      // Auto-sync league standings
      await syncLeagueStandings(selectedTeam.id, {
        isLeague: gameInfo.isLeague,
        leagueTeamId: gameInfo.leagueTeamId,
        location: gameInfo.location,
        homeSetsWon: matchResult.homeSetsWon,
        awaySetsWon: matchResult.awaySetsWon,
        gameDate: gameInfo.gameDate,
      });

      await refresh();
      setSelectedGame(newGame);
      nav(SCREENS.GAME_SUMMARY);
    } else {
      nav(SCREENS.TEAM_DASHBOARD);
    }

    setGameInfo(null);
    setScheduledGameForLive(null);
  }

  function handleTeamAdmin(team) {
    setSelectedTeam(team);
    nav(SCREENS.TEAM_ADMIN);
  }

  function handleExport(team) {
    setSelectedTeam(team);
    nav(SCREENS.EXPORT);
  }

  function handleGodMode() {
    nav(SCREENS.GOD_MODE);
  }

  // === RENDER ===

  switch (effectiveScreen) {
    case SCREENS.LOGIN:
      return <Login />;

    case SCREENS.HUB:
      return <Hub onSelectTeam={handleSelectTeam} onGodMode={handleGodMode} />;

    case SCREENS.TEAM_DASHBOARD:
      return (
        <TeamDashboard
          team={selectedTeam}
          onBack={() => nav(SCREENS.HUB)}
          onSelectGame={handleSelectGame}
          onSelectPlayer={handleSelectPlayer}
          onPreGame={handlePreGame}
          onStartLive={handleStartLive}
          onTeamAdmin={() => handleTeamAdmin(selectedTeam)}
        />
      );

    case SCREENS.PRE_GAME:
      return (
        <PreGame
          team={selectedTeam}
          scheduledGame={scheduledGameForLive}
          onBack={() => nav(SCREENS.TEAM_DASHBOARD)}
          onStartGame={handleStartGame}
        />
      );

    case SCREENS.LIVE_GAME:
      return (
        <LiveGame
          team={selectedTeam}
          gameInfo={gameInfo}
          onEndMatch={handleEndMatch}
        />
      );

    case SCREENS.GAME_SUMMARY:
      return (
        <GameSummary
          game={selectedGame}
          team={selectedTeam}
          onBack={() => nav(SCREENS.TEAM_DASHBOARD)}
          onSelectPlayer={handleSelectPlayerGame}
        />
      );

    case SCREENS.PLAYER_DETAIL:
      return (
        <PlayerDetail
          player={selectedPlayer}
          team={selectedTeam}
          onBack={() => nav(SCREENS.TEAM_DASHBOARD)}
          onSelectGame={handleSelectPlayerGame}
        />
      );

    case SCREENS.PLAYER_GAME_DETAIL:
      return (
        <PlayerGameDetail
          player={selectedPlayer}
          game={selectedGame}
          team={selectedTeam}
          onBack={() => nav(SCREENS.GAME_SUMMARY)}
        />
      );

    case SCREENS.TEAM_ADMIN:
      return (
        <TeamAdmin
          team={selectedTeam}
          onBack={() => nav(SCREENS.TEAM_DASHBOARD)}
          onExport={handleExport}
        />
      );

    case SCREENS.EXPORT:
      return (
        <Export
          team={selectedTeam}
          onBack={() => nav(SCREENS.TEAM_ADMIN)}
        />
      );

    case SCREENS.GOD_MODE:
      return (
        <GodMode
          onBack={() => nav(SCREENS.HUB)}
        />
      );

    case SCREENS.PLAYER_HOME:
      return (
        <PlayerHome
          onSelectGame={handleSelectPlayerGameFromPlayer}
        />
      );

    case SCREENS.PLAYER_GAME_DETAIL_PLAYER:
      return (
        <PlayerGameDetailPlayer
          player={selectedPlayer}
          game={selectedGame}
          onBack={() => nav(SCREENS.PLAYER_HOME)}
        />
      );

    default:
      return <Login onGodMode={handleGodMode} />;
  }
}
