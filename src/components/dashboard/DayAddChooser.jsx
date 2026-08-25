import { IconPlay, IconTrophy, IconClipboard, IconCalendar } from '../Icons';

// The compact chooser that opens when a calendar day is tapped in edit mode.
//
// It only PICKS a type — every option then hands off to the app's existing
// creation flow with the tapped date pre-seeded, so nothing about how these
// four things are created or saved lives here:
//
//   game       → AddGameModal        → `schedule`
//   tournament → AddTournamentModal  → `tournaments`
//   practice   → AddCalendarEventModal (type practice) → localStorage
//   event      → AddCalendarEventModal (type event)    → localStorage
//
// Accents match the calendar legend, so the colour you pick is the colour the
// item appears in on the grid. Tournament and Event legitimately share amber —
// that is what TYPES in CalendarWidget already says — so the icons carry the
// distinction.
const OPTIONS = [
  {
    key: 'game',
    label: 'Game',
    desc: 'A scheduled match',
    accent: '#58a6ff',
    Icon: IconPlay,
  },
  {
    key: 'tournament',
    label: 'Tournament',
    desc: 'One event, many games',
    accent: '#f0a500',
    Icon: IconTrophy,
  },
  {
    key: 'practice',
    label: 'Practice',
    desc: 'A training session',
    accent: '#22d3c5',
    Icon: IconClipboard,
  },
  {
    key: 'event',
    label: 'Event',
    desc: 'Meeting or other',
    accent: '#f0a500',
    Icon: IconCalendar,
  },
];

function dayLabel(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

export default function DayAddChooser({ date, onPick, onClose }) {
  if (!date) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content dash-dayadd"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Add to ${dayLabel(date)}`}
      >
        <div className="dash-dayadd-head">
          <span className="dash-dayadd-kicker">Add to</span>
          <h2 className="dash-dayadd-date">{dayLabel(date)}</h2>
        </div>

        <div className="dash-dayadd-grid">
          {OPTIONS.map(opt => (
            <button
              key={opt.key}
              type="button"
              className="dash-dayadd-opt"
              style={{ '--opt-accent': opt.accent }}
              onClick={() => onPick(opt.key)}
            >
              <span className="dash-dayadd-opt-icon"><opt.Icon size={18} /></span>
              <span className="dash-dayadd-opt-body">
                <span className="dash-dayadd-opt-label">{opt.label}</span>
                <span className="dash-dayadd-opt-desc">{opt.desc}</span>
              </span>
            </button>
          ))}
        </div>

        <button type="button" className="dash-dayadd-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
