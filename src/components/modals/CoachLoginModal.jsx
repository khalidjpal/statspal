import { useState } from 'react';
import { supabase } from '../../supabase';

export default function CoachLoginModal({ teamId, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!name.trim() || !username.trim() || !password.trim()) return;
    setSaving(true);
    setError('');
    const { error: err } = await supabase.from('accounts').insert({
      username: username.trim(),
      password_plain: password.trim(),
      role: 'coach',
      name: name.trim(),
      team_id: teamId,
    });
    setSaving(false);
    if (err) {
      setError(err.message.includes('duplicate') ? 'Username already taken' : err.message);
    } else {
      onCreated({ username: username.trim(), password: password.trim(), role: 'coach', name: name.trim() });
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>Create Coach Login</h2>
        {error && <div className="login-error">{error}</div>}
        <label>Name *</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Coach name" />
        <label>Username *</label>
        <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" />
        <label>Password *</label>
        <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" />
        <div className="modal-actions">
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
