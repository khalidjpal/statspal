import { useEffect, useMemo } from 'react';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { teamRecord } from '../utils/stats';
import { IconUsers, IconBolt } from '../components/Icons';
import ManageAccountsModal from '../components/modals/ManageAccountsModal';

function formatNextGame(game) {
  if (!game) return null;
  const date = new Date(game.game_date + 'T00:00:00')
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `vs ${game.opponent} · ${date}`;
}

function teamInitials(name) {
  if (!name) return '?';
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export default function TeamPicker({ availableTeams, onSelectTeam, onGodMode }) {
  const { currentUser, logout } = useAuth();
  const { completedGames, schedule, refresh, loading } = useData();
  const [showAccounts, setShowAccounts] = useState(false);

  useEffect(() => { refresh(); }, [refresh]);

  const isAdmin = currentUser?.role === 'admin';

  const gamesByTeam = useMemo(() => {
    const map = {};
    for (const g of completedGames) {
      if (!map[g.team_id]) map[g.team_id] = [];
      map[g.team_id].push(g);
    }
    return map;
  }, [completedGames]);

  const nextGameByTeam = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const map = {};
    const upcoming = (schedule || [])
      .filter(g => g.game_date >= today)
      .sort((a, b) => a.game_date.localeCompare(b.game_date));
    for (const g of upcoming) {
      if (!map[g.team_id]) map[g.team_id] = g;
    }
    return map;
  }, [schedule]);

  return (
    <div className="vp-home">
      <header className="vp-home-topbar">
        <div className="vp-home-brand">
          <span className="vp-home-brand-name">
            Volleyball<span className="vp-home-brand-accent">Pal</span>
          </span>
        </div>
        <div className="vp-home-userbar">
          <span className="vp-home-username">{currentUser?.name || currentUser?.username}</span>
          <button className="vp-home-logout" onClick={logout}>Logout</button>
        </div>
      </header>

      <main className="vp-tp-body">
        <div className="vp-tp-header">
          <h1 className="vp-tp-title">
            {isAdmin ? 'Select a team' : availableTeams.length > 1 ? 'Pick a team' : 'Your teams'}
          </h1>
          <p className="vp-tp-sub">
            {isAdmin
              ? 'Choose a team to launch StatsPal or RotationPal for.'
              : 'Choose which team you want to work with.'}
          </p>
        </div>

        {isAdmin && (
          <div className="hub-admin-bar">
            <button className="hub-admin-pill" onClick={() => setShowAccounts(true)}>
              <span className="hub-admin-pill-icon"><IconUsers size={14} /></span> Accounts
            </button>
            {onGodMode && (
              <button className="hub-admin-pill hub-admin-pill-god" onClick={onGodMode}>
                <span className="hub-admin-pill-icon"><IconBolt size={14} /></span> God Mode
              </button>
            )}
          </div>
        )}

        {loading && availableTeams.length === 0 ? (
          <div className="empty-state">Loading...</div>
        ) : availableTeams.length === 0 ? (
          <div className="vp-tp-empty">
            No teams yet.
            {isAdmin && ' Create one in StatsPal God Mode.'}
          </div>
        ) : (
          <div className="vp-tp-grid">
            {availableTeams.map(team => {
              const color = team.color || '#58a6ff';
              const games = gamesByTeam[team.id] || [];
              const { w, l } = teamRecord(games);
              const nextGame = nextGameByTeam[team.id];
              const meta = [team.gender, team.level].filter(Boolean).join(' · ');

              return (
                <button
                  key={team.id}
                  type="button"
                  className="vp-tp-card"
                  style={{ '--tc': color }}
                  onClick={() => onSelectTeam(team)}
                >
                  <div className="vp-tp-logo" style={{ background: color }}>
                    {teamInitials(team.name)}
                  </div>
                  <div className="vp-tp-body-info">
                    <div className="vp-tp-name">{team.name}</div>
                    {meta && <div className="vp-tp-meta">{meta}</div>}
                    {team.season && <div className="vp-tp-season">{team.season}</div>}
                  </div>
                  <div className="vp-tp-stats">
                    <div className="vp-tp-record">
                      <span className="vp-tp-rec-w" style={{ color }}>{w}</span>
                      <span className="vp-tp-rec-dash">–</span>
                      <span className="vp-tp-rec-l">{l}</span>
                    </div>
                    <div className="vp-tp-rec-label">Season</div>
                  </div>
                  <div className="vp-tp-next">
                    <div className="vp-tp-next-label">Next</div>
                    <div className="vp-tp-next-game">
                      {nextGame ? formatNextGame(nextGame) : 'No upcoming games'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>

      {showAccounts && (
        <ManageAccountsModal onClose={() => setShowAccounts(false)} />
      )}
    </div>
  );
}
