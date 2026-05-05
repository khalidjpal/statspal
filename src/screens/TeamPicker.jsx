import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { teamRecord } from '../utils/stats';
import { IconUsers, IconBolt, IconArrowRight, IconArrowLeft } from '../components/Icons';
import ManageAccountsModal from '../components/modals/ManageAccountsModal';

function teamInitials(name) {
  if (!name) return '?';
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export default function TeamPicker({
  availableTeams,
  onSelectTeam,
  onGodMode,
  title,
  subtitle,
  onBack,
  showAdminBar = true,
}) {
  const { currentUser, logout } = useAuth();
  const { completedGames, refresh, loading } = useData();
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

  const sport = 'Volleyball';

  const headerTitle = title
    || (isAdmin ? 'Select a team' : availableTeams.length > 1 ? 'Pick your team' : 'Your teams');
  const headerSub = subtitle
    || (isAdmin
      ? 'Choose a team to launch StatsPal or RotationPal for.'
      : 'Choose which team you want to work with.');

  return (
    <div className="vp-home tp2-page">
      <header className="vp-home-topbar">
        <div className="vp-home-brand">
          <span className="vp-home-brand-name">
            Volleyball<span className="vp-home-brand-accent">Pal</span>
          </span>
        </div>
        {onBack && (
          <button className="tp2-back" onClick={onBack}>
            <IconArrowLeft size={13} /> Back
          </button>
        )}
        <div className="vp-home-userbar">
          <span className="vp-home-username">{currentUser?.name || currentUser?.username}</span>
          <button className="vp-home-logout" onClick={logout}>Logout</button>
        </div>
      </header>

      <main className="tp2-body">
        <div className="tp2-header">
          <h1 className="tp2-title">{headerTitle}</h1>
          <p className="tp2-sub">{headerSub}</p>
        </div>

        {isAdmin && showAdminBar && (
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
          <div className="tp2-empty">Loading…</div>
        ) : availableTeams.length === 0 ? (
          <div className="tp2-empty">
            No teams yet.
            {isAdmin && ' Create one in StatsPal God Mode.'}
          </div>
        ) : (
          <div className="tp2-grid">
            {availableTeams.map(team => {
              const color = team.color || '#58a6ff';
              const games = gamesByTeam[team.id] || [];
              const { w, l } = teamRecord(games);
              const meta = [team.gender, team.level].filter(Boolean).join(' · ');

              return (
                <button
                  key={team.id}
                  type="button"
                  className="tp2-card"
                  style={{ '--tc': color }}
                  onClick={() => onSelectTeam(team)}
                >
                  <div className="tp2-card-glow" aria-hidden="true" />
                  <div className="tp2-card-grid" aria-hidden="true" />

                  <div className="tp2-card-inner">
                    <div className="tp2-card-top">
                      <span className="tp2-sport">{sport}</span>
                      {team.season && <span className="tp2-season">{team.season}</span>}
                    </div>

                    <div className="tp2-card-mid">
                      <div className="tp2-logo" style={{ background: color }}>
                        {teamInitials(team.name)}
                      </div>
                      <div className="tp2-name-block">
                        <div className="tp2-name">{team.name}</div>
                        {meta && <div className="tp2-meta">{meta}</div>}
                      </div>
                    </div>

                    <div className="tp2-card-bottom">
                      <div className="tp2-record">
                        <span className="tp2-rec-w" style={{ color }}>{w}</span>
                        <span className="tp2-rec-dash">–</span>
                        <span className="tp2-rec-l">{l}</span>
                        <span className="tp2-rec-label">Season</span>
                      </div>
                      <span className="tp2-cta">
                        Open <IconArrowRight size={14} />
                      </span>
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
