import { useState } from 'react';
import { supabase } from '../../supabase';

export default function AddLeagueTeamModal({ teamId, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [isUs, setIsUs] = useState(false);
  const [teamColor, setTeamColor] = useState('#1a3a8f');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('league_teams').insert({
      team_id: teamId,
      name: name.trim(),
      dot_color: isUs ? teamColor : '#888888',
      text_color: isUs ? teamColor : null,
      is_us: isUs,
    });
    setSaving(false);
    if (!error) onSaved();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>Add League Team</h2>
        <label>Team Name *</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Central HS" />
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
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Saving...' : 'Add Team'}
          </button>
        </div>
      </div>
    </div>
  );
}
