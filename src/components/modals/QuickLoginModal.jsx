import { useState } from 'react';
import { supabase } from '../../supabase';

export default function QuickLoginModal({ player, teamId, onClose, onCreated }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!username.trim() || !password.trim()) return;
    setSaving(true);
    setError('');
    const { error: err } = await supabase.from('accounts').insert({
      username: username.trim(),
      password_plain: password.trim(),
      role: 'player',
      name: player.name,
      team_id: teamId,
      player_id: player.id,
    });
    setSaving(false);
    if (err) {
      setError(err.message.includes('duplicate') ? 'Username already taken' : err.message);
    } else {
      onCreated();
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>Create Login for {player.name}</h2>
        {error && <div className="login-error">{error}</div>}
        <label>Username *</label>
        <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" autoFocus />
        <label>Password *</label>
        <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" />
        <div className="modal-actions">
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button
            className="modal-btn-primary"
            onClick={handleSave}
            disabled={saving || !username.trim() || !password.trim()}
          >
            {saving ? 'Creating...' : 'Create Login'}
          </button>
        </div>
      </div>
    </div>
  );
}
