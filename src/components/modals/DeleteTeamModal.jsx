import { useState } from 'react';
import Modal from '../Modal';
import { IconTrash } from '../Icons';

// Permanent deletion of an archived team — the one action in the app that
// cannot be undone by any other action in the app. Archiving already covers
// "get this out of my way", so the only reason to be here is to destroy the
// data on purpose; the dialog is built to make that deliberate rather than
// quick. It names the team, counts exactly what goes, and stays disabled until
// the team's name is typed back.
export default function DeleteTeamModal({ team, counts, busy, onCancel, onConfirm }) {
  const [typed, setTyped] = useState('');
  const name = team?.name || '';
  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase() && name.trim() !== '';

  const lines = [
    [counts.players, 'player', 'players'],
    [counts.games, 'played game', 'played games'],
    [counts.stats, 'player stat row', 'player stat rows'],
    [counts.scheduled, 'scheduled game', 'scheduled games'],
    [counts.tournaments, 'tournament', 'tournaments'],
  ].filter(([n]) => n > 0);

  return (
    <Modal open onClose={busy ? undefined : onCancel} maxWidth={480}>
      <div className="god-del">
        <div className="god-del-head">
          <span className="god-del-icon"><IconTrash size={16} /></span>
          <div>
            <h2 className="god-del-title">Delete {name}</h2>
            <p className="god-del-sub">This is permanent. It cannot be undone.</p>
          </div>
        </div>

        <div className="god-del-manifest">
          <span className="god-del-manifest-lbl">Deleted forever</span>
          {lines.length === 0 ? (
            <span className="god-del-manifest-empty">This team has no players, games or stats.</span>
          ) : (
            <ul className="god-del-list">
              {lines.map(([n, one, many]) => (
                <li key={one}>
                  <span className="god-del-num">{n}</span> {n === 1 ? one : many}
                </li>
              ))}
            </ul>
          )}
          {counts.accounts > 0 && (
            <p className="god-del-note">
              {counts.accounts} {counts.accounts === 1 ? 'account is' : 'accounts are'} linked to this team.
              {' '}Accounts are kept — they are just detached from it.
            </p>
          )}
        </div>

        <label className="god-del-confirm">
          <span className="god-field-lbl">Type <strong>{name}</strong> to confirm</span>
          <input
            className="god-quickadd-input"
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder={name}
            autoFocus
            disabled={busy}
          />
        </label>

        <div className="god-del-actions">
          <button className="god-btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
          <button
            className="god-btn-danger god-btn-danger-block"
            onClick={onConfirm}
            disabled={!matches || busy}
          >
            {busy ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
