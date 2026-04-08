import { useState } from 'react';
import { supabase } from '../../supabase';

export default function EditLeagueResultModal({ result, allLeagueTeams, onClose, onSaved }) {
  const [homeSets, setHomeSets] = useState(result.home_sets ?? 0);
  const [awaySets, setAwaySets] = useState(result.away_sets ?? 0);
  const [gameDate, setGameDate] = useState(result.game_date || '');
  const [saving, setSaving] = useState(false);

  const homeTeam = allLeagueTeams.find(t => t.id === result.home_league_team_id);
  const awayTeam = allLeagueTeams.find(t => t.id === result.away_league_team_id);

  async function handleSave() {
    setSaving(true);
    await supabase.from('league_results').update({
      home_sets: homeSets,
      away_sets: awaySets,
      game_date: gameDate,
    }).eq('id', result.id);
    setSaving(false);
    onSaved();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>Edit League Result</h2>
        <div style={{ fontWeight: 600, marginBottom: 16, color: 'var(--text)' }}>
          {homeTeam?.name || '?'} vs {awayTeam?.name || '?'}
        </div>
        <label>Date</label>
        <input type="date" value={gameDate} onChange={e => setGameDate(e.target.value)} style={{ marginBottom: 16 }} />
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label>{homeTeam?.name || 'Home'} Sets</label>
            <input type="number" min={0} max={5} value={homeSets} onChange={e => setHomeSets(Number(e.target.value))} />
          </div>
          <div style={{ flex: 1 }}>
            <label>{awayTeam?.name || 'Away'} Sets</label>
            <input type="number" min={0} max={5} value={awaySets} onChange={e => setAwaySets(Number(e.target.value))} />
          </div>
        </div>
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
