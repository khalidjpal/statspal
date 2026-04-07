import { useState } from 'react';
import { pColors, mkInit } from '../utils/colors';
import AddPlayerModal from './modals/AddPlayerModal';

export default function RosterTab({ team, players, isAdmin, refresh, onSelectPlayer }) {
  const [showAdd, setShowAdd] = useState(false);
  const teamPlayers = players.filter(p => p.team_id === team.id);

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
        teamPlayers.map((p, i) => {
          const colors = p.colors || pColors(p.player_index ?? i);
          return (
            <div
              key={p.id}
              className="game-row"
              onClick={() => onSelectPlayer(p)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  className="player-badge"
                  style={{ background: colors.bg, color: colors.text }}
                >
                  {p.initials || mkInit(p.name)}
                </span>
                <div>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>
                    {[p.jersey_number ? `#${p.jersey_number}` : null, p.position, p.height, p.grade].filter(Boolean).join(' · ')}
                  </div>
                </div>
              </div>
            </div>
          );
        })
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
