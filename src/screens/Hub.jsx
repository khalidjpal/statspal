import { useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useVolleyballPal } from '../contexts/VolleyballPalContext';
import { teamRecord } from '../utils/stats';
import { useState } from 'react';
import CreateTeamModal from '../components/modals/CreateTeamModal';
import ManageAccountsModal from '../components/modals/ManageAccountsModal';
import { IconHome, IconLink, IconUsers, IconBolt } from '../components/Icons';

function formatNextGame(game) {
  if (!game) return null;
  const date = new Date(game.game_date + 'T00:00:00')
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `vs ${game.opponent} · ${date}`;
}

function getStreak(games) {
  // games sorted most recent first
  if (!games.length) return null;
  const last = games[0].result;
  if (!last) return null;
  let count = 0;
  for (const g of games) {
    if (g.result === last) count++;
    else break;
  }
  return { type: last, count };
}

export default function Hub({ onSelectTeam, onGodMode, onHome }) {
  const { currentUser, logout } = useAuth();
  const { teams, completedGames, schedule, leagueTeams, refresh, loading } = useData();
  const { isLinked, activeSession } = useVolleyballPal();
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);

  useEffect(() => { refresh(); }, [refresh]);

  const isAdmin = currentUser?.role === 'admin';
  const coachTeamIds = currentUser?.teamIds || [];
  const visibleTeams = isAdmin ? teams : teams.filter(t => coachTeamIds.includes(t.id));

  // Pre-sort completed games most-recent-first per team
  const gamesByTeam = useMemo(() => {
    const map = {};
    for (const g of completedGames) {
      if (!map[g.team_id]) map[g.team_id] = [];
      map[g.team_id].push(g);
    }
    return map;
  }, [completedGames]);

  // Upcoming scheduled games per team (future dates, sorted soonest first)
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

  function getTeamInfo(team) {
    const games = gamesByTeam[team.id] || [];
    // completedGames is stored most-recent-first from DB
    const { w, l } = teamRecord(games);

    const leagueGames = games.filter(g => g.is_league);
    const { w: lw, l: ll } = teamRecord(leagueGames);

    const streak = getStreak(games);
    const nextGame = nextGameByTeam[team.id] || null;

    return { w, l, lw, ll, streak, nextGame };
  }

  return (
    <div className="hub-container">
      <header className="hub-header">
        <div className="hub-header-left">
          {onHome && (
            <button className="hub-home-btn" onClick={onHome} title="VolleyballPal home" aria-label="Home">
              <IconHome size={18} />
            </button>
          )}
          <h1 className="hub-logo">StatsPal</h1>
        </div>
        <div className="hub-user-info">
          <span className="hub-user-name">{currentUser?.name}</span>
          <button className="hub-logout-btn" onClick={logout}>Logout</button>
        </div>
      </header>

      <div className="hub-body">
        {/* Admin controls */}
        {isAdmin && (
          <div className="hub-admin-bar">
            <button className="hub-admin-pill" onClick={() => setShowAccounts(true)}>
              <span className="hub-admin-pill-icon"><IconUsers size={14} /></span> Accounts
            </button>
            <button className="hub-admin-pill hub-admin-pill-god" onClick={onGodMode}>
              <span className="hub-admin-pill-icon"><IconBolt size={14} /></span> God Mode
            </button>
          </div>
        )}

        <div className="hub-section-title">
          {isAdmin ? 'ALL TEAMS' : coachTeamIds.length > 1 ? 'YOUR TEAMS' : 'YOUR TEAM'}
        </div>

        {loading && visibleTeams.length === 0 ? (
          <div className="empty-state">Loading...</div>
        ) : (
          <div className="hub-banners">
            {visibleTeams.map(team => {
              const color = team.color || '#58a6ff';
              const { w, l, lw, ll, streak, nextGame } = getTeamInfo(team);
              const meta = [team.gender, team.level].filter(Boolean).join(' · ');

              return (
                <div
                  key={team.id}
                  className="hub-banner"
                  style={{ '--tc': color, '--tc-10': color + '1A', '--tc-20': color + '33' }}
                  onClick={() => onSelectTeam(team)}
                >
                  {/* Left color accent bar */}
                  <div className="hub-banner-bar" style={{ background: color }} />

                  {/* Team identity */}
                  <div className="hub-banner-identity">
                    <div className="hub-banner-name">
                      {team.name}
                      {isLinked(team.id) && (
                        <span
                          className="vp-sync-badge"
                          style={{ marginLeft: 10 }}
                          title="Linked with RotationPal"
                        >
                          {activeSession?.teamId === team.id && (
                            <span className="vp-sync-badge-dot" />
                          )}
                          <IconLink size={12} />
                          Linked
                        </span>
                      )}
                    </div>
                    {meta && <div className="hub-banner-meta">{meta}</div>}
                    {team.season && <div className="hub-banner-season">{team.season}</div>}
                  </div>

                  {/* Stats block */}
                  <div className="hub-banner-stats">
                    {/* Season record */}
                    <div className="hub-banner-record">
                      <span className="hub-banner-rec-num" style={{ color }}>{w}</span>
                      <span className="hub-banner-rec-dash">–</span>
                      <span className="hub-banner-rec-num hub-banner-rec-l">{l}</span>
                    </div>
                    <div className="hub-banner-rec-label">Season</div>

                    {/* League record — only if they have league games */}
                    {(lw > 0 || ll > 0) && (
                      <div className="hub-banner-league">{lw}–{ll} <span>League</span></div>
                    )}

                    {/* Streak */}
                    {streak && (
                      <div className={`hub-banner-streak ${streak.type === 'W' ? 'hub-streak-w' : 'hub-streak-l'}`}>
                        {streak.count}{streak.type}
                      </div>
                    )}
                  </div>

                  {/* Right side: next game + chevron */}
                  <div className="hub-banner-right">
                    {nextGame && (
                      <div className="hub-banner-next">
                        <div className="hub-banner-next-label">Next</div>
                        <div className="hub-banner-next-game">{formatNextGame(nextGame)}</div>
                      </div>
                    )}
                    <div className="hub-banner-chevron" style={{ color }}>›</div>
                  </div>
                </div>
              );
            })}

            {/* New Team card */}
            {isAdmin && (
              <div className="hub-banner hub-banner-add" onClick={() => setShowCreateTeam(true)}>
                <div className="hub-banner-add-icon">+</div>
                <div className="hub-banner-add-text">Create New Team</div>
              </div>
            )}

            {visibleTeams.length === 0 && !loading && (
              <div className="empty-state">
                {isAdmin ? 'No teams yet. Create your first team!' : 'No team assigned.'}
              </div>
            )}
          </div>
        )}
      </div>

      {showCreateTeam && (
        <CreateTeamModal
          onClose={() => setShowCreateTeam(false)}
          onCreated={() => { setShowCreateTeam(false); refresh(); }}
        />
      )}
      {showAccounts && (
        <ManageAccountsModal teams={teams} onClose={() => setShowAccounts(false)} onSaved={() => refresh()} />
      )}
    </div>
  );
}
