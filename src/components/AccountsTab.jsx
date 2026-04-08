import { useState } from 'react';
import { supabase } from '../supabase';
import EditAccountModal from './modals/EditAccountModal';
import CoachLoginModal from './modals/CoachLoginModal';
import PlayerLoginModal from './modals/PlayerLoginModal';
import CredsModal from './modals/CredsModal';

export default function AccountsTab({ team, accounts, players, refresh }) {
  const [showCoach, setShowCoach] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const [editAccount, setEditAccount] = useState(null);
  const [creds, setCreds] = useState(null);

  const teamAccounts = accounts.filter(a => a.team_id === team.id);

  async function toggleActive(acc) {
    await supabase.from('accounts').update({ active: !acc.active }).eq('id', acc.id);
    refresh();
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className="modal-btn-primary" onClick={() => setShowCoach(true)} style={{ flex: 1 }}>
          + Coach Login
        </button>
        <button className="modal-btn-primary" onClick={() => setShowPlayer(true)} style={{ flex: 1 }}>
          + Player Login
        </button>
      </div>

      {teamAccounts.length === 0 ? (
        <div className="empty-state">No accounts yet</div>
      ) : (
        teamAccounts.map(acc => (
          <div key={acc.id} className="game-row" onClick={() => setEditAccount(acc)}>
            <div>
              <div style={{ fontWeight: 600 }}>{acc.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                @{acc.username} · {acc.role} {!acc.active && ' · Inactive'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span
                style={{
                  fontSize: 11,
                  padding: '4px 8px',
                  borderRadius: 12,
                  background: acc.active ? '#e8f5e9' : '#fdecea',
                  color: acc.active ? '#1a5c2a' : '#8b1a1a',
                  fontWeight: 600,
                }}
              >
                {acc.active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        ))
      )}

      {showCoach && (
        <CoachLoginModal
          teamId={team.id}
          onClose={() => setShowCoach(false)}
          onCreated={(c) => { setShowCoach(false); setCreds(c); refresh(); }}
        />
      )}
      {showPlayer && (
        <PlayerLoginModal
          teamId={team.id}
          players={players.filter(p => p.team_id === team.id)}
          existingAccounts={teamAccounts}
          onClose={() => setShowPlayer(false)}
          onCreated={(c) => { setShowPlayer(false); setCreds(c); refresh(); }}
        />
      )}
      {editAccount && (
        <EditAccountModal
          account={editAccount}
          onClose={() => setEditAccount(null)}
          onSaved={() => { setEditAccount(null); refresh(); }}
        />
      )}
      {creds && (
        <CredsModal creds={creds} onClose={() => setCreds(null)} />
      )}
    </div>
  );
}
