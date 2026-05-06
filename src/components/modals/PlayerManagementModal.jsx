import { useMemo, useState } from 'react';
import { supabase } from '../../supabase';
import { useData } from '../../contexts/DataContext';
import { pColors, mkInit } from '../../utils/colors';
import { sortByJersey } from '../../utils/sort';
import { readSecondaryMap, setSecondary as setPlayerSecondary } from '../../utils/playerSecondary';

// Primary positions stored as full strings to match existing StatsPal data.
const PRIMARY_POSITIONS = [
  '',
  'Setter',
  'Outside Hitter',
  'Middle Blocker',
  'Right Side',
  'Opposite',
  'Libero',
  'Defensive Specialist',
];

// Secondary positions use the short codes already used by the dashboard widget.
const SECONDARY_POSITIONS = [
  { code: '',   label: '— None' },
  { code: 'S',  label: 'S — Setter' },
  { code: 'OH', label: 'OH — Outside Hitter' },
  { code: 'MB', label: 'MB — Middle Blocker' },
  { code: 'RS', label: 'RS — Right Side' },
  { code: 'L',  label: 'L — Libero' },
  { code: 'DS', label: 'DS — Defensive Specialist' },
];

// Map a full primary string → short code for compact display.
function shortCode(position) {
  if (!position) return '—';
  const p = position.toLowerCase();
  if (p.includes('setter')) return 'S';
  if (p.includes('outside')) return 'OH';
  if (p.includes('middle')) return 'MB';
  if (p === 'right side' || p.includes('right side') || p === 'opposite' || p.includes('opposite')) return 'RS';
  if (p.includes('libero')) return 'L';
  if (p.includes('defensive')) return 'DS';
  return '—';
}

function splitName(name) {
  if (!name) return { firstName: '', lastName: '' };
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export default function PlayerManagementModal({ team, onClose, initialEdit = null }) {
  const { players, refresh } = useData();
  // Resolve the initial editing target. The parent may pass a player object
  // directly, the string 'new' to open the add form, or null to land on the
  // list view. We resolve through `players` so a stale prop still surfaces a
  // fresh row from the DataContext.
  const initialTarget = useMemo(() => {
    if (!initialEdit) return null;
    if (initialEdit === 'new') return 'new';
    const fresh = players.find(p => p.id === initialEdit.id);
    return fresh || initialEdit;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [editing, setEditing] = useState(initialTarget); // null | 'new' | playerObject
  const [secondaryVersion, setSecondaryVersion] = useState(0);

  const teamPlayers = useMemo(
    () => sortByJersey(players.filter(p => p.team_id === team.id)),
    [players, team.id]
  );
  const secondaryMap = useMemo(
    () => { secondaryVersion; return readSecondaryMap(team.id); },
    [team.id, secondaryVersion]
  );

  async function handleDelete(player) {
    if (!confirm(`Remove ${player.name} from the roster? This cannot be undone.`)) return;
    await supabase.from('players').delete().eq('id', player.id);
    setPlayerSecondary(team.id, player.id, '');
    setSecondaryVersion(v => v + 1);
    await refresh();
  }

  function handleSaved() {
    setEditing(null);
    setSecondaryVersion(v => v + 1);
    refresh();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content roster-mgr"
        onClick={e => e.stopPropagation()}
      >
        <button className="modal-close roster-mgr-close" onClick={onClose} aria-label="Close">✕</button>

        <div className="roster-mgr-head">
          <h2 className="roster-mgr-title">Edit Roster</h2>
          <div className="roster-mgr-team">
            <span className="roster-mgr-team-label">Team</span>
            <span className="roster-mgr-team-name">{team.name}</span>
          </div>
        </div>

        {editing ? (
          <PlayerEditForm
            team={team}
            player={editing === 'new' ? null : editing}
            playerCount={teamPlayers.length}
            secondaryMap={secondaryMap}
            onSaved={handleSaved}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <>
            <div className="roster-mgr-actions">
              <button
                type="button"
                className="modal-btn-primary roster-mgr-add"
                onClick={() => setEditing('new')}
              >
                + Add Player
              </button>
              <span className="roster-mgr-count">{teamPlayers.length} players</span>
            </div>

            {teamPlayers.length === 0 ? (
              <div className="roster-mgr-empty">
                <div>No players on this roster yet.</div>
                <div>Click "+ Add Player" to get started.</div>
              </div>
            ) : (
              <ul className="roster-mgr-list">
                {teamPlayers.map(p => {
                  const primary = shortCode(p.position);
                  const secondary = secondaryMap[p.id];
                  const roleText = [primary !== '—' ? primary : null, secondary]
                    .filter(Boolean)
                    .join(' / ') || '—';
                  return (
                    <li key={p.id} className="roster-mgr-row">
                      <span className="roster-mgr-jersey">
                        {p.jersey_number ? `#${p.jersey_number}` : '—'}
                      </span>
                      <span className="roster-mgr-name" title={p.name}>{p.name}</span>
                      <span className="roster-mgr-role">{roleText}</span>
                      <div className="roster-mgr-row-actions">
                        <button
                          type="button"
                          className="roster-mgr-edit"
                          onClick={() => setEditing(p)}
                        >Edit</button>
                        <button
                          type="button"
                          className="roster-mgr-delete"
                          onClick={() => handleDelete(p)}
                          aria-label={`Delete ${p.name}`}
                        >×</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PlayerEditForm({ team, player, playerCount, secondaryMap, onSaved, onCancel }) {
  const isNew = !player;
  const initialNames = splitName(player?.name || '');
  const [firstName, setFirstName] = useState(initialNames.firstName);
  const [lastName, setLastName] = useState(initialNames.lastName);
  const [jersey, setJersey] = useState(player?.jersey_number || '');
  const [primary, setPrimary] = useState(player?.position || '');
  const [secondary, setSecondary] = useState(player ? (secondaryMap[player.id] || '') : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');

  async function handleSave() {
    if (!fullName) {
      setError('First name is required.');
      return;
    }
    setSaving(true);
    setError('');
    if (isNew) {
      const colors = pColors(playerCount);
      const { data, error: err } = await supabase.from('players').insert({
        team_id: team.id,
        name: fullName,
        initials: mkInit(fullName),
        position: primary || null,
        jersey_number: jersey || null,
        colors,
        player_index: playerCount,
      }).select().single();
      if (err) {
        setSaving(false);
        setError(err.message || 'Failed to add player.');
        return;
      }
      // Save secondary using the new player ID
      if (data && secondary) {
        setPlayerSecondary(team.id, data.id, secondary);
      }
    } else {
      const { error: err } = await supabase.from('players').update({
        name: fullName,
        initials: mkInit(fullName),
        position: primary || null,
        jersey_number: jersey || null,
      }).eq('id', player.id);
      if (err) {
        setSaving(false);
        setError(err.message || 'Failed to update player.');
        return;
      }
      // Secondary always writes (empty string clears it)
      setPlayerSecondary(team.id, player.id, secondary);
    }
    setSaving(false);
    onSaved();
  }

  return (
    <div className="roster-mgr-form">
      <div className="roster-mgr-form-title">
        {isNew ? 'Add New Player' : `Edit ${player.name}`}
      </div>

      {error && <div className="login-error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="roster-mgr-form-row">
        <div style={{ flex: 1 }}>
          <label>First Name *</label>
          <input
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            placeholder="First name"
            autoFocus
          />
        </div>
        <div style={{ flex: 1 }}>
          <label>Last Name</label>
          <input
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            placeholder="Last name"
          />
        </div>
        <div style={{ width: 90 }}>
          <label>Jersey #</label>
          <input
            value={jersey}
            onChange={e => setJersey(e.target.value)}
            placeholder="#"
          />
        </div>
      </div>

      <label>Primary Position</label>
      <select value={primary} onChange={e => setPrimary(e.target.value)}>
        {PRIMARY_POSITIONS.map(p => (
          <option key={p} value={p}>{p || '— Select —'}</option>
        ))}
      </select>

      <label>Secondary Position (optional)</label>
      <select value={secondary} onChange={e => setSecondary(e.target.value)}>
        {SECONDARY_POSITIONS.map(s => (
          <option key={s.code || 'none'} value={s.code}>{s.label}</option>
        ))}
      </select>
      <div className="roster-mgr-hint">
        Secondary position is independent of primary. Adding or changing it will not affect the primary position.
      </div>

      <div className="modal-actions">
        <button className="modal-btn-cancel" type="button" onClick={onCancel}>Cancel</button>
        <button
          className="modal-btn-primary"
          type="button"
          onClick={handleSave}
          disabled={saving || !fullName}
        >
          {saving ? 'Saving…' : isNew ? 'Add Player' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
