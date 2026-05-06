import { useMemo, useRef, useLayoutEffect } from 'react';
import { IconCalendar, IconArrowRight } from '../Icons';

function formatDateParts(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return {
    month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    day: d.getDate(),
    dow: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
  };
}

export default function ScheduleWidget({
  team, schedule, completedGames, onOpenInRotationPal,
}) {
  const today = new Date().toISOString().slice(0, 10);

  const { past, upcoming } = useMemo(() => {
    const teamSchedule = schedule.filter(g => g.team_id === team.id);
    const teamCompleted = completedGames.filter(g => g.team_id === team.id);

    const completedItems = teamCompleted.map(g => ({
      id: `c-${g.id}`,
      raw: g,
      game_date: g.game_date,
      opponent: g.opponent,
      location: g.location,
      kind: 'completed',
      result: g.result,
      home_sets: g.home_sets,
      away_sets: g.away_sets,
    }));
    const pastUnplayed = teamSchedule
      .filter(g => g.game_date < today)
      .map(g => ({
        id: `s-${g.id}`,
        raw: g,
        game_date: g.game_date,
        opponent: g.opponent,
        location: g.location,
        kind: 'past-noresult',
      }));
    // Past: oldest at top, most recent just above the upcoming divider so the
    // user lands on something close to "now" when we auto-scroll to it.
    const past = [...completedItems, ...pastUnplayed]
      .sort((a, b) => a.game_date.localeCompare(b.game_date));

    const upcoming = teamSchedule
      .filter(g => g.game_date >= today)
      .map(g => ({
        id: `s-${g.id}`,
        raw: g,
        game_date: g.game_date,
        opponent: g.opponent,
        location: g.location,
        kind: g.game_date === today ? 'today' : 'upcoming',
      }))
      .sort((a, b) => a.game_date.localeCompare(b.game_date));

    return { past, upcoming };
  }, [team.id, schedule, completedGames, today]);

  const empty = past.length === 0 && upcoming.length === 0;
  const scrollRef = useRef(null);
  const nextRef = useRef(null);

  // On mount and when the list changes, jump straight to the next upcoming
  // game so the user immediately sees what's coming up. useLayoutEffect avoids
  // a paint flash from an initial "scrolled to top" frame.
  useLayoutEffect(() => {
    const container = scrollRef.current;
    const anchor = nextRef.current;
    if (!container) return;
    if (!anchor) {
      // No upcoming games — show the most recent past game (bottom of past list).
      container.scrollTop = container.scrollHeight;
      return;
    }
    // Land the next-game anchor about 25% from the top so a few past games
    // remain visible above for context.
    const peek = Math.round(container.clientHeight * 0.25);
    container.scrollTop = Math.max(0, anchor.offsetTop - peek);
  }, [team.id, past.length, upcoming.length]);

  return (
    <div className="dash-widget dash-widget-schedule">
      <header className="dash-widget-head">
        <span className="dash-widget-title"><IconCalendar size={13} /> Schedule</span>
        <span className="dash-widget-meta">{past.length + upcoming.length} games</span>
      </header>

      <div ref={scrollRef} className="dash-widget-body dash-sched-scroll">
        {empty ? (
          <div className="dash-empty">
            <div className="dash-empty-title">No games yet</div>
            <div className="dash-empty-sub">Use the + button to add a game.</div>
          </div>
        ) : (
          <>
            {past.length > 0 && (
              <div className="dash-sched-section">
                <div className="dash-sched-section-title">PAST · {past.length}</div>
                {past.map(g => <Row key={g.id} game={g} onOpen={onOpenInRotationPal} />)}
              </div>
            )}

            {upcoming.length > 0 && (
              <div ref={nextRef} className="dash-sched-divider"><span>UPCOMING · {upcoming.length}</span></div>
            )}

            {upcoming.length > 0 && (
              <div className="dash-sched-section">
                {upcoming.map((g, i) => (
                  <Row
                    key={g.id}
                    game={g}
                    onOpen={onOpenInRotationPal}
                    highlight={i === 0}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Row({ game, onOpen, highlight }) {
  const { month, day, dow } = formatDateParts(game.game_date);
  const isToday = game.kind === 'today';
  const isPast = game.kind === 'completed' || game.kind === 'past-noresult';
  const hasResult = game.kind === 'completed' && game.result;

  return (
    <div
      className={[
        'dash-sched-row',
        isToday ? 'dash-sched-today' : '',
        isPast ? 'dash-sched-past' : '',
        highlight && !isToday ? 'dash-sched-next' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="dash-sched-date">
        <span className="dash-sched-month">{month}</span>
        <span className="dash-sched-day">{day}</span>
        <span className="dash-sched-dow">{dow}</span>
      </div>
      <div className="dash-sched-mid">
        <div className="dash-sched-opp">vs {game.opponent}</div>
        <div className="dash-sched-loc">{game.location || '—'}</div>
      </div>
      <div className="dash-sched-right">
        {hasResult ? (
          <>
            {game.home_sets != null && game.away_sets != null && (
              <span className="dash-sched-score">{game.home_sets}–{game.away_sets}</span>
            )}
            <span className={`dash-sched-badge dash-sched-${game.result === 'W' ? 'w' : 'l'}`}>
              {game.result}
            </span>
          </>
        ) : isToday ? (
          <span className="dash-sched-pill dash-sched-pill-today">TODAY</span>
        ) : isPast ? (
          <span className="dash-sched-pill dash-sched-pill-muted">NO RESULT</span>
        ) : highlight ? (
          <span className="dash-sched-pill dash-sched-pill-next">NEXT</span>
        ) : (
          <span className="dash-sched-pill">UPCOMING</span>
        )}
        <button
          type="button"
          className="dash-sched-open"
          onClick={() => onOpen && onOpen(game.raw)}
          aria-label="Open in RotationPal"
          title="Open in RotationPal"
        >
          <IconArrowRight size={12} />
        </button>
      </div>
    </div>
  );
}
