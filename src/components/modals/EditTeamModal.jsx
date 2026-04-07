import { useState } from 'react';
import { supabase } from '../../supabase';

export default function EditTeamModal({ team, onClose, onSaved }) {
  const [name, setName] = useState(team.name);
  const [gender, setGender] = useState(team.gender || 'Girls');
  const [level, setLevel] = useState(team.level || 'Varsity');
  const [color, setColor] = useState(team.color || '#1a3a8f');
  const [season, setSeason] = useState(team.season || '2025-26');
  const [leagueName, setLeagueName] = useState(team.league_name || '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    await supabase.from('teams').update({
      name: name.trim(),
      gender,
      level,
      color,
      season,
      league_name: leagueName.trim() || null,
    }).eq('id', team.id);
    setSaving(false);
    onSaved();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>Edit Team</h2>
        <label>Team Name</label>
        <input value={name} onChange={e => setName(e.target.value)} />
        <label>Gender</label>
        <select value={gender} onChange={e => setGender(e.target.value)}>
          <option>Girls</option>
          <option>Boys</option>
        </select>
        <label>Level</label>
        <select value={level} onChange={e => setLevel(e.target.value)}>
          <option>Varsity</option>
          <option>JV</option>
          <option>Freshman</option>
        </select>
        <label>Team Color</label>
        <input type="color" value={color} onChange={e => setColor(e.target.value)} />
        <label>Season</label>
        <input value={season} onChange={e => setSeason(e.target.value)} />
        <label>League Name</label>
        <input value={leagueName} onChange={e => setLeagueName(e.target.value)} />
        <div className="modal-actions">
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
