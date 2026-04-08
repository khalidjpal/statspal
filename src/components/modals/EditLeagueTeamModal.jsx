import { useState } from 'react';
import { supabase } from '../../supabase';

export default function EditLeagueTeamModal({ leagueTeam, onClose, onSaved }) {
  const [name, setName] = useState(leagueTeam.name);
  const [isUs, setIsUs] = useState(leagueTeam.is_us || false);
  const [teamColor, setTeamColor] = useState(leagueTeam.text_color || leagueTeam.dot_color || '#1a3a8f');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    await supabase.from('league_teams').update({
      name: name.trim(),
      dot_color: isUs ? teamColor : '#888888',
      text_color: isUs ? teamColor : null,
      is_us: isUs,
    }).eq('id', leagueTeam.id);
    setSaving(false);
    onSaved();
  }

  async function handleDelete() {
    if (!confirm(`Delete "${leagueTeam.name}" from the league? This will also remove all their results.`)) return;
    await supabase.from('league_results').delete().or(`home_league_team_id.eq.${leagueTeam.id},away_league_team_id.eq.${leagueTeam.id}`);
    await supabase.from('league_teams').delete().eq('id', leagueTeam.id);
    onSaved();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>Edit League Team</h2>
        <label>Team Name *</label>
        <input value={name} onChange={e => setName(e.target.value)} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <input type="checkbox" checked={isUs} onChange={e => setIsUs(e.target.checked)} style={{ width: 'auto', marginBottom: 0 }} />
          This is us
        </label>
        {isUs && (
          <>
            <label>Team Color (shown bold in standings)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <input type="color" value={teamColor} onChange={e => setTeamColor(e.target.value)} style={{ width: 48, height: 40, padding: 2, marginBottom: 0 }} />
              <input value={teamColor} onChange={e => setTeamColor(e.target.value)} style={{ flex: 1, marginBottom: 0 }} placeholder="#1a3a8f" />
            </div>
          </>
        )}
        <div className="modal-actions">
          <button
            onClick={handleDelete}
            style={{ marginRight: 'auto', background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}
          >
            Delete Team
          </button>
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
