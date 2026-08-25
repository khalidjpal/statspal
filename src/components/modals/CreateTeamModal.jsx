import { useState } from 'react';
import { supabase } from '../../supabase';
import { levelsFor } from '../../utils/schoolType';
import { FORMATS, HIGH_SCHOOL } from '../../utils/teamFormat';

export default function CreateTeamModal({ onClose, onCreated }) {
  const [name,       setName]       = useState('');
  const [gender,     setGender]     = useState('Girls');
  const [schoolType, setSchoolType] = useState('high_school');
  const [format,     setFormat]     = useState(HIGH_SCHOOL);
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
      format,
    };

    let { error: err } = await supabase.from('teams').insert(payload);

    // Fallback: a column whose migration hasn't been run yet is dropped from the
    // payload and the insert retried, so creating a team never hard-fails on a
    // schema that's one migration behind. A team inserted without `format`
    // reads as high_school everywhere (see utils/teamFormat.js).
    for (const col of ['format', 'school_type']) {
      if (!err || !err.message?.includes(col)) continue;
      const retry = { ...payload };
      delete retry[col];
      const res = await supabase.from('teams').insert(retry);
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

        {/* Format first: it decides what the team's dashboard looks like, and
            unlike everything else on this form it can't be changed here later. */}
        <label>Team Format</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          {FORMATS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFormat(opt.value)}
              style={{
                flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: format === opt.value ? '2px solid var(--accent)' : '1px solid var(--border)',
                background: format === opt.value ? 'var(--accent)' : 'var(--surface)',
                color: format === opt.value ? '#fff' : 'var(--text)',
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.45 }}>
          {FORMATS.find(f => f.value === format)?.hint} Changing it later is admin-only.
        </div>

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
