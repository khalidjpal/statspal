import { useState } from 'react';
import { supabase } from '../../supabase';
import { pColors, mkInit } from '../../utils/colors';
import { gradesFor } from '../../utils/schoolType';

export default function AddPlayerModal({ teamId, playerCount, schoolType = 'high_school', onClose, onSaved }) {
  const [name,     setName]     = useState('');
  const [position, setPosition] = useState('');
  const [jersey,   setJersey]   = useState('');
  const [height,   setHeight]   = useState('');
  const [grade,    setGrade]    = useState('');
  const [saving,   setSaving]   = useState(false);

  const grades = gradesFor(schoolType);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const colors = pColors(playerCount);
    const { error } = await supabase.from('players').insert({
      team_id: teamId,
      name: name.trim(),
      initials: mkInit(name.trim()),
      position: position || null,
      jersey_number: jersey || null,
      height: height || null,
      grade: grade || null,
      colors,
      player_index: playerCount,
    });
    setSaving(false);
    if (!error) onSaved();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>Add Player</h2>
        <label>Name *</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Player name" />
        <label>Position</label>
        <select value={position} onChange={e => setPosition(e.target.value)}>
          <option value="">Select...</option>
          <option>Outside Hitter</option>
          <option>Middle Blocker</option>
          <option>Setter</option>
          <option>Opposite</option>
          <option>Libero</option>
          <option>Defensive Specialist</option>
        </select>
        <label>Jersey #</label>
        <input value={jersey} onChange={e => setJersey(e.target.value)} placeholder="e.g. 12" />
        <label>Height</label>
        <input value={height} onChange={e => setHeight(e.target.value)} placeholder="e.g. 5'10&quot;" />
        <label>Grade</label>
        <select value={grade} onChange={e => setGrade(e.target.value)}>
          <option value="">Select...</option>
          {grades.map(g => <option key={g}>{g}</option>)}
        </select>
        <div className="modal-actions">
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Saving...' : 'Add Player'}
          </button>
        </div>
      </div>
    </div>
  );
}
