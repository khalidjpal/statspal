import { useMemo, useState } from 'react';
import { IconCalendar, IconTrophy } from '../Icons';
import { removeEvent } from '../../utils/teamEvents';
import { tournamentDays, dayPosition, tournamentGames, tournamentDateLabel, isTBD } from '../../utils/tournaments';
import PastGameDetailPopup from './PastGameDetailPopup';

// Each variant maps to a `.dash-cal-bar-${variant}` CSS class and also feeds
// the legend + detail-popup tag label. Game variants are derived from the
// completed/scheduled state.
const TYPES = {
  'tournament':    { label: 'Tournament', dot: '#f0a500' },
  'game':          { label: 'Upcoming',  dot: '#58a6ff' },
  'game-win':      { label: 'Win',       dot: '#3fb950' },
  'game-loss':     { label: 'Loss',      dot: '#f85149' },
  'game-noresult': { label: 'No Result', dot: '#8b949e' },
  'practice':      { label: 'Practice',  dot: '#22d3c5' },
  'event':         { label: 'Event',     dot: '#f0a500' },
};
// Order shown in the legend.
const LEGEND_ORDER = ['tournament', 'game', 'game-win', 'game-loss', 'game-noresult', 'practice', 'event'];

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
// A tournament day carries the event bar plus its games, so leave room for the
// span bar on top of the usual two.
const MAX_BARS = 3;

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

// Format a "HH:MM" 24-h string as "h:MM AM/PM". Returns '' if not set.
function fmt12(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h)) return '';
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m || 0).padStart(2, '0')} ${ampm}`;
}
// Render the start–end range when both are set, otherwise just start.
function eventTimeRange(e) {
  if (e.startTime && e.endTime) return `${fmt12(e.startTime)} – ${fmt12(e.endTime)}`;
  if (e.startTime) return fmt12(e.startTime);
  return '';
}

function eventTitle(e) {
  if (e.type === 'practice') {
    const t = eventTimeRange(e);
    return t ? `Practice ${t}` : (e.title || 'Practice');
  }
  if (e.type === 'game') return e.title;
  return e.title || 'Event';
}

export default function CalendarWidget({
  team, schedule, completedGames, events, tournaments = [],
  onEventsChanged, onOpenStatsPal, onOpenRotationPal, onOpenTournament,
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

    const teamTournaments = (tournaments || []).filter(t => t.team_id === team.id);
    const tournamentById = new Map(teamTournaments.map(t => [t.id, t]));

    // Tournament span: one bar on EVERY day the event covers, so a Sep 12–13
    // tournament reads as a block rather than a single dot on the 12th.
    for (const t of teamTournaments) {
      const games = tournamentGames(t.id, schedule, completedGames);
      for (const date of tournamentDays(t)) {
        push(date, {
          id: `trn-${t.id}-${date}`,
          type: 'tournament',
          title: t.name,
          date,
          tournament: t,
          span: dayPosition(t, date),
          gameCount: games.length,
          location: t.location || '',
          readonly: true,
        });
      }
    }

    // A tournament game keeps its own bar on its own day — "Game 3 · TBD"
    // rather than a bare "vs TBD" — so a day's games stay visible under the
    // tournament span.
    const gameTitle = (g) => {
      const t = g.tournament_id ? tournamentById.get(g.tournament_id) : null;
      if (!t) return `vs ${g.opponent}`;
      const no = g.tournament_game_no ? `G${g.tournament_game_no}` : 'Game';
      return isTBD(g.opponent) ? `${no} · TBD` : `${no} · vs ${g.opponent}`;
    };

    // Scheduled games: blue if today/upcoming, gray if the date has passed
    // without a result being entered.
    for (const g of schedule) {
      if (g.team_id !== team.id) continue;
      const variant = g.game_date < todayStr ? 'game-noresult' : 'game';
      push(g.game_date, {
        id: `sched-${g.id}`,
        type: variant,
        title: gameTitle(g),
        opponent: g.opponent,
        location: g.location || '',
        date: g.game_date,
        readonly: true,
        tournament: g.tournament_id ? tournamentById.get(g.tournament_id) || null : null,
        tournamentGameNo: g.tournament_game_no || null,
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
        title: gameTitle(g),
        opponent: g.opponent,
        location: g.location || '',
        date: g.game_date,
        result: g.result,
        home_sets: g.home_sets,
        away_sets: g.away_sets,
        readonly: true,
        completed: true,
        tournament: g.tournament_id ? tournamentById.get(g.tournament_id) || null : null,
        tournamentGameNo: g.tournament_game_no || null,
      });
    }
    for (const e of events) push(e.date, e);

    // Tournament spans sort first so they stay visible when a busy day
    // overflows into "+N more".
    for (const date of Object.keys(map)) {
      map[date].sort((a, b) => (a.type === 'tournament' ? 0 : 1) - (b.type === 'tournament' ? 0 : 1));
    }

    return map;
  }, [team.id, schedule, completedGames, events, tournaments]);

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

  // A tournament bar goes straight to the tournament view rather than a
  // read-only detail popup — same destination as clicking it in the schedule.
  function pickEvent(e) {
    if (e.type === 'tournament' && onOpenTournament) {
      setActiveEvent(null);
      onOpenTournament(e.tournament);
      return;
    }
    setActiveEvent(e);
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
                      className={[
                        'dash-cal-bar',
                        `dash-cal-bar-${e.type}`,
                        e.span ? `dash-cal-span dash-cal-span-${e.span}` : '',
                        e.tournament && e.type !== 'tournament' ? 'dash-cal-bar-inturn' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => pickEvent(e)}
                      title={e.type === 'tournament'
                        ? `${e.title} · ${tournamentDateLabel(e.tournament)} · ${e.gameCount} ${e.gameCount === 1 ? 'game' : 'games'}`
                        : eventTitle(e)}
                    >
                      {e.type === 'tournament' && (
                        <IconTrophy size={10} className="dash-cal-bar-trophy" />
                      )}
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
            onOpenTournament={onOpenTournament && activeEvent.tournament
              ? () => { const t = activeEvent.tournament; setActiveEvent(null); onOpenTournament(t); }
              : null}
          />
        )
      )}
      {activeEvent?.__overflow && (
        <DayListPopup
          date={activeEvent.date}
          list={activeEvent.list}
          onClose={() => setActiveEvent(null)}
          onPick={pickEvent}
        />
      )}
    </div>
  );
}

function EventDetailPopup({ event, onClose, onRemove, onOpenTournament }) {
  const t = TYPES[event.type] || TYPES.event;
  const d = parseYMD(event.date);
  const dateLabel = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content dash-cal-detail" onClick={e => e.stopPropagation()}>
        <div className={`dash-cal-detail-tag dash-cal-bar-${event.type}`}>{t.label}</div>
        <h2 className="dash-cal-detail-title">{event.title}</h2>
        <div className="dash-cal-detail-date">{dateLabel}</div>

        {event.tournament && (
          <button type="button" className="dash-cal-detail-trnlink" onClick={onOpenTournament}>
            <IconTrophy size={14} />
            {event.tournament.name}
            {event.tournamentGameNo ? ` · Game ${event.tournamentGameNo}` : ''}
            <span className="dash-cal-detail-trnlink-go">Open tournament ›</span>
          </button>
        )}

        <div className="dash-cal-detail-grid">
          {(event.startTime || event.endTime) && (
            <div className="dash-cal-detail-row">
              <span className="dash-cal-detail-lbl">Time</span>
              <span className="dash-cal-detail-val">
                {eventTimeRange(event) || fmt12(event.endTime)}
              </span>
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
