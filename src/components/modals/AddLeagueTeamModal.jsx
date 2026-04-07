import { useState } from 'react';
import { supabase } from '../../supabase';

export default function AddLeagueTeamModal({ teamId, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [dotColor, setDotColor] = useState('#888888');
  const [textColor, setTextColor] = useState('#888888');
  const [isUs, setIsUs] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('league_teams').insert({
      team_id: teamId,
      name: name.trim(),
      dot_color: dotColor,
      text_color: textColor,
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
        <label>Dot Color</label>
        <input type="color" value={dotColor} onChange={e => setDotColor(e.target.value)} />
        <label>Text Color</label>
        <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <input type="checkbox" checked={isUs} onChange={e => setIsUs(e.target.checked)} style={{ width: 'auto', marginBottom: 0 }} />
          This is us
        </label>
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
