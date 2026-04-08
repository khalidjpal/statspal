import { useState } from 'react';
import { supabase } from '../../supabase';

export default function EditLeagueTeamModal({ leagueTeam, onClose, onSaved }) {
  const [name, setName] = useState(leagueTeam.name);
  const [isUs, setIsUs] = useState(leagueTeam.is_us || false);
  const [dotColor, setDotColor] = useState(leagueTeam.dot_color || '#888888');
  const [textColor, setTextColor] = useState(leagueTeam.text_color || '#ffffff');
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
    await supabase.from('league_results').delete().or(`home_league_team_id.eq.${leagueTeam.id},away_league_team_id.eq.${leagueTeam.id}`);
    await supabase.from('league_teams').delete().eq('id', leagueTeam.id);
    onSaved();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <h2>Edit League Team</h2>

        <label>Team Name</label>
        <input value={name} onChange={e => setName(e.target.value)} />

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <input type="checkbox" checked={isUs} onChange={e => setIsUs(e.target.checked)} style={{ width: 'auto', marginBottom: 0 }} />
          This is our team
        </label>

        <label>Dot Color</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <input type="color" value={dotColor} onChange={e => setDotColor(e.target.value)}
            style={{ width: 48, height: 40, padding: 2, marginBottom: 0, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' }} />
          <span style={{ width: 16, height: 16, borderRadius: '50%', background: dotColor, flexShrink: 0, border: '1px solid rgba(128,128,128,0.3)' }} />
          <input value={dotColor} onChange={e => setDotColor(e.target.value)}
            style={{ flex: 1, marginBottom: 0, fontFamily: 'monospace', fontSize: 13 }} placeholder="#888888" />
        </div>

        <label>Text Color</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)}
            style={{ width: 48, height: 40, padding: 2, marginBottom: 0, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: textColor }}>{name || 'Team'}</span>
          <input value={textColor} onChange={e => setTextColor(e.target.value)}
            style={{ flex: 1, marginBottom: 0, fontFamily: 'monospace', fontSize: 13 }} placeholder="#ffffff" />
        </div>

        {/* Live preview */}
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
          padding: '12px 14px', marginBottom: 16,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Preview</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
            <span style={{ fontSize: 15, fontWeight: isUs ? 700 : 400, color: textColor }}>{name || 'Team Name'}</span>
          </div>
        </div>

        <div className="modal-actions">
          <button
            onClick={handleDelete}
            style={{ marginRight: 'auto', background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}
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
