import { useMemo } from 'react';
import { IconTrophy, IconCalendar, IconClock, IconPin, IconArrowRight } from '../Icons';
import { nextTeamEvent } from '../../utils/teamFormat';
import {
  tournamentGames, tournamentDateLabel, formatGameTime, isTBD,
} from '../../utils/tournaments';
import { todayIsoLocal } from '../../utils/recurrence';

// The club dashboard's top-left panel, in place of Standings.
//
// A club has no league table, so the question the panel answers is "what's
// next?" — the sooner of the next tournament and the next standalone game.
// Clicking it opens that event: the tournament detail view, or the game's
// pre-game screen.
//
// High school teams never render this; they keep StandingsWidget. See
// utils/teamFormat.js.

function dateParts(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return null;
  return {
    month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    day: d.getDate(),
    dow: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
  };
}

// "Today" / "Tomorrow" / "in 5 days" — the panel's whole job is imminence, so
// say it in words rather than making the reader subtract dates.
function countdownLabel(dateStr, today) {
  if (!dateStr) return '';
  if (dateStr <= today) return 'Today';
  const from = new Date(today + 'T00:00:00');
  const to = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return '';
  const days = Math.round((to - from) / 86400000);
  if (days === 1) return 'Tomorrow';
  if (days < 7) return `In ${days} days`;
  if (days < 14) return 'Next week';
  return `In ${Math.round(days / 7)} weeks`;
}

export default function NextUpWidget({
  team, schedule, completedGames, tournaments, onOpenTournament, onOpenGame,
}) {
  const today = todayIsoLocal();

  const next = useMemo(
    () => nextTeamEvent({ team, schedule, tournaments, today }),
    [team, schedule, tournaments, today]
  );

  // Only a tournament needs its games counted, and only once we know it's the
  // event being shown.
  const gameCount = useMemo(() => {
    if (next?.kind !== 'tournament') return 0;
    return tournamentGames(next.tournament.id, schedule, completedGames).length;
  }, [next, schedule, completedGames]);

  const isTournament = next?.kind === 'tournament';
  const startDate = isTournament
    ? next.tournament.start_date
    : next?.game?.game_date;
  const parts = startDate ? dateParts(startDate) : null;

  // A game opens the pre-game screen, which only a coach or admin can act on,
  // so the row is inert for anyone else. A tournament is readable by everyone.
  const handler = isTournament ? onOpenTournament : onOpenGame;
  const clickable = !!next && !!handler;

  function open() {
    if (!clickable) return;
    handler(isTournament ? next.tournament : next.game);
  }

  return (
    <div className="dash-widget dash-widget-nextup">
      <header className="dash-widget-head">
        <span className="dash-widget-title"><IconCalendar size={13} /> Next Up</span>
        {next && (
          <span className="dash-widget-meta">
            {next.inProgress ? 'In progress' : countdownLabel(startDate, today)}
          </span>
        )}
      </header>

      <div className="dash-widget-body dash-nextup-body">
        {!next ? (
          <div className="dash-empty">
            <div className="dash-empty-title">No upcoming events</div>
            <div className="dash-empty-sub">
              Use the + button to add a tournament or a game.
            </div>
          </div>
        ) : (
          <button
            type="button"
            className={`dash-nextup-card${clickable ? '' : ' dash-nextup-static'}`}
            onClick={open}
            disabled={!clickable}
            title={clickable
              ? `Open ${isTournament ? next.tournament.name || 'tournament' : `vs ${next.game.opponent}`}`
              : undefined}
          >
            <div className="dash-nextup-date">
              {parts ? (
                <>
                  <span className="dash-nextup-month">{parts.month}</span>
                  <span className="dash-nextup-day">{parts.day}</span>
                  <span className="dash-nextup-dow">{parts.dow}</span>
                </>
              ) : (
                <span className="dash-nextup-tbd">TBD</span>
              )}
            </div>

            <div className="dash-nextup-mid">
              <div className="dash-nextup-kind">
                {isTournament ? <IconTrophy size={11} /> : null}
                {isTournament ? 'TOURNAMENT' : 'GAME'}
              </div>

              <div className="dash-nextup-name">
                {isTournament
                  ? (next.tournament.name || 'Tournament')
                  : (isTBD(next.game.opponent) ? 'Opponent TBD' : `vs ${next.game.opponent}`)}
              </div>

              <div className="dash-nextup-lines">
                {isTournament ? (
                  <>
                    <span className="dash-nextup-line">
                      <IconCalendar size={11} />
                      {tournamentDateLabel(next.tournament)}
                    </span>
                    {next.tournament.location && (
                      <span className="dash-nextup-line">
                        <IconPin size={11} />
                        {next.tournament.location}
                      </span>
                    )}
                    <span className="dash-nextup-line">
                      <IconTrophy size={11} />
                      {gameCount} {gameCount === 1 ? 'game' : 'games'}
                    </span>
                  </>
                ) : (
                  <>
                    {formatGameTime(next.game.game_time) && (
                      <span className="dash-nextup-line">
                        <IconClock size={11} />
                        {formatGameTime(next.game.game_time)}
                      </span>
                    )}
                    {next.game.court && (
                      <span className="dash-nextup-line">
                        <IconPin size={11} />
                        {next.game.court}
                      </span>
                    )}
                    {next.game.location && next.game.location !== 'Neutral' && (
                      <span className="dash-nextup-line">
                        <IconPin size={11} />
                        {next.game.location}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>

            {clickable && (
              <span className="dash-nextup-arrow" aria-hidden="true">
                <IconArrowRight size={13} />
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
