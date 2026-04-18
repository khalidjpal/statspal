import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { teamRecord } from '../utils/stats';
import { IconChart, IconRotate, IconArrowRight, IconSwap } from '../components/Icons';

function formatNextGame(game) {
  if (!game) return null;
  const date = new Date(game.game_date + 'T00:00:00')
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `vs ${game.opponent} · ${date}`;
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
  const { completedGames, schedule } = useData();

  const color = team?.color || '#58a6ff';

  const { w, l, nextGame } = useMemo(() => {
    if (!team) return { w: 0, l: 0, nextGame: null };
    const games = completedGames.filter(g => g.team_id === team.id);
    const { w, l } = teamRecord(games);
    const today = new Date().toISOString().slice(0, 10);
    const nextGame = (schedule || [])
      .filter(g => g.team_id === team.id && g.game_date >= today)
      .sort((a, b) => a.game_date.localeCompare(b.game_date))[0] || null;
    return { w, l, nextGame };
  }, [team, completedGames, schedule]);

  if (!team) return null;

  const meta = [team.gender, team.level, team.season].filter(Boolean).join(' · ');
  const teamStyle = { '--tc': color };

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

      <main className="vp-tl-main">
        <section className="vp-tl-hero" style={teamStyle}>
          <div className="vp-tl-hero-head">
            <h1 className="vp-tl-hero-name">{team.name}</h1>
            {canOpenTeamDetails && (
              <button className="vp-tl-details-btn" onClick={onOpenTeamDetails}>
                Team details <IconArrowRight size={12} />
              </button>
            )}
          </div>
          {meta && <div className="vp-tl-hero-meta">{meta}</div>}

          <div className="vp-tl-hero-stats">
            <div className="vp-tl-stat">
              <div className="vp-tl-stat-value">
                <span className="vp-tl-w" style={{ color }}>{w}</span>
                <span className="vp-tl-dash">–</span>
                <span className="vp-tl-l">{l}</span>
              </div>
              <div className="vp-tl-stat-label">Season</div>
            </div>

            <div className="vp-tl-stat">
              <div className="vp-tl-stat-value-text">
                {nextGame ? formatNextGame(nextGame) : 'No upcoming games'}
              </div>
              <div className="vp-tl-stat-label">Next</div>
            </div>
          </div>
        </section>

        <div className="vp-tl-actions" style={teamStyle}>
          <button className="vp-tl-action vp-tl-action-stats" onClick={onLaunchStatsPal}>
            <span className="vp-tl-action-icon"><IconChart size={22} /></span>
            <span className="vp-tl-action-body">
              <span className="vp-tl-action-title">StatsPal</span>
              <span className="vp-tl-action-sub">Track live games and stats</span>
            </span>
            <span className="vp-tl-action-arrow"><IconArrowRight size={16} /></span>
          </button>

          <button className="vp-tl-action vp-tl-action-rotation" onClick={onLaunchRotationPal}>
            <span className="vp-tl-action-icon"><IconRotate size={22} /></span>
            <span className="vp-tl-action-body">
              <span className="vp-tl-action-title">RotationPal</span>
              <span className="vp-tl-action-sub">Rotations and lineups</span>
            </span>
            <span className="vp-tl-action-arrow"><IconArrowRight size={16} /></span>
          </button>
        </div>
      </main>
    </div>
  );
}
