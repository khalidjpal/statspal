import { useState, useEffect } from 'react';
import { supabase } from '../../supabase';

export default function ManageAccountsModal({ teams, onClose, onSaved }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // 'list' | 'create' | 'edit'
  const [editAccount, setEditAccount] = useState(null);
  const [creds, setCreds] = useState(null);

  // Create form
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('coach');
  const [teamId, setTeamId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Edit form
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editTeamId, setEditTeamId] = useState('');
  const [editActive, setEditActive] = useState(true);

  useEffect(() => { fetchAccounts(); }, []);

  async function fetchAccounts() {
    setLoading(true);
    const { data } = await supabase.from('accounts').select('*').order('created_at');
    setAccounts(data || []);
    setLoading(false);
  }

  function openCreate() {
    setName(''); setUsername(''); setPassword(''); setRole('coach'); setTeamId(''); setError('');
    setView('create');
  }

  function openEdit(acc) {
    setEditAccount(acc);
    setEditName(acc.name);
    setEditUsername(acc.username);
    setEditPassword('');
    setEditTeamId(acc.team_id || '');
    setEditActive(acc.active);
    setError('');
    setView('edit');
  }

  async function handleCreate() {
    if (!name.trim() || !username.trim() || !password.trim()) { setError('All fields required'); return; }
    setSaving(true); setError('');
    const payload = {
      name: name.trim(),
      username: username.trim(),
      password_plain: password.trim(),
      role,
      team_id: teamId || null,
      active: true,
    };
    const { error: err } = await supabase.from('accounts').insert(payload);
    setSaving(false);
    if (err) {
      setError(err.message.includes('duplicate') ? 'Username already taken' : err.message);
    } else {
      setCreds({ name: name.trim(), username: username.trim(), password: password.trim(), role });
      await fetchAccounts();
      setView('list');
    }
  }

  async function handleSaveEdit() {
    if (!editName.trim() || !editUsername.trim()) { setError('Name and username required'); return; }
    setSaving(true); setError('');
    const updates = {
      name: editName.trim(),
      username: editUsername.trim(),
      team_id: editTeamId || null,
      active: editActive,
    };
    if (editPassword.trim()) updates.password_plain = editPassword.trim();
    const { error: err } = await supabase.from('accounts').update(updates).eq('id', editAccount.id);
    setSaving(false);
    if (err) {
      setError(err.message.includes('duplicate') ? 'Username already taken' : err.message);
    } else {
      await fetchAccounts();
      setView('list');
      onSaved();
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete account "${editAccount.name}"?`)) return;
    await supabase.from('accounts').delete().eq('id', editAccount.id);
    await fetchAccounts();
    setView('list');
    onSaved();
  }

  function getTeamName(tid) {
    const t = teams.find(t => t.id === tid);
    return t ? t.name : '—';
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 520, maxHeight: '90vh', overflow: 'auto' }}>

        {/* Credentials flash */}
        {creds && (
          <div style={{ background: 'rgba(16,185,129,0.1)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <div style={{ fontWeight: 700, color: '#10b981', marginBottom: 8 }}>Account Created!</div>
            <div style={{ fontSize: 13 }}><strong>Name:</strong> {creds.name}</div>
            <div style={{ fontSize: 13 }}><strong>Username:</strong> {creds.username}</div>
            <div style={{ fontSize: 13 }}><strong>Password:</strong> {creds.password}</div>
            <div style={{ fontSize: 13 }}><strong>Role:</strong> {creds.role}</div>
            <div style={{ fontSize: 11, color: '#ef4444', marginTop: 8 }}>Save these credentials — the password cannot be recovered later.</div>
            <button onClick={() => setCreds(null)} style={{ marginTop: 8, fontSize: 12, background: '#10b981', color: '#fff', padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer' }}>Dismiss</button>
          </div>
        )}

        {/* LIST VIEW */}
        {view === 'list' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0 }}>Manage Accounts</h2>
              <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', fontSize: 20, color: '#8892a4', border: 'none', cursor: 'pointer', borderRadius: 6, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>

            <button onClick={openCreate} className="modal-btn-primary" style={{ width: '100%', marginBottom: 16 }}>
              + Create Account
            </button>

            {loading ? <div className="empty-state">Loading...</div> : (
              accounts.length === 0 ? <div className="empty-state">No accounts</div> : (
                accounts.map(acc => (
                  <div key={acc.id} className="game-row" onClick={() => openEdit(acc)}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{acc.name}</div>
                      <div style={{ fontSize: 12, color: '#8892a4' }}>
                        @{acc.username} · {acc.role}
                        {acc.team_id && ` · ${getTeamName(acc.team_id)}`}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 11, padding: '3px 8px', borderRadius: 12, fontWeight: 600,
                      background: acc.active ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                      color: acc.active ? '#10b981' : '#ef4444',
                    }}>
                      {acc.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                ))
              )
            )}
          </>
        )}

        {/* CREATE VIEW */}
        {view === 'create' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0 }}>Create Account</h2>
              <button onClick={() => setView('list')} style={{ background: 'none', fontSize: 14, color: '#1a3a8f', border: 'none', cursor: 'pointer', fontWeight: 600 }}>← Back</button>
            </div>

            {error && <div className="login-error" style={{ marginBottom: 12 }}>{error}</div>}

            <label>Role</label>
            <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
              {['coach', 'admin'].map(r => (
                <button key={r} type="button" onClick={() => setRole(r)}
                  style={{ flex: 1, padding: 10, fontSize: 13, fontWeight: 600, background: role === r ? '#1a3a8f' : 'rgba(255,255,255,0.04)', color: role === r ? '#fff' : '#8892a4', border: 'none', cursor: 'pointer' }}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>

            <label>Full Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Coach Smith" />

            <label>Username *</label>
            <input value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. coachsmith" />

            <label>Password *</label>
            <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Choose a password" />

            {role === 'coach' && (
              <>
                <label>Assign to Team</label>
                <select value={teamId} onChange={e => setTeamId(e.target.value)}>
                  <option value="">No team assigned</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </>
            )}

            <div className="modal-actions">
              <button className="modal-btn-cancel" onClick={() => setView('list')}>Cancel</button>
              <button className="modal-btn-primary" onClick={handleCreate} disabled={saving}>
                {saving ? 'Creating...' : 'Create Account'}
              </button>
            </div>
          </>
        )}

        {/* EDIT VIEW */}
        {view === 'edit' && editAccount && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0 }}>Edit Account</h2>
              <button onClick={() => setView('list')} style={{ background: 'none', fontSize: 14, color: '#1a3a8f', border: 'none', cursor: 'pointer', fontWeight: 600 }}>← Back</button>
            </div>

            <div style={{ fontSize: 12, color: '#8892a4', marginBottom: 16 }}>Role: {editAccount.role}</div>

            {error && <div className="login-error" style={{ marginBottom: 12 }}>{error}</div>}

            <label>Full Name</label>
            <input value={editName} onChange={e => setEditName(e.target.value)} />

            <label>Username</label>
            <input value={editUsername} onChange={e => setEditUsername(e.target.value)} />

            <label>New Password (leave blank to keep current)</label>
            <input value={editPassword} onChange={e => setEditPassword(e.target.value)} placeholder="New password" />

            {editAccount.role === 'coach' && (
              <>
                <label>Assigned Team</label>
                <select value={editTeamId} onChange={e => setEditTeamId(e.target.value)}>
                  <option value="">No team assigned</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <input type="checkbox" checked={editActive} onChange={e => setEditActive(e.target.checked)} style={{ width: 'auto', marginBottom: 0 }} />
              Account Active
            </label>

            <div className="modal-actions">
              <button onClick={handleDelete}
                style={{ marginRight: 'auto', background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                Delete
              </button>
              <button className="modal-btn-cancel" onClick={() => setView('list')}>Cancel</button>
              <button className="modal-btn-primary" onClick={handleSaveEdit} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
