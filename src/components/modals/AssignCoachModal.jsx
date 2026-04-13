import { useState } from 'react';
import { supabase } from '../../supabase';

export default function AssignCoachModal({ team, accounts, coachAssignments, onClose, onSaved }) {
  const [selectedId, setSelectedId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Coaches already assigned to this team (by team_id or assignment row)
  const assignedIds = new Set([
    ...accounts.filter(a => a.role === 'coach' && a.team_id === team.id).map(a => a.id),
    ...coachAssignments.filter(ca => ca.team_id === team.id).map(ca => ca.account_id),
  ]);
  const available = accounts.filter(a => a.role === 'coach' && !assignedIds.has(a.id));

  async function handleAssign() {
    if (!selectedId) return;
    setSaving(true);
    setError('');
    const { error: err } = await supabase.from('coach_team_assignments').insert({
      account_id: selectedId,
      team_id: team.id,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>Assign Coach to {team.name}</h2>
        {error && <div className="login-error">{error}</div>}
        <label>Coach Account</label>
        {available.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            No available coach accounts. Create one in Team Admin → Accounts first.
          </div>
        ) : (
          <select value={selectedId} onChange={e => setSelectedId(e.target.value)}>
            <option value="">Select a coach...</option>
            {available.map(a => (
              <option key={a.id} value={a.id}>{a.name} (@{a.username})</option>
            ))}
          </select>
        )}
        <div className="modal-actions">
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button
            className="modal-btn-primary"
            onClick={handleAssign}
            disabled={saving || !selectedId || available.length === 0}
          >
            {saving ? 'Assigning...' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  );
}
