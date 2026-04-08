import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useTheme } from '../contexts/ThemeContext';
import { teamRecord } from '../utils/stats';
import CreateTeamModal from '../components/modals/CreateTeamModal';
import ManageAccountsModal from '../components/modals/ManageAccountsModal';

export default function Hub({ onSelectTeam, onGodMode }) {
  const { currentUser, logout } = useAuth();
  const { teams, completedGames, refresh, loading } = useData();
  const { dark, toggleTheme } = useTheme();
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);

  useEffect(() => { refresh(); }, [refresh]);

  const isAdmin = currentUser?.role === 'admin';

  // Coaches see only their assigned teams, admin sees all
  const coachTeamIds = currentUser?.teamIds || [];
  const visibleTeams = isAdmin
    ? teams
    : teams.filter(t => coachTeamIds.includes(t.id));

  function getRecord(teamId) {
    const games = completedGames.filter(g => g.team_id === teamId);
    const { w, l } = teamRecord(games);
    return `${w}-${l}`;
  }

  return (
    <div className="hub-container">
      <header className="hub-header">
        <div className="hub-header-left">
          <span className="hub-header-logo">🏐</span>
          <h1>StatPal</h1>
        </div>
        <div className="hub-user-info">
          <span className="hub-user-name">{currentUser?.name}</span>
          <button
            onClick={toggleTheme}
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer',
              width: 34, height: 34, borderRadius: '50%', fontSize: 17,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.2s', flexShrink: 0,
            }}
          >
            {dark ? '☀️' : '🌙'}
          </button>
          <button className="hub-logout-btn" onClick={logout}>Logout</button>
        </div>
      </header>

      <div className="hub-body">
        {/* Admin action buttons */}
        {isAdmin && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <button
              onClick={() => setShowAccounts(true)}
              style={{ flex: 1, padding: '12px 16px', background: '#1a3a8f', color: '#fff', borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}
            >
              Manage Accounts
            </button>
            <button
              onClick={onGodMode}
              style={{ padding: '12px 16px', background: '#7b1fa2', color: '#fff', borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}
            >
              God Mode
            </button>
          </div>
        )}

        <div className="hub-section-title">
          {isAdmin ? 'All Teams' : coachTeamIds.length > 1 ? 'Your Teams' : 'Your Team'}
        </div>

        {loading && visibleTeams.length === 0 ? (
          <div className="empty-state">Loading teams...</div>
        ) : (
          <>
            <div className="team-cards">
              {visibleTeams.map(team => (
                <div
                  key={team.id}
                  className="team-card"
                  style={{ borderLeftColor: team.color || '#1a3a8f' }}
                  onClick={() => onSelectTeam(team)}
                >
                  <div className="team-card-name">{team.name}</div>
                  <div className="team-card-meta">
                    {[team.gender, team.level, team.season].filter(Boolean).join(' · ')}
                  </div>
                  <div className="team-card-record" style={{ color: team.color || '#1a3a8f' }}>
                    {getRecord(team.id)}
                  </div>
                </div>
              ))}
            </div>

            {isAdmin && (
              <button
                className="create-team-btn"
                onClick={() => setShowCreateTeam(true)}
              >
                + Create New Team
              </button>
            )}

            {visibleTeams.length === 0 && !loading && (
              <div className="empty-state">
                {isAdmin ? 'No teams yet. Create your first team!' : 'No team assigned. Ask your admin to assign you to a team.'}
              </div>
            )}
          </>
        )}
      </div>

      {showCreateTeam && (
        <CreateTeamModal
          onClose={() => setShowCreateTeam(false)}
          onCreated={() => { setShowCreateTeam(false); refresh(); }}
        />
      )}

      {showAccounts && (
        <ManageAccountsModal
          teams={teams}
          onClose={() => setShowAccounts(false)}
          onSaved={() => refresh()}
        />
      )}
    </div>
  );
}
