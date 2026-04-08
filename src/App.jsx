import { useState, useCallback } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useData } from './contexts/DataContext';
import { useToast } from './contexts/ToastContext';
import { supabase } from './supabase';
import { completeSession } from './utils/liveSession';
import { cleanStatRow, hasStats } from './utils/stats';
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
  const { teams, refresh } = useData();
  const { addToast } = useToast();

  const [screen, setScreen] = useState(SCREENS.LOGIN);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [selectedGame, setSelectedGame] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [gameInfo, setGameInfo] = useState(null);
  const [scheduledGameForLive, setScheduledGameForLive] = useState(null);
  const [resumeSession, setResumeSession] = useState(null);
  const [autoRouted, setAutoRouted] = useState(false);

  const nav = useCallback((s) => setScreen(s), []);

  const getHomeScreen = () => {
    if (!currentUser) return SCREENS.LOGIN;
    if (currentUser.role === 'player') return SCREENS.PLAYER_HOME;
    return SCREENS.HUB;
  };

  const effectiveScreen = !currentUser ? SCREENS.LOGIN : screen;

  // Auto-route on login: players and single-team coaches go straight to team dashboard
  if (currentUser && screen === SCREENS.LOGIN) {
    const home = getHomeScreen();
    if (screen !== home) setScreen(home);
  }

  // After data loads, auto-route single-team users directly to dashboard
  if (currentUser && !autoRouted && teams.length > 0) {
    const role = currentUser.role;
    const tids = currentUser.teamIds || [];
    if (role === 'coach' && tids.length === 1) {
      const t = teams.find(tm => tm.id === tids[0]);
      if (t) {
        setSelectedTeam(t);
        setScreen(SCREENS.TEAM_DASHBOARD);
        setAutoRouted(true);
      }
    } else if (role === 'player' && tids.length === 1) {
      const t = teams.find(tm => tm.id === tids[0]);
      if (t) {
        setSelectedTeam(t);
        setScreen(SCREENS.TEAM_DASHBOARD);
        setAutoRouted(true);
      }
    } else {
      setAutoRouted(true);
    }
  }

  // Reset auto-route flag on logout
  if (!currentUser && autoRouted) {
    setAutoRouted(false);
  }

  // Route guard: players cannot access live tracking screens
  if (currentUser?.role === 'player' && (screen === SCREENS.PRE_GAME || screen === SCREENS.LIVE_GAME)) {
    setScreen(SCREENS.TEAM_DASHBOARD);
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
    setResumeSession(null);
    setGameInfo(info);
    nav(SCREENS.LIVE_GAME);
  }

  function handleResumeGame(session) {
    // Reconstruct gameInfo from saved session
    const lineup = session.lineup || [];
    setGameInfo({
      opponent: session.opponent,
      location: session.location || 'Home',
      gameDate: session.game_date,
      isLeague: session.is_league || false,
      leagueTeamId: session.league_team_id || null,
      bestOf: session.game_format || 3,
      roster: lineup,
      scheduledGameId: session.schedule_game_id || null,
    });
    setResumeSession(session);
    nav(SCREENS.LIVE_GAME);
  }

  function handleAbandonGame() {
    setGameInfo(null);
    setResumeSession(null);
    setScheduledGameForLive(null);
    nav(SCREENS.TEAM_DASHBOARD);
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
    console.log('[handleEndMatch] START', { result: matchResult.result, playerCount: gameInfo.roster.length });

    // Step 0: Mark live session as completed
    await completeSession(selectedTeam.id);

    // Step 1: Save completed game — try full payload, fallback without optional columns
    let newGame = null;
    const fullPayload = {
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
    };

    let res = await supabase.from('completed_games').insert(fullPayload).select().single();
    if (res.error) {
      console.warn('[handleEndMatch] Full game insert failed:', res.error.message);
      // Fallback without optional columns
      res = await supabase.from('completed_games').insert({
        team_id: selectedTeam.id,
        opponent: gameInfo.opponent,
        game_date: gameInfo.gameDate,
        location: gameInfo.location,
        result: matchResult.result,
        home_sets: matchResult.homeSetsWon,
        away_sets: matchResult.awaySetsWon,
      }).select().single();
    }

    if (res.error) {
      addToast('Failed to save game: ' + res.error.message);
      console.error('[handleEndMatch] Game insert FAILED:', res.error.message);
    } else {
      newGame = res.data;
      console.log('[handleEndMatch] Game saved:', newGame.id);
    }

    // Step 2: Save player stats
    if (newGame && matchResult.stats) {
      const rows = gameInfo.roster
        .map(p => {
          const raw = matchResult.stats[p.id];
          if (!raw) return null;
          return { game_id: newGame.id, player_id: p.id, ...cleanStatRow(raw) };
        })
        .filter(Boolean)
        .filter(r => hasStats(r));

      console.log('[handleEndMatch] Saving', rows.length, 'player stat rows');

      if (rows.length > 0) {
        let statsRes = await supabase.from('player_game_stats').insert(rows);
        if (statsRes.error) {
          console.warn('[handleEndMatch] Stats insert failed:', statsRes.error.message, '— trying without block_assists/serve_errors');
          const fallbackRows = rows.map(({ block_assists, serve_errors, ...rest }) => rest);
          statsRes = await supabase.from('player_game_stats').insert(fallbackRows);
        }
        if (statsRes.error) {
          addToast('Failed to save player stats: ' + statsRes.error.message);
          console.error('[handleEndMatch] Stats insert FAILED:', statsRes.error.message);
        } else {
          console.log('[handleEndMatch] Player stats saved OK:', rows.length, 'rows');
          addToast('Game saved with ' + rows.length + ' player stats', 'success');
        }
      }
    } else if (!newGame) {
      addToast('Game could not be saved — check console for details');
    }

    // Step 3: Remove from schedule
    if (gameInfo.scheduledGameId) {
      await supabase.from('schedule').delete().eq('id', gameInfo.scheduledGameId);
    }

    // Step 4: Sync league standings
    await syncLeagueStandings(selectedTeam.id, {
      isLeague: gameInfo.isLeague,
      leagueTeamId: gameInfo.leagueTeamId,
      location: gameInfo.location,
      homeSetsWon: matchResult.homeSetsWon,
      awaySetsWon: matchResult.awaySetsWon,
      gameDate: gameInfo.gameDate,
    });

    // Step 5: Refresh ALL data from Supabase
    await refresh();
    console.log('[handleEndMatch] DONE — refresh complete');

    // Step 6: Navigate
    if (newGame) {
      setSelectedGame(newGame);
      nav(SCREENS.GAME_SUMMARY);
    } else {
      nav(SCREENS.TEAM_DASHBOARD);
    }

    setGameInfo(null);
    setScheduledGameForLive(null);
    setResumeSession(null);
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
          onResumeGame={handleResumeGame}
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
          onResumeGame={handleResumeGame}
        />
      );

    case SCREENS.LIVE_GAME:
      return (
        <LiveGame
          team={selectedTeam}
          gameInfo={gameInfo}
          onEndMatch={handleEndMatch}
          onAbandon={handleAbandonGame}
          resumeSession={resumeSession}
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
