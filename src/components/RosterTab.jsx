import { useState } from 'react';
import { sortByJersey } from '../utils/sort';
import PlayerBadge from './PlayerBadge';
import AddPlayerModal from './modals/AddPlayerModal';
import EditAccountModal from './modals/EditAccountModal';
import QuickLoginModal from './modals/QuickLoginModal';
import AssignCoachModal from './modals/AssignCoachModal';
import ComposeMessageModal from './modals/ComposeMessageModal';

export default function RosterTab({ team, players, accounts = [], coachAssignments = [], isAdmin, currentUser, refresh, onSelectPlayer, onOpenInbox, unreadCount = 0 }) {
  const [showAdd, setShowAdd] = useState(false);
  const [assignLoginPlayer, setAssignLoginPlayer] = useState(null);
  const [manageAccount, setManageAccount] = useState(null);
  const [showAssignCoach, setShowAssignCoach] = useState(false);
  const [showCompose, setShowCompose] = useState(false);

  const teamPlayers = sortByJersey(players.filter(p => p.team_id === team.id));

  // Coaches assigned to this team
  const coachIds = new Set([
    ...accounts.filter(a => a.role === 'coach' && a.team_id === team.id).map(a => a.id),
    ...coachAssignments.filter(ca => ca.team_id === team.id).map(ca => ca.account_id),
  ]);
  const coaches = accounts.filter(a => coachIds.has(a.id));

  function playerAccount(playerId) {
    return accounts.find(a => a.player_id === playerId) || null;
  }

  const canMessage = isAdmin || currentUser?.role === 'coach';

  return (
    <div>
      {/* Action bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {isAdmin && (
          <button className="modal-btn-primary" onClick={() => setShowAdd(true)} style={{ flex: 1 }}>
            + Add Player
          </button>
        )}
        {canMessage && (
          <button
            onClick={() => setShowCompose(true)}
            style={{
              flex: 1, padding: '11px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: 'var(--surface)', border: '1px solid var(--border)',
              color: 'var(--text)', cursor: 'pointer',
            }}
          >
            ✉ Send Message
          </button>
        )}
        {onOpenInbox && (
          <button
            onClick={onOpenInbox}
            style={{
              position: 'relative', padding: '11px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: 'var(--surface)', border: '1px solid var(--border)',
              color: 'var(--text)', cursor: 'pointer',
            }}
          >
            Inbox
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: -4, right: -4,
                background: '#ef4444', color: '#fff',
                borderRadius: '50%', width: 18, height: 18,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700,
              }}>
                {unreadCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Coaching Staff */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
          Coaching Staff
        </div>
        {coaches.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '6px 0 10px' }}>No coaches assigned</div>
        ) : coaches.map(c => (
          <div key={c.id} className="game-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'var(--surface)', border: '2px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 15, fontWeight: 700, color: 'var(--text)',
              }}>
                {(c.name || c.username).charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Coach · @{c.username}</div>
              </div>
            </div>
            {isAdmin && (
              <button
                onClick={() => setManageAccount(c)}
                style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 9px', cursor: 'pointer' }}
              >
                Manage
              </button>
            )}
          </div>
        ))}
        {isAdmin && (
          <button
            onClick={() => setShowAssignCoach(true)}
            style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0 10px', fontWeight: 600 }}
          >
            + Assign Coach
          </button>
        )}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--border)', marginBottom: 14 }} />

      {/* Players section header */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
        Players ({teamPlayers.length})
      </div>

      {teamPlayers.length === 0 ? (
        <div className="empty-state">No players on roster yet</div>
      ) : teamPlayers.map(p => {
        const acct = playerAccount(p.id);
        return (
          <div key={p.id} className="game-row" style={{ alignItems: 'center' }}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, cursor: 'pointer', minWidth: 0 }}
              onClick={() => onSelectPlayer(p)}
            >
              <PlayerBadge player={p} team={team} size={40} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {[p.jersey_number ? `#${p.jersey_number}` : null, p.position, p.height, p.grade].filter(Boolean).join(' · ')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                    background: acct ? '#3fb950' : '#6b7280',
                    display: 'inline-block',
                  }} />
                  <span style={{ fontSize: 11, color: acct ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                    {acct ? `@${acct.username}` : 'No login'}
                  </span>
                </div>
              </div>
            </div>
            {isAdmin && (
              <button
                onClick={e => { e.stopPropagation(); acct ? setManageAccount(acct) : setAssignLoginPlayer(p); }}
                style={{
                  fontSize: 11, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', flexShrink: 0,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  color: acct ? 'var(--text-muted)' : 'var(--accent)',
                  fontWeight: acct ? 400 : 600,
                }}
              >
                {acct ? 'Manage' : 'Assign Login'}
              </button>
            )}
          </div>
        );
      })}

      {/* Modals */}
      {showAdd && (
        <AddPlayerModal
          teamId={team.id}
          playerCount={teamPlayers.length}
          schoolType={team.school_type || 'high_school'}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); refresh(); }}
        />
      )}
      {assignLoginPlayer && (
        <QuickLoginModal
          player={assignLoginPlayer}
          teamId={team.id}
          onClose={() => setAssignLoginPlayer(null)}
          onCreated={() => { setAssignLoginPlayer(null); refresh(); }}
        />
      )}
      {manageAccount && (
        <EditAccountModal
          account={manageAccount}
          onClose={() => setManageAccount(null)}
          onSaved={() => { setManageAccount(null); refresh(); }}
        />
      )}
      {showAssignCoach && (
        <AssignCoachModal
          team={team}
          accounts={accounts}
          coachAssignments={coachAssignments}
          onClose={() => setShowAssignCoach(false)}
          onSaved={() => { setShowAssignCoach(false); refresh(); }}
        />
      )}
      {showCompose && currentUser && (
        <ComposeMessageModal
          team={team}
          accounts={accounts}
          coachAssignments={coachAssignments}
          currentUser={currentUser}
          onClose={() => setShowCompose(false)}
          onSent={() => setShowCompose(false)}
        />
      )}
    </div>
  );
}
