import { useState } from 'react';
import { supabase } from '../../supabase';

export default function EditAccountModal({ account, onClose, onSaved }) {
  const [name, setName] = useState(account.name);
  const [password, setPassword] = useState('');
  const [active, setActive] = useState(account.active);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const updates = { name: name.trim(), active };
    if (password.trim()) updates.password_plain = password.trim();
    await supabase.from('accounts').update(updates).eq('id', account.id);
    setSaving(false);
    onSaved();
  }

  async function handleDelete() {
    if (!confirm('Delete this account?')) return;
    await supabase.from('accounts').delete().eq('id', account.id);
    onSaved();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>Edit Account</h2>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>@{account.username} · {account.role}</div>
        <label>Name</label>
        <input value={name} onChange={e => setName(e.target.value)} />
        <label>New Password (leave blank to keep)</label>
        <input value={password} onChange={e => setPassword(e.target.value)} placeholder="New password" />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} style={{ width: 'auto', marginBottom: 0 }} />
          Active
        </label>
        <div className="modal-actions">
          <button
            onClick={handleDelete}
            style={{ marginRight: 'auto', background: '#fdecea', color: '#8b1a1a', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}
          >
            Delete
          </button>
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
