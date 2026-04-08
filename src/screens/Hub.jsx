import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { teamRecord } from '../utils/stats';
import CreateTeamModal from '../components/modals/CreateTeamModal';
import ManageAccountsModal from '../components/modals/ManageAccountsModal';

export default function Hub({ onSelectTeam, onGodMode }) {
  const { currentUser, logout } = useAuth();
  const { teams, completedGames, refresh, loading } = useData();
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);

  useEffect(() => { refresh(); }, [refresh]);

  const isAdmin = currentUser?.role === 'admin';
  const coachTeamIds = currentUser?.teamIds || [];
  const visibleTeams = isAdmin ? teams : teams.filter(t => coachTeamIds.includes(t.id));

  function getRecord(teamId) {
    const games = completedGames.filter(g => g.team_id === teamId);
    const { w, l } = teamRecord(games);
    return { w, l, str: `${w}-${l}` };
  }

  return (
    <div className="hub-container">
      <header className="hub-header">
        <div className="hub-header-left">
          <h1>StatPal</h1>
        </div>
        <div className="hub-user-info">
          <span className="hub-user-name">{currentUser?.name}</span>
          <button className="hub-logout-btn" onClick={logout}>Logout</button>
        </div>
      </header>

      <div className="hub-body">
        {isAdmin && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
            <button onClick={() => setShowAccounts(true)} className="hub-admin-btn">Accounts</button>
            <button onClick={onGodMode} className="hub-admin-btn hub-admin-btn-god">God Mode</button>
          </div>
        )}

        <div className="hub-section-title">
          {isAdmin ? 'ALL TEAMS' : coachTeamIds.length > 1 ? 'YOUR TEAMS' : 'YOUR TEAM'}
        </div>

        {loading && visibleTeams.length === 0 ? (
          <div className="empty-state">Loading...</div>
        ) : (
          <>
            <div className="hub-circles">
              {visibleTeams.map(team => {
                const rec = getRecord(team.id);
                const color = team.color || '#58a6ff';
                return (
                  <div key={team.id} className="hub-circle-wrap" onClick={() => onSelectTeam(team)}>
                    <div className="hub-circle" style={{
                      background: `radial-gradient(circle at 30% 30%, ${color}40, ${color}15 60%, transparent 80%)`,
                      borderColor: `${color}50`,
                    }}>
                      <div className="hub-circle-record" style={{ color }}>{rec.str}</div>
                      <div className="hub-circle-name">{team.name}</div>
                      <div className="hub-circle-meta">{[team.gender, team.level].filter(Boolean).join(' · ')}</div>
                    </div>
                  </div>
                );
              })}

              {isAdmin && (
                <div className="hub-circle-wrap" onClick={() => setShowCreateTeam(true)}>
                  <div className="hub-circle hub-circle-add">
                    <div style={{ fontSize: 32, color: 'var(--text-muted)', fontWeight: 300 }}>+</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>New Team</div>
                  </div>
                </div>
              )}
            </div>

            {visibleTeams.length === 0 && !loading && (
              <div className="empty-state">
                {isAdmin ? 'No teams yet. Create your first team!' : 'No team assigned.'}
              </div>
            )}
          </>
        )}
      </div>

      {showCreateTeam && (
        <CreateTeamModal onClose={() => setShowCreateTeam(false)} onCreated={() => { setShowCreateTeam(false); refresh(); }} />
      )}
      {showAccounts && (
        <ManageAccountsModal teams={teams} onClose={() => setShowAccounts(false)} onSaved={() => refresh()} />
      )}
    </div>
  );
}
