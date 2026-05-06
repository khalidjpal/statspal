import { useMemo, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { teamRecord } from '../utils/stats';
import { readEvents } from '../utils/teamEvents';
import { IconChart, IconRotate, IconArrowRight, IconSwap } from '../components/Icons';
import StandingsWidget from '../components/dashboard/StandingsWidget';
import ScheduleWidget from '../components/dashboard/ScheduleWidget';
import CalendarWidget from '../components/dashboard/CalendarWidget';
import RosterPositionWidget from '../components/dashboard/RosterPositionWidget';
import Fab from '../components/dashboard/Fab';

export default function TeamLaunch({
  team,
  canSwitchTeam,
  canOpenTeamDetails,
  onSwitchTeam,
  onLaunchStatsPal,
  onLaunchRotationPal,
  onOpenTeamDetails,
}) {
  const { currentUser, logout } = useAuth();
  const {
    completedGames, schedule, players,
    leagueTeams, leagueResults, refresh,
  } = useData();

  const color = team?.color || '#58a6ff';

  const [events, setEvents] = useState(() => readEvents(team?.id));
  const reloadEvents = useCallback(() => {
    setEvents(readEvents(team?.id));
  }, [team?.id]);

  const { w, l } = useMemo(() => {
    if (!team) return { w: 0, l: 0 };
    return teamRecord(completedGames.filter(g => g.team_id === team.id));
  }, [team, completedGames]);

  if (!team) return null;

  const teamStyle = { '--tc': color };

  return (
    <div className="vp-home dash-page">
      <header className="vp-home-topbar dash-topbar" style={teamStyle}>
        <div className="vp-home-brand dash-topbar-brand">
          <span className="vp-home-brand-name">
            Volleyball<span className="vp-home-brand-accent">Pal</span>
          </span>
        </div>

        <div className="dash-topbar-team">
          <button
            type="button"
            className="dash-topbar-team-name"
            onClick={canOpenTeamDetails ? onOpenTeamDetails : undefined}
            disabled={!canOpenTeamDetails}
            title={canOpenTeamDetails ? 'Open team details' : team.name}
          >
            {team.name}
          </button>
          <span className="dash-topbar-team-sep">—</span>
          <span className="dash-topbar-team-rec">
            <span className="dash-topbar-team-w" style={{ color }}>{w}</span>
            <span className="dash-topbar-team-dash">–</span>
            <span className="dash-topbar-team-l">{l}</span>
          </span>
        </div>

        {canSwitchTeam && (
          <button className="vp-tl-topbar-btn" onClick={onSwitchTeam}>
            <IconSwap size={13} /> Switch team
          </button>
        )}
        <Fab
          team={team}
          leagueTeams={leagueTeams}
          onRefresh={refresh}
          onEventsChanged={reloadEvents}
        />
        <div className="vp-home-userbar">
          <span className="vp-home-username">{currentUser?.name || currentUser?.username}</span>
          <button className="vp-home-logout" onClick={logout}>Logout</button>
        </div>
      </header>

      <main className="dash-main" style={teamStyle}>
        <section className="dash-modules">
          <button className="dash-module dash-module-rotation" onClick={onLaunchRotationPal}>
            <span className="dash-module-icon"><IconRotate size={24} /></span>
            <span className="dash-module-body">
              <span className="dash-module-title">RotationPal</span>
              <span className="dash-module-sub">Lineups &amp; rotations</span>
            </span>
            <span className="dash-module-arrow"><IconArrowRight size={14} /></span>
          </button>
          <button className="dash-module dash-module-stats" onClick={onLaunchStatsPal}>
            <span className="dash-module-icon"><IconChart size={24} /></span>
            <span className="dash-module-body">
              <span className="dash-module-title">StatsPal</span>
              <span className="dash-module-sub">Live games &amp; stats</span>
            </span>
            <span className="dash-module-arrow"><IconArrowRight size={14} /></span>
          </button>
        </section>

        <section className="dash-grid">
          <StandingsWidget
            team={team}
            leagueTeams={leagueTeams}
            leagueResults={leagueResults}
          />
          <ScheduleWidget
            team={team}
            schedule={schedule}
            completedGames={completedGames}
            onOpenInRotationPal={onLaunchRotationPal}
          />
          <CalendarWidget
            key={team.id}
            team={team}
            schedule={schedule}
            completedGames={completedGames}
            events={events}
            onEventsChanged={reloadEvents}
            onOpenStatsPal={onLaunchStatsPal}
            onOpenRotationPal={onLaunchRotationPal}
          />
          <RosterPositionWidget
            team={team}
            players={players}
          />
        </section>
      </main>
    </div>
  );
}
