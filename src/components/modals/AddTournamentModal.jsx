import { useState } from 'react';
import { supabase } from '../../supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { sortByJersey } from '../../utils/sort';
import PlayerBadge from '../PlayerBadge';

// Create a tournament: a container for a day/event's worth of games with one
// shared roster. Games are added afterwards from the tournament card — a
// tournament starts empty on purpose, because you rarely know the schedule yet.
export default function AddTournamentModal({ team, onClose, onSaved }) {
  const { currentUser } = useAuth();
  const { players } = useData();

  const teamPlayers = sortByJersey((players || []).filter(p => p.team_id === team.id));

  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState('');
  const [location, setLocation] = useState('');
  // Shared roster — everyone on by default; uncheck whoever isn't on the trip.
  const [selected, setSelected] = useState(() => teamPlayers.map(p => p.id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function toggle(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  const allOn = selected.length === teamPlayers.length && teamPlayers.length > 0;

  async function handleSave() {
    if (!name.trim() || !startDate || saving) return;
    setSaving(true);
    setError('');

    const payload = {
      team_id: team.id,
      name: name.trim(),
      start_date: startDate,
      end_date: endDate || null,
      location: location.trim() || null,
      roster: selected,
      created_by: currentUser?.id || null,
    };

    const { data, error: err } = await supabase.from('tournaments').insert(payload).select().single();
    if (err) {
      console.error('Tournament insert failed:', err);
      setError(
        /relation .* does not exist|schema cache/i.test(err.message || '')
          ? 'The tournaments table is missing — run scripts/tournaments_migration.sql in Supabase first.'
          : (err.message || 'Failed to create tournament')
      );
      setSaving(false);
      return;
    }

    setSaving(false);
    onSaved && onSaved(data);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content trn-modal" onClick={e => e.stopPropagation()}>
        <h2>Add Tournament</h2>
        <p className="trn-modal-hint">
          One event, one shared roster. Add its games afterwards — you can quick-add blank
          games and fill in opponents as the day unfolds.
        </p>

        {error && <div className="login-error" style={{ marginBottom: 12 }}>{error}</div>}

        <label>Tournament Name *</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Fall Classic"
          autoFocus
        />

        <div className="trn-field-row">
          <div>
            <label>Start Date *</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <label>End Date</label>
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={e => setEndDate(e.target.value)}
            />
          </div>
        </div>
        <div className="trn-field-note">Leave the end date blank for a single-day event.</div>

        <label>Location</label>
        <input
          value={location}
          onChange={e => setLocation(e.target.value)}
          placeholder="Optional — venue or host"
        />

        <div className="trn-roster-head">
          <label style={{ margin: 0 }}>
            Shared Roster <span className="trn-roster-count">({selected.length} of {teamPlayers.length})</span>
          </label>
          {teamPlayers.length > 0 && (
            <button
              type="button"
              className="trn-roster-toggle"
              onClick={() => setSelected(allOn ? [] : teamPlayers.map(p => p.id))}
            >
              {allOn ? 'Clear all' : 'Select all'}
            </button>
          )}
        </div>
        <div className="trn-field-note">Every game in this tournament uses this roster.</div>

        {teamPlayers.length === 0 ? (
          <div className="empty-state" style={{ padding: '16px 0' }}>No players on this roster</div>
        ) : (
          <div className="trn-roster-grid">
            {teamPlayers.map(p => {
              const on = selected.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`trn-roster-item${on ? ' on' : ''}`}
                  onClick={() => toggle(p.id)}
                >
                  <PlayerBadge player={p} team={team} size={28} />
                  <span className="trn-roster-name">{p.name}</span>
                  <span className="trn-roster-check">{on ? '✓' : ''}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="modal-actions">
          <button className="modal-btn-cancel" type="button" onClick={onClose}>Cancel</button>
          <button
            className="modal-btn-primary"
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim() || !startDate}
          >
            {saving ? 'Creating…' : 'Create Tournament'}
          </button>
        </div>
      </div>
    </div>
  );
}
