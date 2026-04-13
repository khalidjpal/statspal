import { useState } from 'react';
import { supabase } from '../../supabase';
import { validateStats, cleanStatRow, hasStats } from '../../utils/stats';
import { sortByJersey } from '../../utils/sort';
import { useToast } from '../../contexts/ToastContext';

const STAT_FIELDS = ['sets_played', 'kills', 'errors', 'attempts', 'assists', 'ball_handling_errors', 'aces', 'serve_errors', 'receives', 'digs', 'digging_errors', 'blocks', 'block_assists', 'blocking_errors'];
const STAT_LABELS = { sets_played: 'SP', kills: 'K', errors: 'E', attempts: 'TA', assists: 'A', ball_handling_errors: 'BHE', aces: 'SA', serve_errors: 'SE', receives: 'R', digs: 'Digs', digging_errors: 'DE', blocks: 'BS', block_assists: 'BA', blocking_errors: 'BE' };

export default function GodStatsModal({ game, players, existingStats, onClose, onSaved }) {
  const { addToast } = useToast();
  const gamePlayers = sortByJersey(players.filter(p => p.team_id === game.team_id));
  const [stats, setStats] = useState(() => {
    const init = {};
    gamePlayers.forEach(p => {
      const existing = existingStats.find(s => s.player_id === p.id);
      init[p.id] = existing
        ? { ...existing }
        : { kills: 0, aces: 0, digs: 0, assists: 0, blocks: 0, errors: 0, attempts: 0, sets_played: 0, block_assists: 0, serve_errors: 0, blocking_errors: 0, digging_errors: 0, ball_handling_errors: 0, receives: 0 };
    });
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState('');

  // A player is locked if their SP (sets_played) is 0 / not entered
  function isLocked(playerId) {
    return !(stats[playerId]?.sets_played > 0);
  }

  function updateStat(playerId, field, rawValue, rIdx, tableRef) {
    const num = Math.max(0, parseInt(rawValue) || 0);

    if (field === 'sets_played') {
      const wasLocked = isLocked(playerId);
      const nowLocked = num === 0;

      if (!wasLocked && nowLocked) {
        // Just locked — clear all non-SP stats for this player
        setStats(prev => ({
          ...prev,
          [playerId]: {
            sets_played: 0,
            kills: 0, aces: 0, digs: 0, assists: 0, blocks: 0,
            errors: 0, attempts: 0, block_assists: 0, serve_errors: 0,
            blocking_errors: 0, digging_errors: 0, ball_handling_errors: 0, receives: 0,
          },
        }));
      } else {
        setStats(prev => ({
          ...prev,
          [playerId]: { ...prev[playerId], sets_played: num },
        }));

        // Auto-focus K field when player goes from locked → unlocked
        if (wasLocked && num > 0) {
          setTimeout(() => {
            const table = tableRef?.current;
            const kInput = table?.querySelector(`input[data-row="${rIdx}"][data-col="1"]`);
            if (kInput) { kInput.focus(); kInput.select?.(); }
          }, 0);
        }
      }
    } else {
      setStats(prev => ({
        ...prev,
        [playerId]: { ...prev[playerId], [field]: num },
      }));
    }
  }

  function handleStatKeyDown(e, rowIdx, colIdx) {
    const key = e.key;
    if (key !== 'ArrowUp' && key !== 'ArrowDown' && key !== 'ArrowLeft' && key !== 'ArrowRight') return;
    e.preventDefault();

    const rows = gamePlayers.length;
    const cols = STAT_FIELDS.length;
    let r = rowIdx, c = colIdx;
    const rowLocked = (ri) => isLocked(gamePlayers[ri].id);

    if (key === 'ArrowDown') {
      if (c === 0) {
        // SP column: always navigate to next row's SP
        if (r < rows - 1) r++;
      } else {
        // Non-SP: skip locked rows
        let nr = r + 1;
        while (nr < rows && rowLocked(nr)) nr++;
        if (nr < rows) r = nr;
      }
    } else if (key === 'ArrowUp') {
      if (c === 0) {
        if (r > 0) r--;
      } else {
        let nr = r - 1;
        while (nr >= 0 && rowLocked(nr)) nr--;
        if (nr >= 0) r = nr;
      }
    } else if (key === 'ArrowRight') {
      if (rowLocked(r)) {
        // Locked row — only SP is accessible; Right wraps to next row's SP
        if (r < rows - 1) { r++; c = 0; }
      } else if (c < cols - 1) {
        c++;
      } else if (r < rows - 1) {
        // End of row: next row col 0
        r++;
        c = 0;
      }
    } else if (key === 'ArrowLeft') {
      if (rowLocked(r)) {
        // Locked row — only SP; Left wraps to prev row's last accessible col
        if (r > 0) {
          r--;
          c = rowLocked(r) ? 0 : cols - 1;
        }
      } else if (c > 0) {
        c--;
      } else if (r > 0) {
        r--;
        c = rowLocked(r) ? 0 : cols - 1;
      }
    }

    const next = e.currentTarget.closest('table')?.querySelector(`input[data-row="${r}"][data-col="${c}"]`);
    if (next && !next.disabled) { next.focus(); next.select?.(); }
  }

  async function handleSave() {
    setValidationError('');
    for (const p of gamePlayers) {
      const s = stats[p.id];
      if (!s || isLocked(p.id)) continue;
      const err = validateStats(s.kills, s.errors, s.attempts);
      if (err) { setValidationError(`${p.name}: ${err}`); return; }
    }
    setSaving(true);
    const delRes = await supabase.from('player_game_stats').delete().eq('game_id', game.id);
    if (delRes.error) { addToast('Failed to clear old stats: ' + delRes.error.message); }

    const rows = gamePlayers
      .filter(p => !isLocked(p.id))
      .map(p => ({
        game_id: game.id,
        player_id: p.id,
        ...cleanStatRow(stats[p.id] || {}),
      }))
      .filter(r => hasStats(r));

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
              {gamePlayers.map((p, rIdx) => {
                const locked = isLocked(p.id);
                // Use a per-row ref for auto-focus coordination
                return (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--border)', opacity: locked ? 0.75 : 1, transition: 'opacity 0.15s' }}>
                    <td style={{ padding: '4px 8px', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap', color: 'var(--text)' }}>
                      {p.name}
                      {locked && (
                        <div style={{ fontSize: 9, fontWeight: 400, color: 'var(--text-secondary)', marginTop: 1, letterSpacing: '0.02em' }}>
                          Enter SP to unlock
                        </div>
                      )}
                    </td>
                    {STAT_FIELDS.map((f, cIdx) => {
                      const isSP = f === 'sets_played';
                      const fieldLocked = !isSP && locked;
                      const v = stats[p.id]?.[f] || 0;
                      return (
                        <td key={f} style={{ padding: '2px' }}>
                          <input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={v === 0 ? '' : v}
                            placeholder={fieldLocked ? '—' : ''}
                            disabled={fieldLocked}
                            data-row={rIdx}
                            data-col={cIdx}
                            onChange={e => {
                              // Pass a table-ref-compatible approach via e.target
                              updateStat(p.id, f, e.target.value, rIdx, { current: e.target.closest('table') });
                            }}
                            onKeyDown={e => handleStatKeyDown(e, rIdx, cIdx)}
                            onFocus={e => e.target.select?.()}
                            className="stat-cell-input"
                            style={{
                              width: 42,
                              textAlign: 'center',
                              padding: '4px 2px',
                              borderRadius: 4,
                              fontSize: 12,
                              transition: 'opacity 0.15s, background 0.15s',
                              ...(fieldLocked ? {
                                opacity: 0.3,
                                background: 'rgba(0,0,0,0.2)',
                                cursor: 'not-allowed',
                                color: 'var(--text-secondary)',
                              } : {}),
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 8, marginBottom: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
          Players without SP entered will not be saved.
        </div>
        <div className="modal-actions" style={{ marginTop: 8 }}>
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Stats'}
          </button>
        </div>
      </div>
    </div>
  );
}
