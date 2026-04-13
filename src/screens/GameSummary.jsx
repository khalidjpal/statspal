import { useEffect, useState } from 'react';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { hpct, n3, hcol, playerTotals } from '../utils/stats';
import { sortByJersey } from '../utils/sort';
import PlayerBadge from '../components/PlayerBadge';
import ManualResultModal from '../components/modals/ManualResultModal';
import { resetGame } from '../utils/resetGame';
import { useToast } from '../contexts/ToastContext';

export default function GameSummary({ game, team, onBack, onSelectPlayer, asModal = false }) {
  const { players, playerGameStats, refresh } = useData();
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const [editingGame, setEditingGame] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const { addToast } = useToast();

  async function confirmReset() {
    setResetting(true);
    const { error } = await resetGame({ game, teamId: team.id });
    setResetting(false);
    if (error) {
      addToast('Reset failed: ' + error.message);
      return;
    }
    setShowResetConfirm(false);
    addToast('Game reset. You can now start live tracking again.', 'success');
    await refresh();
    if (onBack) onBack();
  }

  useEffect(() => { refresh(); }, [refresh]);

  const teamPlayers = sortByJersey(players.filter(p => p.team_id === team.id));
  const gameStats = playerGameStats.filter(s => s.game_id === game.id);

  function getPlayerStats(playerId) {
    return gameStats.find(s => s.player_id === playerId) || {
      kills: 0, aces: 0, digs: 0, assists: 0, blocks: 0, errors: 0, attempts: 0, sets_played: 0, block_assists: 0, serve_errors: 0, blocking_errors: 0, digging_errors: 0, ball_handling_errors: 0, receives: 0,
    };
  }

  const totals = playerTotals(gameStats);

  const body = (
    <div className="pgd-body">
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#f0f6fc', marginBottom: 6 }}>vs {game.opponent}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className={`game-result-badge ${game.result === 'W' ? 'win' : 'loss'}`}>{game.result}</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#f0f6fc' }}>{game.home_sets}-{game.away_sets}</span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {new Date(game.game_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
        {game.set_scores && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, fontFamily: 'var(--mono)' }}>
            {game.set_scores.map((s, i) => `S${i + 1}: ${s.home}-${s.away}`).join('  ')}
          </div>
        )}
      </div>
      <div>
        {/* Team totals strip — always dark navy */}
        <div className="card" style={{ marginBottom: 16, background: '#0d1a35', border: 'none' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Team Totals</div>
          <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', flexWrap: 'wrap', gap: 4 }}>
            {[
              { label: 'K',    value: totals.kills },
              { label: 'E',    value: totals.errors },
              { label: 'TA',   value: totals.attempts },
              { label: 'K%',   value: n3(hpct(totals.kills, totals.errors, totals.attempts)), color: hcol(totals.kills, totals.errors, totals.attempts) },
              { label: 'A',    value: totals.assists },
              { label: 'BHE',  value: totals.ball_handling_errors || 0 },
              { label: 'SA',   value: totals.aces },
              { label: 'SE',   value: totals.serve_errors },
              { label: 'R',    value: totals.receives || 0 },
              { label: 'Digs', value: totals.digs },
              { label: 'DE',   value: totals.digging_errors || 0 },
              { label: 'BS',   value: totals.blocks },
              { label: 'BA',   value: totals.block_assists },
              { label: 'BE',   value: totals.blocking_errors || 0 },
            ].map((item, i) => (
              <div key={i} style={{ minWidth: 36 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>{item.label}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: item.color || '#ffffff' }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        {isAdmin && (
          <button
            onClick={() => setEditingGame(game)}
            className="modal-btn-primary"
            style={{ width: '100%', marginBottom: 10 }}
          >
            Edit Stats
          </button>
        )}
        {isAdmin && (
          <button
            onClick={() => setShowResetConfirm(true)}
            style={{ width: '100%', marginBottom: 16, background: 'transparent', color: '#f85149', padding: '11px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, border: '1px solid rgba(248,81,73,0.35)', cursor: 'pointer' }}
          >
            Reset Game
          </button>
        )}

        {/* Individual player stats */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, color: 'var(--text)' }}>
              <thead>
                <tr style={{ background: 'rgba(128,128,128,0.07)', textAlign: 'center' }}>
                  <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>Player</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>SP</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>K</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>E</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>TA</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>K%</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>A</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>BHE</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>SA</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>SE</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>R</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>Digs</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>DE</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>BS</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>BA</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>BE</th>
                </tr>
              </thead>
              <tbody>
                {teamPlayers.map(p => {
                  const s = getPlayerStats(p.id);
                  if (s.sets_played === 0 && s.kills === 0 && s.aces === 0 && s.digs === 0 && s.blocks === 0 && s.block_assists === 0) return null;
                  return (
                    <tr
                      key={p.id}
                      style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                      onClick={() => onSelectPlayer(p, game)}
                    >
                      <td style={{ padding: '8px', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                        <PlayerBadge player={p} team={team} size={28} />
                        <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--text)' }}>{p.name}</span>
                      </td>
                      <td style={{ textAlign: 'center', padding: '8px 4px' }}>{s.sets_played}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px' }}>{s.kills}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: s.errors > 0 ? '#dc2626' : 'var(--text)' }}>{s.errors}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px' }}>{s.attempts}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: hcol(s.kills, s.errors, s.attempts), fontWeight: 600 }}>
                        {n3(hpct(s.kills, s.errors, s.attempts))}
                      </td>
                      <td style={{ textAlign: 'center', padding: '8px 4px' }}>{s.assists}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: (s.ball_handling_errors||0) > 0 ? '#dc2626' : 'var(--text)' }}>{s.ball_handling_errors || 0}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px' }}>{s.aces}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: s.serve_errors > 0 ? '#dc2626' : 'var(--text)' }}>{s.serve_errors || 0}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px' }}>{s.receives || 0}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px' }}>{s.digs}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: (s.digging_errors||0) > 0 ? '#dc2626' : 'var(--text)' }}>{s.digging_errors || 0}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px' }}>{s.blocks}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px' }}>{s.block_assists || 0}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: (s.blocking_errors||0) > 0 ? '#dc2626' : 'var(--text)' }}>{s.blocking_errors || 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {showResetConfirm && (
        <div className="modal-overlay" onClick={() => !resetting && setShowResetConfirm(false)}>
          <div className="modal-content" style={{ textAlign: 'center', maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <h2>Reset this game?</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>
              All player stats for this game will be deleted and you will be able to redo live tracking. The game will remain on the schedule as upcoming. This cannot be undone.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={confirmReset}
                disabled={resetting}
                style={{ background: '#f85149', color: '#fff', padding: '12px 16px', borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none', cursor: resetting ? 'default' : 'pointer', opacity: resetting ? 0.6 : 1 }}
              >
                {resetting ? 'Resetting…' : 'Yes Reset Game'}
              </button>
              <button
                onClick={() => setShowResetConfirm(false)}
                disabled={resetting}
                style={{ background: 'transparent', color: 'var(--text-secondary)', padding: '12px 16px', borderRadius: 10, fontSize: 14, fontWeight: 600, border: '1px solid var(--border)', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {editingGame && (
        <ManualResultModal
          game={editingGame}
          team={team}
          players={players}
          existingStats={playerGameStats.filter(s => s.game_id === editingGame.id)}
          onClose={() => setEditingGame(null)}
          onSaved={() => { setEditingGame(null); refresh(); }}
        />
      )}
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
      <div className="page-wrap">
        {body}
      </div>
    </div>
  );
}
