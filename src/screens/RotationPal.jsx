import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useVolleyballPal } from '../contexts/VolleyballPalContext';
import RotationPalApp from '../modules/rotationpal/RotationPalApp';
import '../modules/rotationpal/rotationpal.css';

export default function RotationPalScreen({ entry, onHome }) {
  const { currentUser, logout } = useAuth();
  const { teams, players, schedule } = useData();
  const { standaloneTeams, publishSession, clearSession } = useVolleyballPal();

  const isAdmin = currentUser?.role === 'admin';
  const teamIds = currentUser?.teamIds || [];
  const visibleTeams = isAdmin ? teams : teams.filter(t => teamIds.includes(t.id));

  // When entered in linked mode with a specific StatsPal team, narrow the
  // team list so the user lands on just that team. Standalone mode swaps the
  // team list out for the user's standalone lineups.
  const { effectiveTeams, effectivePlayers } = useMemo(() => {
    if (entry?.mode === 'linked' && entry.teamId) {
      const t = visibleTeams.find(x => x.id === entry.teamId);
      return {
        effectiveTeams: t ? [t] : visibleTeams,
        effectivePlayers: players,
      };
    }
    if (entry?.mode === 'standalone') {
      const list = entry.standaloneTeamId
        ? standaloneTeams.filter(t => t.id === entry.standaloneTeamId)
        : standaloneTeams;
      // Standalone teams have no StatsPal players — rosters are edited in the
      // RotationPal roster view directly.
      return { effectiveTeams: list, effectivePlayers: [] };
    }
    return { effectiveTeams: visibleTeams, effectivePlayers: players };
  }, [entry, visibleTeams, players, standaloneTeams]);

  const session = currentUser
    ? { username: currentUser.username || currentUser.name, role: currentUser.role }
    : null;

  return (
    <RotationPalApp
      session={session}
      statsPalTeams={effectiveTeams}
      statsPalPlayers={effectivePlayers}
      statsPalSchedule={entry?.mode === 'standalone' ? [] : schedule}
      entryMode={entry?.mode || 'linked'}
      onHome={onHome}
      onLogout={logout}
      onPublishSession={publishSession}
      onClearSession={clearSession}
    />
  );
}
