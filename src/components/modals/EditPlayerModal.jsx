import { useState } from 'react';
import { supabase } from '../../supabase';
import { mkInit } from '../../utils/colors';
import { gradesFor } from '../../utils/schoolType';

function luminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const toLinear = c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}
function contrastText(hex) {
  return luminance(hex) > 0.35 ? '#000000' : '#ffffff';
}

export default function EditPlayerModal({ player, schoolType = 'high_school', onClose, onSaved }) {
  const [name,     setName]     = useState(player.name || '');
  const [position, setPosition] = useState(player.position || '');
  const [jersey,   setJersey]   = useState(player.jersey_number || '');
  const [height,   setHeight]   = useState(player.height || '');
  const [grade,    setGrade]    = useState(player.grade || '');
  const [bgColor,  setBgColor]  = useState(player.colors?.bg || '#1a3a8f');
  const [saving,   setSaving]   = useState(false);

  const grades = gradesFor(schoolType);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    await supabase.from('players').update({
      name:          name.trim(),
      initials:      mkInit(name.trim()),
      position:      position || null,
      jersey_number: jersey || null,
      height:        height || null,
      grade:         grade || null,
      colors:        { bg: bgColor, text: contrastText(bgColor) },
    }).eq('id', player.id);
    setSaving(false);
    onSaved();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2>Edit Player</h2>

        <label>Name *</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" />

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

        <label>Badge Color</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <input
            type="color"
            value={bgColor}
            onChange={e => setBgColor(e.target.value)}
            style={{ width: 48, height: 40, padding: 2, marginBottom: 0 }}
          />
          <div
            style={{
              width: 40, height: 40, borderRadius: '50%',
              background: bgColor, color: contrastText(bgColor),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 13, border: '2px solid rgba(255,255,255,0.1)',
            }}
          >
            {mkInit(name || player.name)}
          </div>
          <input
            value={bgColor}
            onChange={e => setBgColor(e.target.value)}
            style={{ flex: 1, marginBottom: 0 }}
            placeholder="#1a3a8f"
          />
        </div>

        <div className="modal-actions">
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
