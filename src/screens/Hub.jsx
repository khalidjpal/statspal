import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { teamRecord } from '../utils/stats';
import CreateTeamModal from '../components/modals/CreateTeamModal';

export default function Hub({ onSelectTeam }) {
  const { currentUser, logout } = useAuth();
  const { teams, completedGames, refresh, loading } = useData();
  const [showCreateTeam, setShowCreateTeam] = useState(false);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
          <h1>StatsPal</h1>
        </div>
        <div className="hub-user-info">
          <span className="hub-user-name">{currentUser?.name}</span>
          <button className="hub-logout-btn" onClick={logout}>Logout</button>
        </div>
      </header>

      <div className="hub-body">
        <div className="hub-section-title">Your Teams</div>

        {loading && teams.length === 0 ? (
          <div className="empty-state">Loading teams...</div>
        ) : (
          <>
            <div className="team-cards">
              {teams.map(team => (
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
                  <div className="team-card-record">
                    Record: {getRecord(team.id)}
                  </div>
                </div>
              ))}
            </div>

            {currentUser?.role === 'admin' && (
              <button
                className="create-team-btn"
                onClick={() => setShowCreateTeam(true)}
              >
                + Create New Team
              </button>
            )}

            {teams.length === 0 && !loading && (
              <div className="empty-state">
                No teams yet. {currentUser?.role === 'admin' ? 'Create your first team above!' : 'Ask your admin to create a team.'}
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
    </div>
  );
}
