import { useEffect, useState } from 'react';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { hpct, n3, hcol, hlbl, playerTotals } from '../utils/stats';
import { sortedCompleted } from '../utils/sort';
import PlayerBadge from '../components/PlayerBadge';
import ManualResultModal from '../components/modals/ManualResultModal';

export default function PlayerDetail({ player, team, onBack, onSelectGame, asModal = false }) {
  const { completedGames, playerGameStats, players, refresh } = useData();
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const [editGame, setEditGame] = useState(null);

  useEffect(() => { refresh(); }, [refresh]);

  const myStats = playerGameStats.filter(s => s.player_id === player.id);
  const totals = playerTotals(myStats);
  const sp = totals.sets_played;
  const h = hpct(totals.kills, totals.errors, totals.attempts);

  // Games this player appeared in
  const gameIds = new Set(myStats.map(s => s.game_id));
  const myGames = sortedCompleted(completedGames.filter(g => gameIds.has(g.id)));

  const body = (
    <div className="pgd-body">
      <div className="pgd-head">
        <PlayerBadge player={player} team={team} size={52} />
        <div className="pgd-head-text">
          <div className="pgd-name" style={{ fontSize: 18 }}>{player.name}</div>
          <div className="pgd-sub">
            {[player.jersey_number ? `#${player.jersey_number}` : null, player.position, player.height, player.grade].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        {/* Season totals */}
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12 }}>Season Totals</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, textAlign: 'center' }}>
            {[
              { label: 'SP',   value: sp },
              { label: 'K',    value: totals.kills },
              { label: 'E',    value: totals.errors, color: totals.errors > 0 ? '#ef4444' : undefined },
              { label: 'TA',   value: totals.attempts },
              { label: 'A',    value: totals.assists },
              { label: 'SA',   value: totals.aces },
              { label: 'SE',   value: totals.serve_errors, color: totals.serve_errors > 0 ? '#ef4444' : undefined },
              { label: 'Digs', value: totals.digs },
              { label: 'BS',   value: totals.blocks },
              { label: 'BA',   value: totals.block_assists },
            ].map((item, i) => (
              <div key={i}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{item.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: item.color || 'var(--text)' }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Hitting efficiency */}
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>K% — Hitting Efficiency</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: hcol(totals.kills, totals.errors, totals.attempts) }}>
            {n3(h)}
          </div>
          <div style={{ fontSize: 13, color: hcol(totals.kills, totals.errors, totals.attempts), fontWeight: 600 }}>
            {hlbl(totals.kills, totals.errors, totals.attempts)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
            {totals.kills}K - {totals.errors}E / {totals.attempts} TA
          </div>
        </div>

        {/* Game log */}
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>Game Log</h3>
        {myGames.length === 0 && <div className="empty-state">No games played yet</div>}
        {myGames.map(g => {
          const gs = myStats.find(s => s.game_id === g.id);
          return (
            <div key={g.id} className="game-row" onClick={() => onSelectGame(player, g)}>
              <div>
                <div style={{ fontWeight: 600 }}>vs {g.opponent}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {new Date(g.game_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {gs && (
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {gs.kills}K {gs.digs}D
                  </span>
                )}
                <span className={`game-result-badge ${g.result === 'W' ? 'win' : 'loss'}`}>
                  {g.result}
                </span>
                {isAdmin && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditGame(g); }}
                    style={{ background: 'rgba(128,128,128,0.1)', color: 'var(--text-secondary)', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer' }}
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {editGame && (
          <ManualResultModal
            game={editGame}
            team={team}
            players={players}
            existingStats={playerGameStats.filter(s => s.game_id === editGame.id)}
            onClose={() => setEditGame(null)}
            onSaved={() => { setEditGame(null); refresh(); }}
          />
        )}
      </div>
    </div>
  );

  if (asModal) return body;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{
        background: `linear-gradient(135deg, ${team.color || '#0d1f5c'}, ${team.color || '#1a3a8f'})`,
        color: '#fff', padding: '16px 20px',
      }}>
        <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
          Back
        </button>
      </div>
      <div style={{ padding: '16px 20px', maxWidth: 600, margin: '0 auto' }}>
        {body}
      </div>
    </div>
  );
}
