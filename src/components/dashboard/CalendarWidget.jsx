import { useMemo, useState } from 'react';
import { IconCalendar } from '../Icons';
import { removeEvent } from '../../utils/teamEvents';
import PastGameDetailPopup from './PastGameDetailPopup';

// Each variant maps to a `.dash-cal-bar-${variant}` CSS class and also feeds
// the legend + detail-popup tag label. Game variants are derived from the
// completed/scheduled state.
const TYPES = {
  'game':          { label: 'Upcoming',  dot: '#58a6ff' },
  'game-win':      { label: 'Win',       dot: '#3fb950' },
  'game-loss':     { label: 'Loss',      dot: '#f85149' },
  'game-noresult': { label: 'No Result', dot: '#8b949e' },
  'practice':      { label: 'Practice',  dot: '#22d3c5' },
  'event':         { label: 'Event',     dot: '#f0a500' },
};
// Order shown in the legend.
const LEGEND_ORDER = ['game', 'game-win', 'game-loss', 'game-noresult', 'practice', 'event'];

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MAX_BARS = 2;

function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseYMD(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function buildMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDow; i++) {
    const d = new Date(year, month, -startDow + i + 1);
    cells.push({ date: d, inMonth: false });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({ date: new Date(year, month, i), inMonth: true });
  }
  const target = cells.length <= 35 ? 35 : 42;
  while (cells.length < target) {
    const next = cells.length - (startDow + daysInMonth) + 1;
    cells.push({ date: new Date(year, month + 1, next), inMonth: false });
  }
  return cells;
}

function eventTitle(e) {
  if (e.type === 'practice') {
    return e.startTime ? `Practice ${e.startTime}` : (e.title || 'Practice');
  }
  if (e.type === 'game') return e.title;
  return e.title || 'Event';
}

export default function CalendarWidget({
  team, schedule, completedGames, events,
  onEventsChanged, onOpenStatsPal, onOpenRotationPal,
}) {
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [activeEvent, setActiveEvent] = useState(null);

  const eventsByDate = useMemo(() => {
    const map = {};
    const push = (date, e) => {
      if (!map[date]) map[date] = [];
      map[date].push(e);
    };
    const todayStr = ymd(new Date());

    // Scheduled games: blue if today/upcoming, gray if the date has passed
    // without a result being entered.
    for (const g of schedule) {
      if (g.team_id !== team.id) continue;
      const variant = g.game_date < todayStr ? 'game-noresult' : 'game';
      push(g.game_date, {
        id: `sched-${g.id}`,
        type: variant,
        title: `vs ${g.opponent}`,
        opponent: g.opponent,
        location: g.location || '',
        date: g.game_date,
        readonly: true,
      });
    }
    // Completed games: green for W, red for L, gray when no result was saved.
    for (const g of completedGames) {
      if (g.team_id !== team.id) continue;
      const variant =
        g.result === 'W' ? 'game-win' :
        g.result === 'L' ? 'game-loss' :
        'game-noresult';
      push(g.game_date, {
        id: `done-${g.id}`,
        type: variant,
        title: `vs ${g.opponent}`,
        opponent: g.opponent,
        location: g.location || '',
        date: g.game_date,
        result: g.result,
        home_sets: g.home_sets,
        away_sets: g.away_sets,
        readonly: true,
        completed: true,
      });
    }
    for (const e of events) push(e.date, e);

    return map;
  }, [team.id, schedule, completedGames, events]);

  const monthLabel = new Date(cursor.year, cursor.month, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const grid = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor]);
  const todayStr = ymd(today);

  function prevMonth() {
    setCursor(c => {
      const m = c.month - 1;
      return m < 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: m };
    });
  }
  function nextMonth() {
    setCursor(c => {
      const m = c.month + 1;
      return m > 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: m };
    });
  }
  function goToday() {
    setCursor({ year: today.getFullYear(), month: today.getMonth() });
  }

  function handleRemove() {
    if (!activeEvent || activeEvent.readonly) return;
    removeEvent(team.id, activeEvent.id);
    setActiveEvent(null);
    onEventsChanged && onEventsChanged();
  }

  return (
    <div className="dash-widget dash-widget-calendar">
      <header className="dash-widget-head">
        <span className="dash-widget-title"><IconCalendar size={13} /> Calendar</span>
        <div className="dash-cal-nav">
          <button className="dash-cal-nav-btn" onClick={prevMonth} aria-label="Previous month">‹</button>
          <button className="dash-cal-nav-month" onClick={goToday}>{monthLabel}</button>
          <button className="dash-cal-nav-btn" onClick={nextMonth} aria-label="Next month">›</button>
        </div>
      </header>

      <div className="dash-widget-body dash-cal-body">
        <div className="dash-cal-dow-row">
          {DOW.map((d, i) => <span key={i} className="dash-cal-dow">{d}</span>)}
        </div>

        <div className="dash-cal-grid">
          {grid.map((cell, i) => {
            const dateStr = ymd(cell.date);
            const dayEvents = eventsByDate[dateStr] || [];
            const isToday = dateStr === todayStr;
            const visible = dayEvents.slice(0, MAX_BARS);
            const overflow = dayEvents.length - visible.length;
            return (
              <div
                key={i}
                className={[
                  'dash-cal-cell',
                  cell.inMonth ? '' : 'dash-cal-cell-out',
                  isToday ? 'dash-cal-cell-today' : '',
                ].filter(Boolean).join(' ')}
              >
                <span className="dash-cal-cell-num">{cell.date.getDate()}</span>
                <div className="dash-cal-cell-bars">
                  {visible.map(e => (
                    <button
                      key={e.id}
                      type="button"
                      className={`dash-cal-bar dash-cal-bar-${e.type}`}
                      onClick={() => setActiveEvent(e)}
                      title={eventTitle(e)}
                    >
                      {eventTitle(e)}
                    </button>
                  ))}
                  {overflow > 0 && (
                    <button
                      type="button"
                      className="dash-cal-bar-more"
                      onClick={() => setActiveEvent({ __overflow: true, date: dateStr, list: dayEvents })}
                    >+{overflow} more</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="dash-cal-legend">
          {LEGEND_ORDER.map(k => (
            <span key={k} className="dash-cal-legend-item">
              <span className={`dash-cal-legend-swatch dash-cal-bar-${k}`} />
              {TYPES[k].label}
            </span>
          ))}
        </div>
      </div>

      {activeEvent && !activeEvent.__overflow && (
        activeEvent.completed ? (
          <PastGameDetailPopup
            event={activeEvent}
            team={team}
            onClose={() => setActiveEvent(null)}
            onOpenStatsPal={onOpenStatsPal}
            onOpenRotationPal={onOpenRotationPal}
          />
        ) : (
          <EventDetailPopup
            event={activeEvent}
            onClose={() => setActiveEvent(null)}
            onRemove={handleRemove}
          />
        )
      )}
      {activeEvent?.__overflow && (
        <DayListPopup
          date={activeEvent.date}
          list={activeEvent.list}
          onClose={() => setActiveEvent(null)}
          onPick={ev => setActiveEvent(ev)}
        />
      )}
    </div>
  );
}

function EventDetailPopup({ event, onClose, onRemove }) {
  const t = TYPES[event.type] || TYPES.event;
  const d = parseYMD(event.date);
  const dateLabel = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content dash-cal-detail" onClick={e => e.stopPropagation()}>
        <div className={`dash-cal-detail-tag dash-cal-bar-${event.type}`}>{t.label}</div>
        <h2 className="dash-cal-detail-title">{event.title}</h2>
        <div className="dash-cal-detail-date">{dateLabel}</div>

        <div className="dash-cal-detail-grid">
          {event.startTime && (
            <div className="dash-cal-detail-row">
              <span className="dash-cal-detail-lbl">Time</span>
              <span className="dash-cal-detail-val">{event.startTime}</span>
            </div>
          )}
          {event.location && (
            <div className="dash-cal-detail-row">
              <span className="dash-cal-detail-lbl">Location</span>
              <span className="dash-cal-detail-val">{event.location}</span>
            </div>
          )}
          {event.opponent && (
            <div className="dash-cal-detail-row">
              <span className="dash-cal-detail-lbl">Opponent</span>
              <span className="dash-cal-detail-val">{event.opponent}</span>
            </div>
          )}
          {event.completed && event.result && (
            <div className="dash-cal-detail-row">
              <span className="dash-cal-detail-lbl">Result</span>
              <span className="dash-cal-detail-val">
                <span className={`dash-cal-result-badge dash-cal-result-${event.result === 'W' ? 'w' : 'l'}`}>
                  {event.result}
                </span>{' '}
                {event.home_sets ?? '—'}–{event.away_sets ?? '—'}
              </span>
            </div>
          )}
          {event.notes && (
            <div className="dash-cal-detail-row">
              <span className="dash-cal-detail-lbl">Notes</span>
              <span className="dash-cal-detail-val dash-cal-detail-notes">{event.notes}</span>
            </div>
          )}
        </div>

        <div className="modal-actions">
          {!event.readonly && (
            <button className="modal-btn-cancel dash-cal-detail-remove" onClick={onRemove}>
              Remove
            </button>
          )}
          <button className="modal-btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function DayListPopup({ date, list, onClose, onPick }) {
  const d = parseYMD(date);
  const label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content dash-cal-detail" onClick={e => e.stopPropagation()}>
        <h2 className="dash-cal-detail-title">{label}</h2>
        <div className="dash-cal-detail-list">
          {list.map(e => {
            const t = TYPES[e.type] || TYPES.event;
            return (
              <button
                key={e.id}
                type="button"
                className={`dash-cal-bar dash-cal-bar-${e.type} dash-cal-detail-list-item`}
                onClick={() => onPick(e)}
              >
                <span className="dash-cal-detail-list-tag">{t.label}</span>
                <span className="dash-cal-detail-list-title">{eventTitle(e)}</span>
              </button>
            );
          })}
        </div>
        <div className="modal-actions">
          <button className="modal-btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
