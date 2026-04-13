import { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { validateStats, cleanStatRow, hasStats } from '../../utils/stats';
import { sortByJersey } from '../../utils/sort';
import { useToast } from '../../contexts/ToastContext';

const STAT_FIELDS = ['sets_played', 'kills', 'errors', 'attempts', 'assists', 'ball_handling_errors', 'aces', 'serve_errors', 'receives', 'digs', 'digging_errors', 'blocks', 'block_assists', 'blocking_errors'];
const STAT_LABELS = { sets_played: 'SP', kills: 'K', errors: 'E', attempts: 'TA', assists: 'A', ball_handling_errors: 'BHE', aces: 'SA', serve_errors: 'SE', receives: 'R', digs: 'Digs', digging_errors: 'DE', blocks: 'BS', block_assists: 'BA', blocking_errors: 'BE' };

// SP = 0 or blank → player is locked (no other stats allowed)
function spLocked(playerStats) {
  return !(playerStats?.sets_played > 0);
}

export default function ManualResultModal({ game, team, players, existingStats, onClose, onSaved }) {
  const { addToast } = useToast();
  const teamPlayers = sortByJersey(players.filter(p => p.team_id === team.id));
  const isNew = !game.result;

  const [result, setResult] = useState(game.result || 'W');
  const [homeSets, setHomeSets] = useState(game.home_sets || 3);
  const [awaySets, setAwaySets] = useState(game.away_sets || 0);
  const [setScores, setSetScores] = useState(() => {
    if (game.set_scores && game.set_scores.length > 0) return game.set_scores;
    const count = (game.home_sets || 3) + (game.away_sets || 0);
    return Array.from({ length: count || 3 }, () => ({ home: 25, away: 20 }));
  });
  const [stats, setStats] = useState(() => {
    const init = {};
    teamPlayers.forEach(p => {
      const existing = existingStats.find(s => s.player_id === p.id);
      init[p.id] = existing
        ? { ...existing }
        : { kills: 0, aces: 0, digs: 0, assists: 0, blocks: 0, errors: 0, attempts: 0, sets_played: 0, block_assists: 0, serve_errors: 0, blocking_errors: 0, digging_errors: 0, ball_handling_errors: 0, receives: 0 };
    });
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('score');
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    const count = homeSets + awaySets;
    if (count > 0 && count !== setScores.length) {
      setSetScores(prev => {
        const arr = [...prev];
        while (arr.length < count) arr.push({ home: 25, away: 20 });
        return arr.slice(0, count);
      });
    }
  }, [homeSets, awaySets]);

  function updateSetScore(idx, side, val) {
    setSetScores(prev => {
      const arr = [...prev];
      arr[idx] = { ...arr[idx], [side]: Math.max(0, parseInt(val) || 0) };
      return arr;
    });
  }

  function updateStat(playerId, field, rawValue, rIdx, tableEl) {
    const num = Math.max(0, parseInt(rawValue) || 0);

    if (field === 'sets_played') {
      const wasLocked = spLocked(stats[playerId]);
      const nowLocked = num === 0;

      if (!wasLocked && nowLocked) {
        // Going from unlocked → locked: clear all non-SP stats
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

        // Unlocking for the first time: auto-focus K field
        if (wasLocked && num > 0) {
          setTimeout(() => {
            const kInput = tableEl?.querySelector(`input[data-row="${rIdx}"][data-col="1"]`);
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

    const rows = teamPlayers.length;
    const cols = STAT_FIELDS.length;
    let r = rowIdx, c = colIdx;
    const rowLocked = (ri) => spLocked(stats[teamPlayers[ri].id]);

    if (key === 'ArrowDown') {
      if (c === 0) {
        // SP column: always move to next row's SP
        if (r < rows - 1) r++;
      } else {
        // Skip locked rows
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
        // Locked row: only SP accessible, Right wraps to next row's SP
        if (r < rows - 1) { r++; c = 0; }
      } else if (c < cols - 1) {
        c++;
      } else if (r < rows - 1) {
        r++; c = 0;
      }
    } else if (key === 'ArrowLeft') {
      if (rowLocked(r)) {
        // Locked row on SP: Left wraps to prev row's last accessible col
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
    for (const p of teamPlayers) {
      const s = stats[p.id];
      if (!s || spLocked(s)) continue;
      const err = validateStats(s.kills, s.errors, s.attempts);
      if (err) { setValidationError(`${p.name}: ${err}`); setTab('stats'); return; }
    }
    setSaving(true);

    const updRes = await supabase.from('completed_games').update({
      result,
      home_sets: homeSets,
      away_sets: awaySets,
      set_scores: setScores.slice(0, homeSets + awaySets),
    }).eq('id', game.id);
    if (updRes.error) addToast('Failed to update game: ' + updRes.error.message);

    await supabase.from('player_game_stats').delete().eq('game_id', game.id);

    const rows = teamPlayers
      .filter(p => !spLocked(stats[p.id]))
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
        addToast('Result saved', 'success');
      }
    } else {
      addToast('Result saved', 'success');
    }

    if (game.is_league && game.league_team_id) {
      const { data: leagueTeams } = await supabase.from('league_teams')
        .select('*').eq('team_id', team.id).eq('is_us', true);
      const usTeam = leagueTeams?.[0];
      if (usTeam) {
        await supabase.from('league_results').delete()
          .eq('team_id', team.id)
          .or(`and(home_league_team_id.eq.${usTeam.id},away_league_team_id.eq.${game.league_team_id}),and(home_league_team_id.eq.${game.league_team_id},away_league_team_id.eq.${usTeam.id})`)
          .eq('game_date', game.game_date);
        const isHome = (game.location || 'Home') === 'Home';
        await supabase.from('league_results').insert({
          team_id: team.id,
          home_league_team_id: isHome ? usTeam.id : game.league_team_id,
          away_league_team_id: isHome ? game.league_team_id : usTeam.id,
          home_sets: isHome ? homeSets : awaySets,
          away_sets: isHome ? awaySets : homeSets,
          game_date: game.game_date,
        });
      }
    }

    setSaving(false);
    onSaved();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 700, maxHeight: '90vh', overflow: 'auto' }}>
        <h2>{isNew ? 'Enter Result' : 'Edit Result'} — vs {game.opponent}</h2>

        {validationError && (
          <div style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '10px 12px', borderRadius: 8, fontSize: 13, marginBottom: 12, fontWeight: 500 }}>
            {validationError}
          </div>
        )}

        {/* Tab toggle */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <button
            onClick={() => setTab('score')}
            style={{ flex: 1, padding: '10px', fontSize: 13, fontWeight: 600, background: tab === 'score' ? '#1a3a8f' : 'transparent', color: tab === 'score' ? '#fff' : 'var(--text-secondary)', border: 'none', cursor: 'pointer' }}
          >
            Score
          </button>
          <button
            onClick={() => setTab('stats')}
            style={{ flex: 1, padding: '10px', fontSize: 13, fontWeight: 600, background: tab === 'stats' ? '#1a3a8f' : 'transparent', color: tab === 'stats' ? '#fff' : 'var(--text-secondary)', border: 'none', cursor: 'pointer' }}
          >
            Player Stats
          </button>
        </div>

        {tab === 'score' && (
          <div>
            <label>Result</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button
                onClick={() => setResult('W')}
                style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, background: result === 'W' ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.04)', color: result === 'W' ? '#10b981' : '#8892a4' }}
              >
                Win
              </button>
              <button
                onClick={() => setResult('L')}
                style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, background: result === 'L' ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.04)', color: result === 'L' ? '#ef4444' : '#8892a4' }}
              >
                Loss
              </button>
            </div>

            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label>{team.name} Sets</label>
                <input type="number" min={0} max={3} value={homeSets} onChange={e => setHomeSets(Math.max(0, +e.target.value))} />
              </div>
              <div style={{ flex: 1 }}>
                <label>Opponent Sets</label>
                <input type="number" min={0} max={3} value={awaySets} onChange={e => setAwaySets(Math.max(0, +e.target.value))} />
              </div>
            </div>

            <label>Set Scores</label>
            {setScores.slice(0, homeSets + awaySets).map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', width: 50 }}>Set {i + 1}</span>
                <input type="number" min={0} value={s.home} onChange={e => updateSetScore(i, 'home', e.target.value)}
                  style={{ width: 60, textAlign: 'center' }} />
                <span style={{ color: '#8892a4' }}>-</span>
                <input type="number" min={0} value={s.away} onChange={e => updateSetScore(i, 'away', e.target.value)}
                  style={{ width: 60, textAlign: 'center' }} />
              </div>
            ))}
          </div>
        )}

        {tab === 'stats' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'rgba(128,128,128,0.06)' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 11, color: 'var(--text-secondary)' }}>Player</th>
                  {STAT_FIELDS.map(f => (
                    <th key={f} style={{ padding: '6px 3px', textAlign: 'center', fontSize: 10, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                      {STAT_LABELS[f]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {teamPlayers.map((p, rIdx) => {
                  const locked = spLocked(stats[p.id]);
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
                              onChange={e => updateStat(p.id, f, e.target.value, rIdx, e.target.closest('table'))}
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
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
              Players without SP entered will not be saved.
            </div>
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Result'}
          </button>
        </div>
      </div>
    </div>
  );
}
