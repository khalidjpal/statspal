import { useMemo, useState } from 'react';
import { addEvent } from '../../utils/teamEvents';
import {
  expandRule,
  todayIsoLocal, fromIso,
} from '../../utils/recurrence';

const TYPE_LABELS = {
  practice: 'Practice',
  event: 'Event',
};

const DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function AddCalendarEventModal({ teamId, defaultType = 'practice', onClose, onSaved }) {
  const [type, setType] = useState(defaultType);
  const [title, setTitle] = useState('');

  // Recurrence: single / range (start+end+weekdays) / manual (multi-select).
  const initialDate = todayIsoLocal();
  const [recurMode, setRecurMode] = useState('single');
  const [date, setDate] = useState(initialDate);
  const [rangeStart, setRangeStart] = useState(initialDate);
  const [rangeEnd, setRangeEnd] = useState(initialDate);
  // Default weekday selection = same weekday as today (so "every Monday"
  // is one tap away). 0=Sun ... 6=Sat.
  const [days, setDays] = useState(() => [new Date().getDay()]);
  const [manualDates, setManualDates] = useState([initialDate]);

  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Build the in-flight rule for preview + final expansion.
  const rule = useMemo(() => {
    if (recurMode === 'single') return { mode: 'single', date };
    if (recurMode === 'range') return { mode: 'range', start: rangeStart, end: rangeEnd, days };
    return { mode: 'manual', dates: manualDates };
  }, [recurMode, date, rangeStart, rangeEnd, days, manualDates]);
  const occurrences = useMemo(() => expandRule(rule), [rule]);
  const previewCount = occurrences.length;

  const timesValid = !startTime || !endTime || endTime > startTime;
  const canSave =
    !!title.trim() &&
    timesValid &&
    previewCount > 0 &&
    (recurMode !== 'range' || (rangeStart <= rangeEnd && days.length > 0));

  function handleSave() {
    if (!canSave) return;
    setSaving(true);
    // Expand to one localStorage event per date. All occurrences share a
    // seriesId so a future "delete series" / "edit series" patch has the
    // join key already in place.
    const seriesId = previewCount > 1
      ? `ser-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      : null;
    for (const isoDate of occurrences) {
      addEvent(teamId, {
        type,
        title: title.trim(),
        date: isoDate,
        startTime: startTime || null,
        endTime: endTime || null,
        location: location.trim() || null,
        notes: notes.trim() || null,
        ...(seriesId ? { seriesId } : {}),
      });
    }
    setSaving(false);
    onSaved && onSaved();
  }

  function toggleDay(d) {
    setDays(prev => (prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort()));
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 520, maxHeight: '92vh', overflowY: 'auto' }}
      >
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

        <label style={{ marginTop: 14 }}>When</label>
        <div className="dash-modal-segment" style={{ marginBottom: 10 }}>
          <button
            type="button"
            className={`dash-modal-seg-btn${recurMode === 'single' ? ' active' : ''}`}
            onClick={() => setRecurMode('single')}
          >Single date</button>
          <button
            type="button"
            className={`dash-modal-seg-btn${recurMode === 'range' ? ' active' : ''}`}
            onClick={() => setRecurMode('range')}
          >Repeats</button>
          <button
            type="button"
            className={`dash-modal-seg-btn${recurMode === 'manual' ? ' active' : ''}`}
            onClick={() => setRecurMode('manual')}
          >Pick dates</button>
        </div>

        {recurMode === 'single' && (
          <div>
            <label>Date *</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        )}

        {recurMode === 'range' && (
          <>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label>Start date *</label>
                <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label>End date *</label>
                <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} />
              </div>
            </div>
            <label style={{ marginTop: 8 }}>Repeat on</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {DOW_LABELS.map((l, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDay(i)}
                  title={DOW_NAMES[i]}
                  style={{
                    width: 36, height: 36,
                    borderRadius: '50%',
                    border: `1px solid ${days.includes(i) ? 'rgba(88,166,255,0.55)' : 'rgba(255,255,255,0.10)'}`,
                    background: days.includes(i)
                      ? 'linear-gradient(135deg, #38bdf8, #0369a1)'
                      : 'rgba(255,255,255,0.04)',
                    color: days.includes(i) ? '#fff' : '#8b949e',
                    fontWeight: 800,
                    fontSize: 12,
                    cursor: 'pointer',
                    transition: 'all 0.12s ease',
                  }}
                >{l}</button>
              ))}
            </div>
          </>
        )}

        {recurMode === 'manual' && (
          <ManualDatePicker dates={manualDates} onChange={setManualDates} />
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
          <div style={{ flex: 1 }}>
            <label>Start Time</label>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label>End Time</label>
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
          </div>
        </div>
        {!timesValid && (
          <div style={{
            marginTop: 6, padding: '6px 10px',
            background: 'rgba(248,81,73,0.10)',
            border: '1px solid rgba(248,81,73,0.30)',
            borderRadius: 6,
            color: '#ff8a82', fontSize: 12,
          }}>
            End time must be after start time.
          </div>
        )}

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

        <div style={{
          padding: '8px 12px',
          background: previewCount === 0 ? 'rgba(248,81,73,0.10)' : 'rgba(56,189,248,0.10)',
          border: `1px solid ${previewCount === 0 ? 'rgba(248,81,73,0.30)' : 'rgba(56,189,248,0.30)'}`,
          color: previewCount === 0 ? '#ff8a82' : '#7dd3fc',
          borderRadius: 7,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.04em',
          textAlign: 'center',
          marginBottom: 12,
        }}>
          {previewCount === 0
            ? 'No occurrences — pick at least one date.'
            : `Will create ${previewCount} occurrence${previewCount === 1 ? '' : 's'}`}
        </div>

        <div className="modal-actions">
          <button className="modal-btn-cancel" type="button" onClick={onClose}>Cancel</button>
          <button
            className="modal-btn-primary"
            type="button"
            onClick={handleSave}
            disabled={saving || !canSave}
          >
            {saving
              ? 'Saving…'
              : (previewCount > 1
                  ? `Add ${previewCount} ${TYPE_LABELS[type]}s`
                  : `Add ${TYPE_LABELS[type]}`)}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Inline mini-calendar for manual multi-select ───────────────────────────
function ManualDatePicker({ dates, onChange }) {
  const seed = dates[0] ? fromIso(dates[0]) : new Date();
  const [view, setView] = useState({ y: seed.getFullYear(), m: seed.getMonth() });

  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1);
    const firstDow = first.getDay();
    const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
    const arr = [];
    for (let i = 0; i < firstDow; i++) arr.push({ kind: 'blank', key: `b-${i}` });
    for (let d = 1; d <= daysInMonth; d++) {
      const local = new Date(view.y, view.m, d);
      const iso = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
      arr.push({ kind: 'day', key: iso, day: d, iso });
    }
    return arr;
  }, [view]);

  const label = new Date(view.y, view.m, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  function toggleDate(iso) {
    onChange(dates.includes(iso) ? dates.filter(d => d !== iso) : [...dates, iso].sort());
  }
  function shift(delta) {
    setView(v => {
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.025)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 8,
      padding: 10,
      marginBottom: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button type="button" onClick={() => shift(-1)} style={navBtn}>‹</button>
        <span style={{ fontWeight: 800, fontSize: 13, color: '#e6edf3' }}>{label}</span>
        <button type="button" onClick={() => shift(1)} style={navBtn}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {DOW_LABELS.map((l, i) => (
          <span key={i} style={{
            textAlign: 'center', fontSize: 10, fontWeight: 800,
            color: 'rgba(232,238,252,0.45)', letterSpacing: '0.10em',
          }}>{l}</span>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map(c => {
          if (c.kind === 'blank') return <span key={c.key} />;
          const selected = dates.includes(c.iso);
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => toggleDate(c.iso)}
              style={{
                padding: '6px 0',
                background: selected ? 'linear-gradient(135deg, #38bdf8, #0369a1)' : 'transparent',
                border: `1px solid ${selected ? 'rgba(56,189,248,0.6)' : 'rgba(255,255,255,0.05)'}`,
                color: selected ? '#fff' : 'rgba(232,238,252,0.7)',
                borderRadius: 5,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >{c.day}</button>
          );
        })}
      </div>
      {dates.length > 0 && (
        <div style={{
          marginTop: 8, textAlign: 'center',
          fontSize: 11, fontWeight: 700, color: '#7dd3fc',
        }}>
          {dates.length} date{dates.length === 1 ? '' : 's'} selected
        </div>
      )}
    </div>
  );
}

const navBtn = {
  width: 28, height: 28,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 6,
  color: '#c9d1d9',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 700,
};
