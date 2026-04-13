import { useState } from 'react';
import { supabase } from '../../supabase';

export default function ComposeMessageModal({ team, accounts, coachAssignments, currentUser, onClose, onSent }) {
  const [recipientType, setRecipientType] = useState('team');
  const [selectedIds, setSelectedIds] = useState([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  // Player accounts on this team
  const teamPlayerAccounts = accounts.filter(a => a.role === 'player' && a.team_id === team.id);

  // Coach accounts on this team
  const coachIds = new Set([
    ...accounts.filter(a => a.role === 'coach' && a.team_id === team.id).map(a => a.id),
    ...(coachAssignments || []).filter(ca => ca.team_id === team.id).map(ca => ca.account_id),
  ]);
  const teamCoachAccounts = accounts.filter(a => coachIds.has(a.id));

  function toggleId(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleSend() {
    if (!body.trim()) { setError('Message body is required'); return; }
    setSending(true);
    setError('');

    // Insert the message first
    const { data: msg, error: msgErr } = await supabase
      .from('messages')
      .insert({
        team_id: team.id,
        sender_id: currentUser.id,
        sender_name: currentUser.name || currentUser.username,
        subject: subject.trim() || '(No Subject)',
        body: body.trim(),
        recipient_type: recipientType,
      })
      .select()
      .single();

    if (msgErr) { setError(msgErr.message); setSending(false); return; }

    // Determine recipient account ids — query directly so we always get current active accounts
    let recipientIds = [];
    if (recipientType === 'team') {
      const { data: accs } = await supabase
        .from('accounts')
        .select('id')
        .eq('team_id', team.id)
        .eq('role', 'player')
        .eq('active', true);
      recipientIds = (accs || []).map(a => a.id);
    } else if (recipientType === 'coaches') {
      recipientIds = [...coachIds]; // coachIds computed from props above
    } else {
      recipientIds = selectedIds;
    }

    if (recipientIds.length > 0) {
      const { error: recErr } = await supabase.from('message_recipients').insert(
        recipientIds.map(id => ({ message_id: msg.id, account_id: id, read: false }))
      );
      if (recErr) {
        console.error('[Compose] recipients insert error:', recErr.message);
        setError('Message sent but failed to deliver to recipients: ' + recErr.message);
        setSending(false);
        return;
      }
    } else {
      console.warn('[Compose] no recipients for type:', recipientType);
      setError('No recipients found. Make sure players have active accounts on this team.');
      setSending(false);
      return;
    }

    setSending(false);
    onSent();
  }

  const TYPES = [
    { key: 'team', label: 'Whole Team' },
    { key: 'coaches', label: 'Coaching Staff' },
    { key: 'select', label: 'Select Players' },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>Send Message</h2>
        {error && <div className="login-error">{error}</div>}

        <label>To</label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {TYPES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setRecipientType(key); setSelectedIds([]); }}
              style={{
                padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: '1px solid var(--border)',
                background: recipientType === key ? 'var(--accent)' : 'var(--surface)',
                color: recipientType === key ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {recipientType === 'select' && (
          <div style={{
            maxHeight: 160, overflowY: 'auto',
            border: '1px solid var(--border)', borderRadius: 8,
            padding: '8px 12px', marginBottom: 14,
          }}>
            {teamPlayerAccounts.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No player accounts on this team</div>
            ) : teamPlayerAccounts.map(a => (
              <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(a.id)}
                  onChange={() => toggleId(a.id)}
                  style={{ width: 'auto', marginBottom: 0 }}
                />
                <span style={{ fontWeight: 500 }}>{a.name}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>@{a.username}</span>
              </label>
            ))}
          </div>
        )}

        <label>Subject</label>
        <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject (optional)" />

        <label>Message *</label>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Type your message..."
          rows={5}
          style={{ resize: 'vertical', fontFamily: 'inherit' }}
        />

        <div className="modal-actions">
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button
            className="modal-btn-primary"
            onClick={handleSend}
            disabled={sending || !body.trim() || (recipientType === 'select' && selectedIds.length === 0)}
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
