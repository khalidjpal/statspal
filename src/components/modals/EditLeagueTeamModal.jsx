import { useState } from 'react';
import { supabase } from '../../supabase';

export default function EditLeagueTeamModal({ leagueTeam, onClose, onSaved }) {
  const [name, setName] = useState(leagueTeam.name);
  const [dotColor, setDotColor] = useState(leagueTeam.dot_color || '#888888');
  const [textColor, setTextColor] = useState(leagueTeam.text_color || '#888888');
  const [isUs, setIsUs] = useState(leagueTeam.is_us || false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    await supabase.from('league_teams').update({
      name: name.trim(),
      dot_color: dotColor,
      text_color: textColor,
      is_us: isUs,
    }).eq('id', leagueTeam.id);
    setSaving(false);
    onSaved();
  }

  async function handleDelete() {
    if (!confirm(`Delete "${leagueTeam.name}" from the league? This will also remove all their results.`)) return;
    // Delete all results involving this team
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
        <label>Dot Color</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <input type="color" value={dotColor} onChange={e => setDotColor(e.target.value)} style={{ width: 48, height: 40, padding: 2, marginBottom: 0 }} />
          <input value={dotColor} onChange={e => setDotColor(e.target.value)} style={{ flex: 1, marginBottom: 0 }} placeholder="#888888" />
        </div>
        <label>Text Color</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)} style={{ width: 48, height: 40, padding: 2, marginBottom: 0 }} />
          <input value={textColor} onChange={e => setTextColor(e.target.value)} style={{ flex: 1, marginBottom: 0 }} placeholder="#888888" />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <input type="checkbox" checked={isUs} onChange={e => setIsUs(e.target.checked)} style={{ width: 'auto', marginBottom: 0 }} />
          This is us (bold in standings)
        </label>
        <div className="modal-actions">
          <button
            onClick={handleDelete}
            style={{ marginRight: 'auto', background: '#fdecea', color: '#8b1a1a', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}
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
