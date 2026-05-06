import { useState } from 'react';
import { addEvent } from '../../utils/teamEvents';

const TYPE_LABELS = {
  practice: 'Practice',
  event: 'Event',
};

export default function AddCalendarEventModal({ teamId, defaultType = 'practice', onClose, onSaved }) {
  const [type, setType] = useState(defaultType);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  function handleSave() {
    if (!title.trim() || !date) return;
    setSaving(true);
    addEvent(teamId, {
      type,
      title: title.trim(),
      date,
      startTime: startTime || null,
      location: location.trim() || null,
      notes: notes.trim() || null,
    });
    setSaving(false);
    onSaved && onSaved();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <h2>Add {TYPE_LABELS[type] || 'Event'}</h2>

        <label>Type</label>
        <div className="dash-modal-segment">
          <button
            type="button"
            className={`dash-modal-seg-btn${type === 'practice' ? ' active' : ''}`}
            onClick={() => setType('practice')}
          >Practice</button>
          <button
            type="button"
            className={`dash-modal-seg-btn${type === 'event' ? ' active' : ''}`}
            onClick={() => setType('event')}
          >Other Event</button>
        </div>

        <label>Title *</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={type === 'practice' ? 'e.g. Team practice' : 'e.g. Tournament, meeting'}
          autoFocus
        />

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label>Date *</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label>Start Time</label>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
          </div>
        </div>

        <label>Location</label>
        <input
          value={location}
          onChange={e => setLocation(e.target.value)}
          placeholder="e.g. Main Gym"
        />

        <label>Notes</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Optional details"
          rows={3}
          style={{
            width: '100%', padding: '12px 14px',
            background: 'rgba(88,166,255,0.04)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text)', fontFamily: 'inherit', fontSize: 14,
            resize: 'vertical', boxSizing: 'border-box', marginBottom: 14,
          }}
        />

        <div className="modal-actions">
          <button className="modal-btn-cancel" type="button" onClick={onClose}>Cancel</button>
          <button
            className="modal-btn-primary"
            type="button"
            onClick={handleSave}
            disabled={saving || !title.trim() || !date}
          >
            {saving ? 'Saving…' : `Add ${TYPE_LABELS[type]}`}
          </button>
        </div>
      </div>
    </div>
  );
}
