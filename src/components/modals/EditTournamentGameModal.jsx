import { useState } from 'react';
import { supabase } from '../../supabase';
import { isTBD, TBD } from '../../utils/tournaments';

// Edit one tournament game's details as the day unfolds — most often renaming a
// placeholder "TBD" to the real opponent once the bracket is called.
//
// The row lives in `schedule` while unplayed and in `completed_games` once
// tracked, so the target table comes from game._kind. Score and player stats for
// a completed game are edited with the existing ManualResultModal instead.
export default function EditTournamentGameModal({ game, tournament, onClose, onSaved }) {
  const table = game._kind === 'completed' ? 'completed_games' : 'schedule';

  const [opponent, setOpponent] = useState(isTBD(game.opponent) ? '' : game.opponent || '');
  const [gameDate, setGameDate] = useState(game.game_date || tournament?.start_date || '');
  const [location, setLocation] = useState(game.location || 'Neutral');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setError('');

    const { error: err } = await supabase
      .from(table)
      .update({
        // Blank goes back to the placeholder rather than an empty name.
        opponent: opponent.trim() || TBD,
        game_date: gameDate,
        location,
      })
      .eq('id', game.id);

    setSaving(false);
    if (err) {
      setError(err.message || 'Failed to save');
      return;
    }
    onSaved && onSaved();
  }

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    // Stats first — completed_games has no cascade to player_game_stats.
    if (table === 'completed_games') {
      await supabase.from('player_game_stats').delete().eq('game_id', game.id);
    }
    const { error: err } = await supabase.from(table).delete().eq('id', game.id);
    setDeleting(false);
    if (err) {
      setError(err.message || 'Failed to remove game');
      return;
    }
    onSaved && onSaved();
  }

  const busy = saving || deleting;
  const gameNo = game.tournament_game_no ? `Game ${game.tournament_game_no}` : 'Game';

  return (
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>Edit {gameNo}</h2>
        <p className="trn-modal-hint">
          {tournament?.name}
          {game._kind === 'completed' && ' · already played — score and stats are edited from the box score'}
        </p>

        {error && <div className="login-error" style={{ marginBottom: 12 }}>{error}</div>}

        <label>Opponent</label>
        <input
          value={opponent}
          onChange={e => setOpponent(e.target.value)}
          placeholder={`${TBD} — leave blank until you know`}
          autoFocus
        />

        <div className="trn-field-row">
          <div>
            <label>Date</label>
            <input type="date" value={gameDate} onChange={e => setGameDate(e.target.value)} />
          </div>
          <div>
            <label>Location</label>
            <select value={location} onChange={e => setLocation(e.target.value)}>
              <option>Home</option>
              <option>Away</option>
              <option>Neutral</option>
            </select>
          </div>
        </div>

        {confirmDelete ? (
          <div className="trn-danger-confirm">
            <div className="trn-danger-text">
              Remove {gameNo} from this tournament?
              {game._kind === 'completed' && ' Its player stats will be deleted too.'}
              {' '}This cannot be undone.
            </div>
            <div className="trn-danger-actions">
              <button type="button" className="trn-danger-btn" onClick={handleDelete} disabled={busy}>
                {deleting ? 'Removing…' : 'Yes, remove'}
              </button>
              <button type="button" className="trn-btn-ghost" onClick={() => setConfirmDelete(false)} disabled={busy}>
                Keep it
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="trn-link-danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
            Remove this game
          </button>
        )}

        <div className="modal-actions">
          <button className="modal-btn-cancel" type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="modal-btn-primary" type="button" onClick={handleSave} disabled={busy}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
