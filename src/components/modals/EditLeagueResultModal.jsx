import { useState } from 'react';
import { supabase } from '../../supabase';

export default function EditLeagueResultModal({ result, allLeagueTeams, onClose, onSaved }) {
  const [homeId, setHomeId] = useState(result.home_league_team_id || '');
  const [awayId, setAwayId] = useState(result.away_league_team_id || '');
  const [homeSets, setHomeSets] = useState(result.home_sets ?? 0);
  const [awaySets, setAwaySets] = useState(result.away_sets ?? 0);
  const [gameDate, setGameDate] = useState(result.game_date || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function validate() {
    if (!homeId || !awayId) return 'Pick both home and away teams.';
    if (homeId === awayId) return 'Home and away cannot be the same team.';
    if (!gameDate) return 'Pick a game date.';
    const hs = Number(homeSets);
    const as = Number(awaySets);
    if (!Number.isFinite(hs) || !Number.isFinite(as) || hs < 0 || as < 0) return 'Sets must be 0 or higher.';
    if (hs === as) return 'Sets cannot be tied — one team has to win.';
    return null;
  }

  async function handleSave() {
    const err = validate();
    if (err) { setError(err); return; }
    setError('');
    setSaving(true);
    const { error: dbErr } = await supabase.from('league_results').update({
      home_league_team_id: homeId,
      away_league_team_id: awayId,
      home_sets: Number(homeSets),
      away_sets: Number(awaySets),
      game_date: gameDate,
    }).eq('id', result.id);
    setSaving(false);
    if (dbErr) { setError('Save failed: ' + dbErr.message); return; }
    onSaved();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>Edit League Result</h2>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '10px 12px', borderRadius: 8, fontSize: 13, marginBottom: 12, fontWeight: 600 }}>
            {error}
          </div>
        )}

        <label>Home Team *</label>
        <select value={homeId} onChange={e => setHomeId(e.target.value)}>
          <option value="">Select…</option>
          {allLeagueTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        <label>Away Team *</label>
        <select value={awayId} onChange={e => setAwayId(e.target.value)}>
          <option value="">Select…</option>
          {allLeagueTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label>Home Sets</label>
            <input type="number" min={0} max={5} value={homeSets} onChange={e => setHomeSets(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label>Away Sets</label>
            <input type="number" min={0} max={5} value={awaySets} onChange={e => setAwaySets(e.target.value)} />
          </div>
        </div>

        <label>Date *</label>
        <input type="date" value={gameDate} onChange={e => setGameDate(e.target.value)} />

        <div className="modal-actions">
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
