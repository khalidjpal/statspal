import { useState } from 'react';
import { supabase } from '../../supabase';

export default function AddResultModal({ teamId, leagueTeams, onClose, onSaved }) {
  const [homeId, setHomeId] = useState('');
  const [awayId, setAwayId] = useState('');
  const [homeSets, setHomeSets] = useState(3);
  const [awaySets, setAwaySets] = useState(0);
  const [gameDate, setGameDate] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!homeId || !awayId || !gameDate) return;
    setSaving(true);
    const { error } = await supabase.from('league_results').insert({
      team_id: teamId,
      home_league_team_id: homeId,
      away_league_team_id: awayId,
      home_sets: homeSets,
      away_sets: awaySets,
      game_date: gameDate,
    });
    setSaving(false);
    if (!error) onSaved();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>Add Result</h2>
        <label>Home Team *</label>
        <select value={homeId} onChange={e => setHomeId(e.target.value)}>
          <option value="">Select...</option>
          {leagueTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <label>Away Team *</label>
        <select value={awayId} onChange={e => setAwayId(e.target.value)}>
          <option value="">Select...</option>
          {leagueTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label>Home Sets</label>
            <input type="number" min={0} max={3} value={homeSets} onChange={e => setHomeSets(+e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label>Away Sets</label>
            <input type="number" min={0} max={3} value={awaySets} onChange={e => setAwaySets(+e.target.value)} />
          </div>
        </div>
        <label>Date *</label>
        <input type="date" value={gameDate} onChange={e => setGameDate(e.target.value)} />
        <div className="modal-actions">
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={handleSave} disabled={saving || !homeId || !awayId || !gameDate}>
            {saving ? 'Saving...' : 'Add Result'}
          </button>
        </div>
      </div>
    </div>
  );
}
