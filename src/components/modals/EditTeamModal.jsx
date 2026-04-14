import { useState } from 'react';
import { supabase } from '../../supabase';
import { levelsFor } from '../../utils/schoolType';

export default function EditTeamModal({ team, onClose, onSaved }) {
  const [name,       setName]       = useState(team.name);
  const [gender,     setGender]     = useState(team.gender || 'Girls');
  const [schoolType, setSchoolType] = useState(team.school_type || 'high_school');
  const [level,      setLevel]      = useState(team.level || 'Varsity');
  const [color,      setColor]      = useState(team.color || '#1a3a8f');
  const [season,     setSeason]     = useState(team.season || '2025-26');
  const [leagueName, setLeagueName] = useState(team.league_name || '');
  const [saving,     setSaving]     = useState(false);

  const levels = levelsFor(schoolType);

  function handleSchoolTypeChange(val) {
    setSchoolType(val);
    const newLevels = levelsFor(val);
    if (!newLevels.includes(level)) setLevel(newLevels[0]);
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const payload = {
      name: name.trim(),
      gender,
      level,
      color,
      season,
      league_name: leagueName.trim() || null,
      school_type: schoolType,
    };
    let { error } = await supabase.from('teams').update(payload).eq('id', team.id);
    // Fallback: if school_type column doesn't exist yet, retry without it
    if (error && error.message?.includes('school_type')) {
      const { school_type, ...rest } = payload;
      const res = await supabase.from('teams').update(rest).eq('id', team.id);
      error = res.error;
    }
    setSaving(false);
    if (!error) onSaved();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>Edit Team</h2>

        <label>Team Name</label>
        <input value={name} onChange={e => setName(e.target.value)} />

        <label>School Type</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {[
            { val: 'high_school',   label: 'High School' },
            { val: 'middle_school', label: 'Middle School' },
          ].map(opt => (
            <button
              key={opt.val}
              type="button"
              onClick={() => handleSchoolTypeChange(opt.val)}
              style={{
                flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: schoolType === opt.val ? '2px solid var(--accent)' : '1px solid var(--border)',
                background: schoolType === opt.val ? 'var(--accent)' : 'var(--surface)',
                color: schoolType === opt.val ? '#fff' : 'var(--text)',
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <label>Gender</label>
        <select value={gender} onChange={e => setGender(e.target.value)}>
          <option>Girls</option>
          <option>Boys</option>
          <option>Coed</option>
        </select>

        <label>Level</label>
        <select value={level} onChange={e => setLevel(e.target.value)}>
          {levels.map(l => <option key={l}>{l}</option>)}
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
