import { useState } from 'react';
import { supabase } from '../../supabase';

export default function PlayerLoginModal({ teamId, players, existingAccounts, onClose, onCreated }) {
  const [playerId, setPlayerId] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Only show players that don't already have an account
  const accountPlayerIds = new Set(existingAccounts.filter(a => a.player_id).map(a => a.player_id));
  const availablePlayers = players.filter(p => !accountPlayerIds.has(p.id));

  async function handleSave() {
    if (!playerId || !username.trim() || !password.trim()) return;
    const player = players.find(p => p.id === playerId);
    setSaving(true);
    setError('');
    const { error: err } = await supabase.from('accounts').insert({
      username: username.trim(),
      password_plain: password.trim(),
      role: 'player',
      name: player.name,
      team_id: teamId,
      player_id: playerId,
    });
    setSaving(false);
    if (err) {
      setError(err.message.includes('duplicate') ? 'Username already taken' : err.message);
    } else {
      onCreated({ username: username.trim(), password: password.trim(), role: 'player', name: player.name });
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>Create Player Login</h2>
        {error && <div className="login-error">{error}</div>}
        <label>Player *</label>
        <select value={playerId} onChange={e => setPlayerId(e.target.value)}>
          <option value="">Select a player...</option>
          {availablePlayers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {availablePlayers.length === 0 && (
          <div style={{ fontSize: 12, color: '#C0392B', marginBottom: 12 }}>
            All players already have accounts
          </div>
        )}
        <label>Username *</label>
        <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" />
        <label>Password *</label>
        <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" />
        <div className="modal-actions">
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={handleSave} disabled={saving || !playerId}>
            {saving ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
