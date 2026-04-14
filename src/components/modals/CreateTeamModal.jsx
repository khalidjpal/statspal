import { useState } from 'react';
import { supabase } from '../../supabase';
import { levelsFor } from '../../utils/schoolType';

export default function CreateTeamModal({ onClose, onCreated }) {
  const [name,       setName]       = useState('');
  const [gender,     setGender]     = useState('Girls');
  const [schoolType, setSchoolType] = useState('high_school');
  const [level,      setLevel]      = useState('Varsity');
  const [color,      setColor]      = useState('#1a3a8f');
  const [season,     setSeason]     = useState('2025-26');
  const [leagueName, setLeagueName] = useState('');
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');

  const levels = levelsFor(schoolType);

  function handleSchoolTypeChange(val) {
    setSchoolType(val);
    const newLevels = levelsFor(val);
    if (!newLevels.includes(level)) setLevel(newLevels[0]);
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setError('');

    const payload = {
      name: name.trim(),
      gender,
      level,
      color,
      season,
      league_name: leagueName.trim() || null,
      school_type: schoolType,
    };

    let { error: err } = await supabase.from('teams').insert(payload);

    // Fallback: if school_type column doesn't exist yet, retry without it
    if (err && err.message?.includes('school_type')) {
      const { school_type, ...rest } = payload;
      const res = await supabase.from('teams').insert(rest);
      err = res.error;
    }

    setSaving(false);
    if (err) {
      setError(err.message);
    } else {
      onCreated();
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>Create Team</h2>

        <label>Team Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. West HS" />

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
        <input value={season} onChange={e => setSeason(e.target.value)} placeholder="2025-26" />

        <label>League Name (optional)</label>
        <input value={leagueName} onChange={e => setLeagueName(e.target.value)} placeholder="e.g. Pacific League" />

        {error && (
          <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 8 }}>{error}</div>
        )}

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
