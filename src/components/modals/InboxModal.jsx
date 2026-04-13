import { useState, useEffect } from 'react';
import { supabase } from '../../supabase';

export default function InboxModal({ currentUser, onClose, onUnreadChange }) {
  const [messages, setMessages] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  useEffect(() => {
    fetchMessages();
  }, [currentUser.id]); // eslint-disable-line

  async function fetchMessages() {
    setLoading(true);
    setFetchError('');
    const { data, error } = await supabase
      .from('message_recipients')
      .select('id, read, read_at, messages(id, subject, body, sender_name, created_at)')
      .eq('account_id', currentUser.id);

    if (error) {
      setFetchError(error.message);
      setLoading(false);
      return;
    }

    const rows = (data || [])
      .filter(r => r.messages)
      .sort((a, b) => new Date(b.messages.created_at) - new Date(a.messages.created_at));

    setMessages(rows);
    if (onUnreadChange) onUnreadChange(rows.filter(r => !r.read).length);
    setLoading(false);
  }

  async function openMessage(recipient) {
    setSelected(recipient);
    if (!recipient.read) {
      await supabase
        .from('message_recipients')
        .update({ read: true, read_at: new Date().toISOString() })
        .eq('id', recipient.id);
      setMessages(prev => prev.map(m => m.id === recipient.id ? { ...m, read: true } : m));
      if (onUnreadChange) {
        const newUnread = messages.filter(m => !m.read && m.id !== recipient.id).length;
        onUnreadChange(newUnread);
      }
    }
  }

  const unreadCount = messages.filter(m => !m.read).length;

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        {selected ? (
          <>
            <button
              onClick={() => setSelected(null)}
              style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 14 }}
            >
              ← Back to Inbox
            </button>
            <h2 style={{ fontSize: 17, marginBottom: 4 }}>{selected.messages.subject}</h2>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 18 }}>
              From {selected.messages.sender_name} · {formatDate(selected.messages.created_at)}
            </div>
            <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
              {selected.messages.body}
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 17, display: 'flex', alignItems: 'center', gap: 8 }}>
                Inbox
                {unreadCount > 0 && (
                  <span style={{ fontSize: 11, background: '#ef4444', color: '#fff', borderRadius: 20, padding: '2px 7px', fontWeight: 700 }}>
                    {unreadCount}
                  </span>
                )}
              </h2>
              <button className="modal-btn-cancel" onClick={onClose} style={{ padding: '6px 14px' }}>Close</button>
            </div>

            {fetchError && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#ef4444' }}>
                Error: {fetchError}
              </div>
            )}

            {loading ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 14 }}>Loading...</div>
            ) : messages.length === 0 ? (
              <div className="empty-state">No messages yet</div>
            ) : messages.map(r => (
              <div
                key={r.id}
                onClick={() => openMessage(r)}
                style={{
                  padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 8,
                  background: r.read ? 'var(--surface)' : 'rgba(59,130,246,0.08)',
                  border: `1px solid ${r.read ? 'var(--border)' : 'rgba(59,130,246,0.25)'}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                    {!r.read && (
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3b82f6', flexShrink: 0, display: 'inline-block' }} />
                    )}
                    <span style={{ fontWeight: r.read ? 500 : 700, fontSize: 14, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.messages.subject}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                    {new Date(r.messages.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, marginLeft: r.read ? 0 : 13 }}>
                  From {r.messages.sender_name}
                </div>
                <div style={{
                  fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, marginLeft: r.read ? 0 : 13,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {r.messages.body}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
