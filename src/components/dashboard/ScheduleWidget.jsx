import { useMemo, useRef, useLayoutEffect } from 'react';
import { IconCalendar, IconArrowRight, IconTrophy } from '../Icons';
import { useData } from '../../contexts/DataContext';
import { tournamentGames, tournamentRecord, tournamentDateLabel } from '../../utils/tournaments';

function formatDateParts(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return {
    month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    day: d.getDate(),
    dow: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
  };
}

export default function ScheduleWidget({
  team, schedule, completedGames, onOpenInRotationPal, onOpenTournament,
}) {
  const today = new Date().toISOString().slice(0, 10);
  const { tournaments } = useData();

  const { past, upcoming } = useMemo(() => {
    const teamTournaments = (tournaments || []).filter(t => t.team_id === team.id);
    const tournamentIds = new Set(teamTournaments.map(t => t.id));
    const inTournament = g => !!g.tournament_id && tournamentIds.has(g.tournament_id);

    // A tournament shows as ONE row here — four loose "TBD" rows would drown
    // out the rest of the schedule in a widget this size. The full breakdown
    // lives on the tournament card in StatsPal.
    const teamSchedule = schedule.filter(g => g.team_id === team.id && !inTournament(g));
    const teamCompleted = completedGames.filter(g => g.team_id === team.id && !inTournament(g));

    const tournamentItems = teamTournaments.map(t => {
      const games = tournamentGames(t.id, schedule, completedGames);
      const { w, l } = tournamentRecord(games);
      const isPast = String(t.end_date || t.start_date || '') < today;
      return {
        id: `t-${t.id}`,
        raw: t,
        game_date: t.start_date,
        opponent: t.name,
        location: t.location || tournamentDateLabel(t),
        kind: 'tournament',
        isPast,
        gameCount: games.length,
        played: games.filter(g => g._kind === 'completed').length,
        w, l,
      };
    });

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
    const past = [...completedItems, ...pastUnplayed, ...tournamentItems.filter(t => t.isPast)]
      .sort((a, b) => String(a.game_date || '').localeCompare(String(b.game_date || '')));

    const upcoming = [
      ...teamSchedule
        .filter(g => g.game_date >= today)
        .map(g => ({
          id: `s-${g.id}`,
          raw: g,
          game_date: g.game_date,
          opponent: g.opponent,
          location: g.location,
          kind: g.game_date === today ? 'today' : 'upcoming',
        })),
      ...tournamentItems.filter(t => !t.isPast),
    ].sort((a, b) => String(a.game_date || '').localeCompare(String(b.game_date || '')));

    return { past, upcoming };
  }, [team.id, schedule, completedGames, tournaments, today]);

  const empty = past.length === 0 && upcoming.length === 0;
  // Tournament rows stand for several games each, so count their games.
  const gameCount = [...past, ...upcoming]
    .reduce((n, item) => n + (item.kind === 'tournament' ? item.gameCount : 1), 0);
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
        <span className="dash-widget-meta">{gameCount} games</span>
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
                {past.map(g => (
                  <Row
                    key={g.id}
                    game={g}
                    onOpen={g.kind === 'tournament' ? onOpenTournament : onOpenInRotationPal}
                  />
                ))}
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
                    onOpen={g.kind === 'tournament' ? onOpenTournament : onOpenInRotationPal}
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

  // A tournament collapses to a single summary row that opens the tournament
  // view — there's no single game to hand to RotationPal from here.
  if (game.kind === 'tournament') {
    return (
      <button
        type="button"
        className={`dash-sched-row dash-sched-tourn${game.isPast ? ' dash-sched-past' : ''}`}
        onClick={() => onOpen && onOpen(game.raw)}
        title={`Open ${game.opponent}`}
      >
        <div className="dash-sched-date">
          <span className="dash-sched-month">{month}</span>
          <span className="dash-sched-day">{day}</span>
          <span className="dash-sched-dow">{dow}</span>
        </div>
        <div className="dash-sched-mid">
          <div className="dash-sched-opp dash-sched-opp-trn">
            <IconTrophy size={12} />{game.opponent}
          </div>
          <div className="dash-sched-loc">
            {game.gameCount} {game.gameCount === 1 ? 'game' : 'games'}
            {game.location && ` · ${game.location}`}
          </div>
        </div>
        <div className="dash-sched-right">
          {game.played > 0 ? (
            <span className="dash-sched-score">{game.w}–{game.l}</span>
          ) : (
            <span className="dash-sched-pill">TOURNAMENT</span>
          )}
          <span className="dash-sched-open" aria-hidden="true"><IconArrowRight size={12} /></span>
        </div>
      </button>
    );
  }

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
