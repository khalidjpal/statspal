import { useState } from 'react';
import { supabase } from '../../supabase';
import { validateStats } from '../../utils/stats';

export default function GodStatsModal({ game, players, existingStats, onClose, onSaved }) {
  const gamePlayers = players.filter(p => p.team_id === game.team_id);
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
    await supabase.from('player_game_stats').delete().eq('game_id', game.id);
    // Insert new stats
    const rows = gamePlayers.map(p => ({
      game_id: game.id,
      player_id: p.id,
      ...stats[p.id],
    })).filter(r => r.sets_played > 0 || r.kills > 0 || r.aces > 0 || r.digs > 0);

    if (rows.length > 0) {
      await supabase.from('player_game_stats').insert(rows);
    }
    setSaving(false);
    onSaved();
  }

  const fields = ['sets_played', 'kills', 'errors', 'attempts', 'assists', 'aces', 'serve_errors', 'digs', 'blocks', 'block_assists'];
  const fieldLabels = { sets_played: 'SP', kills: 'K', errors: 'E', attempts: 'TA', assists: 'A', aces: 'SA', serve_errors: 'SE', digs: 'Digs', blocks: 'BS', block_assists: 'BA' };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 700, maxHeight: '90vh', overflow: 'auto' }}>
        <h2>Edit Stats — vs {game.opponent}</h2>
        {validationError && (
          <div style={{ background: '#fdecea', color: '#8b1a1a', padding: '10px 12px', borderRadius: 8, fontSize: 13, marginBottom: 12, fontWeight: 500 }}>
            {validationError}
          </div>
        )}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                <th style={{ padding: '6px 8px', textAlign: 'left' }}>Player</th>
                {fields.map(f => (
                  <th key={f} style={{ padding: '6px 4px', textAlign: 'center', textTransform: 'uppercase', fontSize: 10 }}>{fieldLabels[f] || f}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gamePlayers.map(p => (
                <tr key={p.id} style={{ borderTop: '1px solid #eee' }}>
                  <td style={{ padding: '4px 8px', fontWeight: 600, fontSize: 12 }}>{p.name}</td>
                  {fields.map(f => (
                    <td key={f} style={{ padding: '2px' }}>
                      <input
                        type="number"
                        min={0}
                        value={stats[p.id]?.[f] || 0}
                        onChange={e => updateStat(p.id, f, e.target.value)}
                        style={{ width: 44, textAlign: 'center', padding: '4px 2px', border: '1px solid #ddd', borderRadius: 4, fontSize: 12 }}
                      />
                    </td>
                  ))}
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
