import { useState } from 'react';
import { sortByJersey } from '../utils/sort';
import PlayerBadge from './PlayerBadge';
import AddPlayerModal from './modals/AddPlayerModal';

export default function RosterTab({ team, players, isAdmin, refresh, onSelectPlayer }) {
  const [showAdd, setShowAdd] = useState(false);
  const teamPlayers = sortByJersey(players.filter(p => p.team_id === team.id));

  return (
    <div>
      {isAdmin && (
        <button className="modal-btn-primary mb-16" onClick={() => setShowAdd(true)} style={{ width: '100%' }}>
          + Add Player
        </button>
      )}

      {teamPlayers.length === 0 ? (
        <div className="empty-state">No players on roster yet</div>
      ) : (
        teamPlayers.map(p => (
          <div
            key={p.id}
            className="game-row"
            onClick={() => onSelectPlayer(p)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <PlayerBadge player={p} team={team} size={40} />
              <div>
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {[p.jersey_number ? `#${p.jersey_number}` : null, p.position, p.height, p.grade].filter(Boolean).join(' · ')}
                </div>
              </div>
            </div>
          </div>
        ))
      )}

      {showAdd && (
        <AddPlayerModal
          teamId={team.id}
          playerCount={teamPlayers.length}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); refresh(); }}
        />
      )}
    </div>
  );
}
