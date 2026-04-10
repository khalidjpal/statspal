import { useState, useEffect } from 'react';
import { supabase } from '../../supabase';
import { validateStats, cleanStatRow, hasStats } from '../../utils/stats';
import { sortByJersey } from '../../utils/sort';
import { useToast } from '../../contexts/ToastContext';

const STAT_FIELDS = ['sets_played', 'kills', 'errors', 'attempts', 'assists', 'aces', 'serve_errors', 'digs', 'blocks', 'block_assists'];
const STAT_LABELS = { sets_played: 'SP', kills: 'K', errors: 'E', attempts: 'TA', assists: 'A', aces: 'SA', serve_errors: 'SE', digs: 'Digs', blocks: 'BS', block_assists: 'BA' };

export default function ManualResultModal({ game, team, players, existingStats, onClose, onSaved }) {
  const { addToast } = useToast();
  const teamPlayers = sortByJersey(players.filter(p => p.team_id === team.id));
  const isNew = !game.result; // No result yet = entering fresh

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
        : { kills: 0, aces: 0, digs: 0, assists: 0, blocks: 0, errors: 0, attempts: 0, sets_played: 0, block_assists: 0, serve_errors: 0 };
    });
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('score');
  const [validationError, setValidationError] = useState('');

  // Update set scores array when set counts change
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

  function updateStat(playerId, field, value) {
    setStats(prev => ({
      ...prev,
      [playerId]: { ...prev[playerId], [field]: Math.max(0, parseInt(value) || 0) },
    }));
  }

  async function handleSave() {
    setValidationError('');
    for (const p of teamPlayers) {
      const s = stats[p.id];
      if (!s) continue;
      const err = validateStats(s.kills, s.errors, s.attempts);
      if (err) {
        setValidationError(`${p.name}: ${err}`);
        setTab('stats');
        return;
      }
    }
    setSaving(true);

    // Update the completed game record
    const updRes = await supabase.from('completed_games').update({
      result,
      home_sets: homeSets,
      away_sets: awaySets,
      set_scores: setScores.slice(0, homeSets + awaySets),
    }).eq('id', game.id);
    if (updRes.error) addToast('Failed to update game: ' + updRes.error.message);

    // Delete existing stats and insert new ones — cleanStatRow strips DB-only fields
    await supabase.from('player_game_stats').delete().eq('game_id', game.id);

    const rows = teamPlayers
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

    // If league game, auto-sync standings
    if (game.is_league && game.league_team_id) {
      // Find the "us" league team
      const { data: leagueTeams } = await supabase.from('league_teams')
        .select('*')
        .eq('team_id', team.id)
        .eq('is_us', true);
      const usTeam = leagueTeams?.[0];

      if (usTeam) {
        // Remove any existing league result for this game date + opponent combo
        await supabase.from('league_results').delete()
          .eq('team_id', team.id)
          .or(`and(home_league_team_id.eq.${usTeam.id},away_league_team_id.eq.${game.league_team_id}),and(home_league_team_id.eq.${game.league_team_id},away_league_team_id.eq.${usTeam.id})`)
          .eq('game_date', game.game_date);

        // Determine home/away based on location
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
                {teamPlayers.map(p => (
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
