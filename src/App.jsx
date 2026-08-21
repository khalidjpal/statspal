import { useState, useCallback, useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useData } from './contexts/DataContext';
import { useToast } from './contexts/ToastContext';
import { supabase } from './supabase';
import { completeSession } from './utils/liveSession';
import { cleanStatRow, hasStats } from './utils/stats';
import { insertPlayerStats } from './utils/statsSave';
import Login from './screens/Login';
import TeamPicker from './screens/TeamPicker';
import TeamLaunch from './screens/TeamLaunch';
import RotationPalScreen from './screens/RotationPal';
import Hub from './screens/Hub';
import TeamDashboard from './screens/TeamDashboard';
import PreGame from './screens/PreGame';
import LiveGame from './screens/LiveGame';
import GameSummary from './screens/GameSummary';
import PlayerDetail from './screens/PlayerDetail';
import PlayerGameDetail from './screens/PlayerGameDetail';
import TeamDetails from './screens/TeamDetails';
import Export from './screens/Export';
import GodMode from './screens/GodMode';
import PlayerHome from './screens/PlayerHome';
import PlayerGameDetailPlayer from './screens/PlayerGameDetailPlayer';

const SCREENS = {
  LOGIN: 'login',
  LANDING: 'landing',
  TEAM_PICKER: 'team_picker',
  TEAM_LAUNCH: 'team_launch',
  ROTATIONPAL: 'rotationpal',
  HUB: 'hub',
  TEAM_DASHBOARD: 'team_dashboard',
  PRE_GAME: 'pre_game',
  LIVE_GAME: 'live_game',
  GAME_SUMMARY: 'game_summary',
  PLAYER_DETAIL: 'player_detail',
  PLAYER_GAME_DETAIL: 'player_game_detail',
  TEAM_DETAILS: 'team_details',
  EXPORT: 'export',
  GOD_MODE: 'god_mode',
  PLAYER_HOME: 'player_home',
  PLAYER_GAME_DETAIL_PLAYER: 'player_game_detail_player',
};

const lastTeamKey = (userId) => `vp-last-team:${userId}`;

export default function App() {
  const { currentUser } = useAuth();
  const { teams, activeTeams, tournaments, refresh } = useData();
  const { addToast } = useToast();

  const [screen, setScreen] = useState(SCREENS.LOGIN);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [selectedGame, setSelectedGame] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [gameInfo, setGameInfo] = useState(null);
  const [scheduledGameForLive, setScheduledGameForLive] = useState(null);
  // Tournament the game being set up / tracked belongs to, if any.
  const [activeTournament, setActiveTournament] = useState(null);
  const [resumeSession, setResumeSession] = useState(null);
  const [autoRouted, setAutoRouted] = useState(false);
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);

  // Resolved RotationPal entry. StatsPal teams are always linked (roster
  // auto-read from the `players` table); standalone is only used for the
  // `sa-*` local-only lineup records, which still live outside this screen.
  const [activeEntry, setActiveEntry] = useState(null);

  const nav = useCallback((s) => setScreen(s), []);

  const findTournament = useCallback(
    (id) => (id ? (tournaments || []).find(t => t.id === id) || null : null),
    [tournaments]
  );

  const isAdmin = currentUser?.role === 'admin';
  const userTeamIds = currentUser?.teamIds || [];
  // Archived teams are invisible to normal navigation for every role, admin
  // included — God Mode is the only way back to one.
  const candidateTeams = isAdmin
    ? activeTeams
    : activeTeams.filter(t => userTeamIds.includes(t.id));

  function launchStatsPalForTeam(team) {
    setSelectedTeam(team);
    if (currentUser?.role === 'player') {
      nav(SCREENS.PLAYER_HOME);
    } else {
      nav(SCREENS.TEAM_DASHBOARD);
    }
  }

  function launchRotationPalForTeam(team) {
    // Selected team is sticky — RotationPal opens directly for the team the
    // coach is already on. No extra picker, no prompts.
    setSelectedTeam(team);
    setActiveEntry({ mode: 'linked', teamId: team.id });
    nav(SCREENS.ROTATIONPAL);
  }

  function launchTeamDetailsForTeam(team) {
    setSelectedTeam(team);
    nav(SCREENS.TEAM_DETAILS);
  }

  function handleSelectTeamFromPicker(team) {
    setSelectedTeam(team);
    if (currentUser?.id) {
      try {
        localStorage.setItem(lastTeamKey(currentUser.id), String(team.id));
      } catch { /* localStorage unavailable — remembered team just won't persist */ }
    }
    nav(SCREENS.TEAM_LAUNCH);
  }

  function handleSwitchTeam() {
    nav(SCREENS.TEAM_PICKER);
  }

  const effectiveScreen = !currentUser ? SCREENS.LOGIN : screen;

  // Load Supabase data once on login so auto-routing can see `teams`.
  const currentUserId = currentUser?.id;
  useEffect(() => {
    if (!currentUserId) return;
    let cancelled = false;
    refresh().finally(() => { if (!cancelled) setInitialDataLoaded(true); });
    return () => { cancelled = true; };
  }, [currentUserId, refresh]);

  // Reset flags on logout.
  if (!currentUser && autoRouted) setAutoRouted(false);
  if (!currentUser && initialDataLoaded) setInitialDataLoaded(false);

  // Post-login auto-route: once a user has picked a team, that choice sticks
  // across logins / sessions for ALL roles (admin included). Switching is
  // explicit via the "Switch team" button.
  if (currentUser && !autoRouted && initialDataLoaded && screen === SCREENS.LOGIN) {
    let rememberedTeam = null;
    try {
      const stored = localStorage.getItem(lastTeamKey(currentUser.id));
      if (stored) rememberedTeam = candidateTeams.find(t => String(t.id) === stored) || null;
    } catch { /* localStorage unavailable — fall through */ }

    if (candidateTeams.length === 0) {
      setScreen(SCREENS.TEAM_PICKER);
    } else if (rememberedTeam) {
      setSelectedTeam(rememberedTeam);
      setScreen(SCREENS.TEAM_LAUNCH);
    } else if (candidateTeams.length === 1) {
      setSelectedTeam(candidateTeams[0]);
      try { localStorage.setItem(lastTeamKey(currentUser.id), String(candidateTeams[0].id)); } catch { /* noop */ }
      setScreen(SCREENS.TEAM_LAUNCH);
    } else {
      setScreen(SCREENS.TEAM_PICKER);
    }
    setAutoRouted(true);
  }

  // A team archived from God Mode disappears from under whoever was standing on
  // it: drop the selection and the remembered team, and fall back to the picker
  // (which shows the empty state if this user has no other team). God Mode is
  // exempt — that is where the archiving just happened, and it keeps its own
  // separate team selection so an archived team can still be inspected there.
  const selectedTeamRow = selectedTeam ? teams.find(t => t.id === selectedTeam.id) : null;
  if (selectedTeam && selectedTeamRow?.archived && screen !== SCREENS.GOD_MODE) {
    setSelectedTeam(null);
    if (currentUser?.id) {
      try { localStorage.removeItem(lastTeamKey(currentUser.id)); } catch { /* localStorage unavailable — nothing to clear */ }
    }
    setScreen(SCREENS.TEAM_PICKER);
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
    setActiveTournament(null);
    nav(SCREENS.PRE_GAME);
  }

  // Start live tracking from a specific scheduled game. A tournament game
  // carries its tournament down to PreGame so the shared roster is used and the
  // coach isn't prompted for a lineup again.
  function handleStartLive(scheduledGame) {
    setScheduledGameForLive(scheduledGame);
    setActiveTournament(findTournament(scheduledGame?.tournament_id));
    nav(SCREENS.PRE_GAME);
  }

  function handleStartGame(info) {
    setResumeSession(null);
    setGameInfo(info);
    nav(SCREENS.LIVE_GAME);
  }

  async function handleResumeGame(session) {
    // Reconstruct gameInfo from saved session
    const lineup = session.lineup || [];

    // live_game_sessions has no tournament columns — recover the link from the
    // schedule row instead. It's still there mid-game (handleEndMatch only
    // deletes it once the match is saved), so this is always resolvable for a
    // tournament game.
    let tournamentId = null;
    let tournamentGameNo = null;
    let gameTime = null;
    let court = null;
    if (session.schedule_game_id) {
      const { data: row } = await supabase
        .from('schedule')
        .select('tournament_id, tournament_game_no, game_time, court')
        .eq('id', session.schedule_game_id)
        .maybeSingle();
      tournamentId = row?.tournament_id || null;
      tournamentGameNo = row?.tournament_game_no ?? null;
      gameTime = row?.game_time || null;
      court = row?.court || null;
    }

    setGameInfo({
      opponent: session.opponent,
      location: session.location || 'Home',
      gameDate: session.game_date,
      isLeague: session.is_league || false,
      leagueTeamId: session.league_team_id || null,
      bestOf: session.game_format || 3,
      roster: lineup,
      scheduledGameId: session.schedule_game_id || null,
      tournamentId,
      tournamentGameNo,
      gameTime,
      court,
    });
    setActiveTournament(findTournament(tournamentId));
    setResumeSession(session);
    nav(SCREENS.LIVE_GAME);
  }

  async function handleAbandonGame() {
    setGameInfo(null);
    setResumeSession(null);
    setScheduledGameForLive(null);
    setActiveTournament(null);
    nav(SCREENS.TEAM_DASHBOARD);
    addToast('Game abandoned. No stats were saved.', 'success');
    await refresh();
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
      // Keeps the game inside its tournament across the schedule →
      // completed_games hand-off. Null for a standalone game.
      tournament_id: gameInfo.tournamentId || null,
      tournament_game_no: gameInfo.tournamentGameNo ?? null,
      // Time and court ride along too, so a played game keeps the slot it was
      // scheduled in once the row moves tables.
      game_time: gameInfo.gameTime || null,
      court: gameInfo.court || null,
    };

    let res = await supabase.from('completed_games').insert(fullPayload).select().single();
    if (res.error) {
      console.warn('[handleEndMatch] Full game insert failed:', res.error.message);
      if (gameInfo.tournamentId) {
        console.warn('[handleEndMatch] Retrying without tournament columns — the game will be saved as standalone. Run scripts/tournaments_migration.sql.');
      }
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
        const statsRes = await insertPlayerStats(rows);
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
    setActiveTournament(null);
  }

  function handleTeamDetails(team) {
    setSelectedTeam(team);
    nav(SCREENS.TEAM_DETAILS);
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

    case SCREENS.TEAM_PICKER:
      return (
        <TeamPicker
          availableTeams={candidateTeams}
          onSelectTeam={handleSelectTeamFromPicker}
          onGodMode={isAdmin ? handleGodMode : null}
        />
      );

    case SCREENS.TEAM_LAUNCH:
      return (
        <TeamLaunch
          team={selectedTeam}
          canSwitchTeam={isAdmin || candidateTeams.length > 1}
          canOpenTeamDetails={isAdmin || currentUser?.role === 'coach'}
          onSwitchTeam={handleSwitchTeam}
          onLaunchStatsPal={() => launchStatsPalForTeam(selectedTeam)}
          onLaunchRotationPal={() => launchRotationPalForTeam(selectedTeam)}
          onOpenTeamDetails={() => launchTeamDetailsForTeam(selectedTeam)}
          onStartLive={handleStartLive}
          onSelectGame={handleSelectGame}
        />
      );

    case SCREENS.ROTATIONPAL:
      return (
        <RotationPalScreen
          entry={activeEntry}
          onHome={() => { setActiveEntry(null); nav(SCREENS.TEAM_LAUNCH); }}
        />
      );

    case SCREENS.HUB:
      return (
        <Hub
          onSelectTeam={handleSelectTeam}
          onGodMode={handleGodMode}
          onHome={() => nav(SCREENS.TEAM_PICKER)}
        />
      );

    case SCREENS.TEAM_DASHBOARD:
      return (
        <TeamDashboard
          team={selectedTeam}
          onBack={() => nav(SCREENS.TEAM_LAUNCH)}
          onSelectGame={handleSelectGame}
          onSelectPlayer={handleSelectPlayer}
          onPreGame={handlePreGame}
          onStartLive={handleStartLive}
          onResumeGame={handleResumeGame}
          onTeamDetails={() => handleTeamDetails(selectedTeam)}
        />
      );

    case SCREENS.PRE_GAME:
      return (
        <PreGame
          team={selectedTeam}
          scheduledGame={scheduledGameForLive}
          tournament={activeTournament}
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

    case SCREENS.TEAM_DETAILS:
      return (
        <TeamDetails
          team={selectedTeam}
          onBack={() => nav(SCREENS.TEAM_DASHBOARD)}
          onExport={handleExport}
        />
      );

    case SCREENS.EXPORT:
      return (
        <Export
          team={selectedTeam}
          onBack={() => nav(SCREENS.TEAM_DETAILS)}
        />
      );

    case SCREENS.GOD_MODE:
      return (
        <GodMode
          onBack={() => nav(SCREENS.TEAM_PICKER)}
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
