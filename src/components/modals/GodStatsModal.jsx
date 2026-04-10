import { useState } from 'react';
import { supabase } from '../../supabase';
import { validateStats, cleanStatRow, hasStats } from '../../utils/stats';
import { sortByJersey } from '../../utils/sort';
import { useToast } from '../../contexts/ToastContext';

const STAT_FIELDS = ['sets_played', 'kills', 'errors', 'attempts', 'assists', 'aces', 'serve_errors', 'digs', 'blocks', 'block_assists'];
const STAT_LABELS = { sets_played: 'SP', kills: 'K', errors: 'E', attempts: 'TA', assists: 'A', aces: 'SA', serve_errors: 'SE', digs: 'Digs', blocks: 'BS', block_assists: 'BA' };

export default function GodStatsModal({ game, players, existingStats, onClose, onSaved }) {
  const { addToast } = useToast();
  const gamePlayers = sortByJersey(players.filter(p => p.team_id === game.team_id));
  const [stats, setStats] = useState(() => {
    const init = {};
    gamePlayers.forEach(p => {
      const existing = existingStats.find(s => s.player_id === p.id);
      init[p.id] = existing
        ? { ...existing }
        : { kills: 0, aces: 0, digs: 0, assists: 0, blocks: 0, errors: 0, attempts: 0, sets_played: 0, block_assists: 0, serve_errors: 0 };
    });
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState('');

  function updateStat(playerId, field, value) {
    setStats(prev => ({
      ...prev,
      [playerId]: { ...prev[playerId], [field]: Math.max(0, parseInt(value) || 0) },
    }));
  }

  async function handleSave() {
    setValidationError('');
    for (const p of gamePlayers) {
      const s = stats[p.id];
      if (!s) continue;
      const err = validateStats(s.kills, s.errors, s.attempts);
      if (err) { setValidationError(`${p.name}: ${err}`); return; }
    }
    setSaving(true);
    // Delete existing stats for this game
    const delRes = await supabase.from('player_game_stats').delete().eq('game_id', game.id);
    if (delRes.error) { addToast('Failed to clear old stats: ' + delRes.error.message); }

    // Insert new stats — cleanStatRow strips DB-only fields (id, created_at, etc.)
    const rows = gamePlayers.map(p => ({
      game_id: game.id,
      player_id: p.id,
      ...cleanStatRow(stats[p.id] || {}),
    })).filter(r => hasStats(r));

    if (rows.length > 0) {
      const insRes = await supabase.from('player_game_stats').insert(rows);
      if (insRes.error) {
        addToast('Failed to save stats: ' + insRes.error.message);
      } else {
        addToast('Stats saved', 'success');
      }
    }
    setSaving(false);
    onSaved();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 700, maxHeight: '90vh', overflow: 'auto' }}>
        <h2>Edit Stats — vs {game.opponent}</h2>
        {validationError && (
          <div style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '10px 12px', borderRadius: 8, fontSize: 13, marginBottom: 12, fontWeight: 500 }}>
            {validationError}
          </div>
        )}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'rgba(128,128,128,0.06)' }}>
                <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 11, color: 'var(--text-secondary)' }}>Player</th>
                {STAT_FIELDS.map(f => (
                  <th key={f} style={{ padding: '6px 3px', textAlign: 'center', fontSize: 10, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{STAT_LABELS[f]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gamePlayers.map(p => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '4px 8px', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap', color: 'var(--text)' }}>{p.name}</td>
                  {STAT_FIELDS.map(f => {
                    const v = stats[p.id]?.[f] || 0;
                    return (
                      <td key={f} style={{ padding: '2px' }}>
                        <input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          value={v === 0 ? '' : v}
                          placeholder="0"
                          onChange={e => updateStat(p.id, f, e.target.value)}
                          style={{ width: 42, textAlign: 'center', padding: '4px 2px', borderRadius: 4, fontSize: 12 }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Stats'}
          </button>
        </div>
      </div>
    </div>
  );
}
