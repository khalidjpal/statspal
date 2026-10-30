import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useVolleyballPal } from '../contexts/VolleyballPalContext';
import RotationPalApp from '../modules/rotationpal/RotationPalApp';
import '../modules/rotationpal/rotationpal.css';

// RotationPal runs on the app-wide current team: `team` and `teams` come from
// App (the same selection StatsPal and PracticePal use), and `onSelectTeam`
// writes a pick or a switch back there, where it is remembered.
export default function RotationPalScreen({ entry, team, teams, onSelectTeam, onHome, onOpenStatsPal }) {
  const { currentUser, logout } = useAuth();
  const { players, schedule, completedGames, tournaments } = useData();
  const { standaloneTeams, publishSession, clearSession } = useVolleyballPal();

  const standalone = entry?.mode === 'standalone';

  // Standalone mode swaps the team list for the user's standalone lineups,
  // which have no StatsPal players (rosters are edited in RotationPal).
  const effectiveTeams = standalone
    ? (entry.standaloneTeamId ? standaloneTeams.filter(t => t.id === entry.standaloneTeamId) : standaloneTeams)
    : teams;

  const session = currentUser
    ? { username: currentUser.username || currentUser.name, name: currentUser.name || currentUser.username, role: currentUser.role }
    : null;

  return (
    <RotationPalApp
      session={session}
      statsPalTeams={effectiveTeams}
      statsPalPlayers={standalone ? [] : players}
      statsPalSchedule={standalone ? [] : schedule}
      statsPalCompletedGames={standalone ? [] : completedGames}
      statsPalTournaments={standalone ? [] : tournaments}
      entryMode={entry?.mode || 'linked'}
      currentTeamId={standalone ? null : team?.id ?? null}
      onSelectTeam={onSelectTeam}
      onHome={onHome}
      onOpenStatsPal={standalone ? undefined : onOpenStatsPal}
      onLogout={logout}
      onPublishSession={publishSession}
      onClearSession={clearSession}
    />
  );
}
