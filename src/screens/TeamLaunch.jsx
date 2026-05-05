import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { teamRecord } from '../utils/stats';
import { sortByJersey } from '../utils/sort';
import { IconChart, IconRotate, IconArrowRight, IconSwap } from '../components/Icons';

function formatScheduleDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return {
    month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    day: d.getDate(),
    full: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  };
}

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
  const { completedGames, schedule, players, accounts, coachAssignments } = useData();

  const color = team?.color || '#58a6ff';

  const { w, l, roster, timeline, coaches } = useMemo(() => {
    if (!team) return { w: 0, l: 0, roster: [], timeline: [], coaches: [] };

    const games = completedGames.filter(g => g.team_id === team.id);
    const { w, l } = teamRecord(games);

    const roster = sortByJersey((players || []).filter(p => p.team_id === team.id));

    const today = new Date().toISOString().slice(0, 10);

    // Build chronological combined list with completed result + upcoming
    const past = (completedGames || [])
      .filter(g => g.team_id === team.id)
      .map(g => ({
        id: `c-${g.id}`,
        game_date: g.game_date,
        opponent: g.opponent,
        location: g.location,
        result: g.result,
        home_sets: g.home_sets,
        away_sets: g.away_sets,
        kind: 'completed',
      }));

    const upcoming = (schedule || [])
      .filter(g => g.team_id === team.id)
      .map(g => ({
        id: `s-${g.id}`,
        game_date: g.game_date,
        opponent: g.opponent,
        location: g.location,
        result: null,
        kind: g.game_date < today ? 'past-noresult' : (g.game_date === today ? 'today' : 'upcoming'),
      }));

    const timeline = [...past, ...upcoming].sort((a, b) =>
      String(a.game_date).localeCompare(String(b.game_date))
    );

    // Coaches assigned to this team (direct via accounts.team_id or via coach_team_assignments)
    const coachIds = new Set([
      ...(accounts || []).filter(a => a.role === 'coach' && a.team_id === team.id).map(a => a.id),
      ...(coachAssignments || []).filter(ca => ca.team_id === team.id).map(ca => ca.account_id),
    ]);
    const coaches = (accounts || []).filter(a => coachIds.has(a.id));

    return { w, l, roster, timeline, coaches };
  }, [team, completedGames, schedule, players, accounts, coachAssignments]);

  if (!team) return null;

  const sport = 'Volleyball';
  const meta = [team.gender, team.level].filter(Boolean).join(' · ');
  const teamStyle = { '--tc': color };

  // Coach display: prefer assigned coaches, fall back to current user if they're a coach.
  const displayCoaches = coaches.length > 0
    ? coaches
    : (currentUser?.role === 'coach' ? [currentUser] : []);

  return (
    <div className="vp-home vp-tl-page">
      <header className="vp-home-topbar">
        <div className="vp-home-brand">
          <span className="vp-home-brand-name">
            Volleyball<span className="vp-home-brand-accent">Pal</span>
          </span>
        </div>
        {canSwitchTeam && (
          <button className="vp-tl-topbar-btn" onClick={onSwitchTeam}>
            <IconSwap size={13} /> Switch team
          </button>
        )}
        <div className="vp-home-userbar">
          <span className="vp-home-username">{currentUser?.name || currentUser?.username}</span>
          <button className="vp-home-logout" onClick={logout}>Logout</button>
        </div>
      </header>

      <main className="cd-main" style={teamStyle}>
        {/* === BANNER === */}
        <section className="cd-banner" style={teamStyle}>
          <div className="cd-banner-glow" aria-hidden="true" />
          <div className="cd-banner-grid" aria-hidden="true" />
          {canOpenTeamDetails && (
            <button
              className="cd-banner-details-mini"
              onClick={onOpenTeamDetails}
              title="Team details"
              aria-label="Team details"
            >
              <span className="cd-banner-details-mini-text">Team details</span>
              <span className="cd-banner-details-mini-arrow"><IconArrowRight size={11} /></span>
            </button>
          )}
          <div className="cd-banner-inner">
            {/* LEFT: identity */}
            <div className="cd-banner-left">
              <div className="cd-banner-top">
                <span className="cd-banner-sport">{sport}</span>
                {team.season && <span className="cd-banner-season">{team.season}</span>}
              </div>

              <h1 className="cd-banner-name">{team.name}</h1>
              {meta && <div className="cd-banner-meta">{meta}</div>}

              <div className="cd-banner-stats">
                <div className="cd-banner-stat">
                  <div className="cd-banner-stat-value">
                    <span className="cd-banner-w" style={{ color }}>{w}</span>
                    <span className="cd-banner-dash">–</span>
                    <span className="cd-banner-l">{l}</span>
                  </div>
                  <div className="cd-banner-stat-label">Season Record</div>
                </div>

                {displayCoaches.length > 0 && (
                  <div className="cd-banner-stat cd-banner-coach">
                    <div className="cd-banner-coach-list">
                      {displayCoaches.map(c => (
                        <div key={c.id} className="cd-banner-coach-row">
                          <div
                            className="cd-banner-coach-avatar"
                            style={{ borderColor: color }}
                          >
                            {(c.name || c.username || '?').charAt(0).toUpperCase()}
                          </div>
                          <div className="cd-banner-coach-info">
                            <div className="cd-banner-coach-name">{c.name || c.username}</div>
                            <div className="cd-banner-coach-role">
                              {(c.role || 'coach').charAt(0).toUpperCase() + (c.role || 'coach').slice(1)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT: feature tiles inside the banner */}
            <div className="cd-banner-right">
              <button className="cd-tile cd-tile-stats" onClick={onLaunchStatsPal}>
                <span className="cd-tile-icon"><IconChart size={22} /></span>
                <span className="cd-tile-body">
                  <span className="cd-tile-title">StatsPal</span>
                  <span className="cd-tile-sub">Live games &amp; stats</span>
                </span>
                <span className="cd-tile-arrow"><IconArrowRight size={14} /></span>
              </button>

              <button className="cd-tile cd-tile-rotation" onClick={onLaunchRotationPal}>
                <span className="cd-tile-icon"><IconRotate size={22} /></span>
                <span className="cd-tile-body">
                  <span className="cd-tile-title">RotationPal</span>
                  <span className="cd-tile-sub">Rotations &amp; lineups</span>
                </span>
                <span className="cd-tile-arrow"><IconArrowRight size={14} /></span>
              </button>
            </div>
          </div>
        </section>

        {/* === PANELS === */}
        <section className="cd-panels">
          {/* ROSTER */}
          <div className="cd-panel">
            <header className="cd-panel-head">
              <span className="cd-panel-title">Roster</span>
              <span className="cd-panel-count">{roster.length}</span>
            </header>
            <div className="cd-panel-body cd-roster">
              {roster.length === 0 ? (
                <div className="cd-empty">No players on roster yet</div>
              ) : roster.map(p => (
                <div key={p.id} className="cd-roster-row">
                  <span
                    className="cd-roster-num"
                    style={{ color, borderColor: `${color}55` }}
                  >
                    {p.jersey_number ? `#${p.jersey_number}` : '—'}
                  </span>
                  <span className="cd-roster-name">{p.name}</span>
                  <span className="cd-roster-pos">{p.position || ''}</span>
                </div>
              ))}
            </div>
          </div>

          {/* SCHEDULE */}
          <div className="cd-panel">
            <header className="cd-panel-head">
              <span className="cd-panel-title">Schedule</span>
              <span className="cd-panel-count">{timeline.length}</span>
            </header>
            <div className="cd-panel-body cd-schedule">
              {timeline.length === 0 ? (
                <div className="cd-empty">No games scheduled</div>
              ) : timeline.map(g => {
                const { month, day, full } = formatScheduleDate(g.game_date);
                const hasResult = g.kind === 'completed' && g.result;
                const isUpcoming = g.kind === 'upcoming' || g.kind === 'today';
                return (
                  <div
                    key={g.id}
                    className={`cd-sched-row${isUpcoming ? ' cd-sched-up' : ''}${g.kind === 'today' ? ' cd-sched-today' : ''}`}
                  >
                    <div className="cd-sched-date">
                      <span className="cd-sched-month">{month}</span>
                      <span className="cd-sched-day">{day}</span>
                    </div>
                    <div className="cd-sched-mid">
                      <div className="cd-sched-opp">vs {g.opponent}</div>
                      <div className="cd-sched-loc">
                        {g.location || '—'}
                        <span className="cd-sched-fulldate"> · {full}</span>
                      </div>
                    </div>
                    <div className="cd-sched-right">
                      {hasResult ? (
                        <>
                          {g.home_sets != null && g.away_sets != null && (
                            <span className="cd-sched-score">{g.home_sets}–{g.away_sets}</span>
                          )}
                          <span className={`cd-sched-badge cd-sched-${g.result === 'W' ? 'w' : 'l'}`}>
                            {g.result}
                          </span>
                        </>
                      ) : g.kind === 'today' ? (
                        <span className="cd-sched-pill cd-sched-pill-today">TODAY</span>
                      ) : g.kind === 'upcoming' ? (
                        <span className="cd-sched-pill">UPCOMING</span>
                      ) : (
                        <span className="cd-sched-pill cd-sched-pill-muted">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
