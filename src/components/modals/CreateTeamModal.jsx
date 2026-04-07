import { useState } from 'react';
import { supabase } from '../../supabase';

export default function CreateTeamModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [gender, setGender] = useState('Girls');
  const [level, setLevel] = useState('Varsity');
  const [color, setColor] = useState('#1a3a8f');
  const [season, setSeason] = useState('2025-26');
  const [leagueName, setLeagueName] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('teams').insert({
      name: name.trim(),
      gender,
      level,
      color,
      season,
      league_name: leagueName.trim() || null,
    });
    setSaving(false);
    if (!error) onCreated();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>Create Team</h2>

        <label>Team Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. West HS" />

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
        <input value={season} onChange={e => setSeason(e.target.value)} placeholder="2025-26" />

        <label>League Name (optional)</label>
        <input value={leagueName} onChange={e => setLeagueName(e.target.value)} placeholder="e.g. Pacific League" />

        <div className="modal-actions">
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Creating...' : 'Create Team'}
          </button>
        </div>
      </div>
    </div>
  );
}
