import { useState } from 'react';
import { supabase } from '../../supabase';
import { validateStats, cleanStatRow, hasStats } from '../../utils/stats';
import { sortByJersey } from '../../utils/sort';
import { useToast } from '../../contexts/ToastContext';
import PlayerStatsEntry from '../PlayerStatsEntry';

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
  const [fieldErrors, setFieldErrors] = useState({});

  function updateStat(playerId, field, value) {
    setStats(prev => ({
      ...prev,
      [playerId]: { ...prev[playerId], [field]: Math.max(0, parseInt(value) || 0) },
    }));
    setFieldErrors(prev => {
      if (!prev[playerId]) return prev;
      const next = { ...prev };
      delete next[playerId];
      return next;
    });
  }

  async function handleSave() {
    setValidationError('');
    setFieldErrors({});
    const errs = {};
    let firstErrName = null;
    for (const p of gamePlayers) {
      const s = stats[p.id];
      if (!s) continue;
      const err = validateStats(s.kills, s.errors, s.attempts);
      if (err) {
        errs[p.id] = { field: 'attempts', message: err };
        if (!firstErrName) firstErrName = p.name;
      }
    }
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setValidationError(`Fix invalid hitting stats for ${firstErrName}${Object.keys(errs).length > 1 ? ` and ${Object.keys(errs).length - 1} other(s)` : ''}.`);
      addToast('Cannot save — invalid stats highlighted', 'error');
      return;
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
      let insRes = await supabase.from('player_game_stats').insert(rows);
      if (insRes.error) {
        // Fallback without block_assists/serve_errors
        const fallback = rows.map(({ block_assists, serve_errors, ...rest }) => rest);
        insRes = await supabase.from('player_game_stats').insert(fallback);
      }
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
        <div className="pse-list">
          {gamePlayers.map(p => (
            <PlayerStatsEntry
              key={p.id}
              player={p}
              stats={stats[p.id]}
              onUpdate={updateStat}
              errorField={fieldErrors[p.id]?.field}
              errorMessage={fieldErrors[p.id]?.message}
            />
          ))}
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
