import { useState } from 'react';
import {
  tournamentRecord, tournamentDateLabel, isTBD, quickAddTournamentGame,
  gameStatus, TBD,
} from '../utils/tournaments';
import { IconTrophy } from './Icons';

// One tournament rendered inline in the Schedule timeline: a glance at the
// event and its games, with the two things you need mid-tournament right there
// (add a game, launch the next one live).
//
// Anything beyond a glance — the shared roster, editing, stats, deleting —
// lives in the tournament view, which the header opens.
export default function TournamentCard({
  tournament,
  games,
  isAdmin,
  activeSession,
  onOpen,           // open the full tournament view
  onSelectGame,     // completed game → box score
  onStartLive,      // schedule row → StatsPal live tracking
  refresh,
}) {
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const { w, l } = tournamentRecord(games);
  const played = games.filter(g => g._kind === 'completed').length;

  async function handleQuickAdd() {
    if (adding) return;
    setAdding(true);
    setError('');
    const { error: err } = await quickAddTournamentGame({ tournament, games });
    setAdding(false);
    if (err) {
      console.error('Quick-add tournament game failed:', err);
      setError(err.message || 'Could not add game');
      return;
    }
    setOpen(true);
    refresh && refresh();
  }

  return (
    <div className="sch-tourn">
      <div className="sch-tourn-headrow">
        <button
          type="button"
          className="sch-tourn-head"
          onClick={() => onOpen(tournament)}
          title={`Open ${tournament.name}`}
        >
          <IconTrophy size={14} className="sch-tourn-icon" />
          <span className="sch-tourn-headmain">
            <span className="sch-tourn-name">{tournament.name}</span>
            <span className="sch-tourn-meta">
              {tournamentDateLabel(tournament)}
              {tournament.location && ` · ${tournament.location}`}
              {' · '}{games.length} {games.length === 1 ? 'game' : 'games'}
            </span>
          </span>
          {played > 0 && <span className="sch-tourn-record">{w}–{l}</span>}
          <span className="sch-tourn-go">›</span>
        </button>
        <button
          type="button"
          className={`sch-tourn-collapse${open ? ' open' : ''}`}
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          aria-label={open ? 'Collapse games' : 'Expand games'}
        >
          ▾
        </button>
      </div>

      {open && (
        <div className="sch-tourn-body">
          {games.length === 0 ? (
            <div className="sch-tourn-empty">
              No games yet — add one below, or open the tournament for the full view.
            </div>
          ) : (
            games.map(g => {
              const completed = g._kind === 'completed';
              const status = gameStatus(g, activeSession);
              const tbd = isTBD(g.opponent);
              return (
                <div
                  key={`${g._kind}-${g.id}`}
                  className={`sch-tourn-row${completed ? ' is-done' : ''}`}
                  onClick={completed && g.result ? () => onSelectGame(g) : () => onOpen(tournament)}
                  style={{ cursor: 'pointer' }}
                >
                  <span className="sch-tourn-no">
                    {g.tournament_game_no ? `G${g.tournament_game_no}` : '—'}
                  </span>

                  <span className="sch-tourn-opp">
                    {tbd
                      ? <span className="sch-tourn-tbd">{TBD}</span>
                      : <>vs {g.opponent}</>}
                    {g.location && <span className="sch-tourn-loc">{g.location}</span>}
                  </span>

                  <span className="sch-tourn-right">
                    {completed && g.home_sets != null && g.away_sets != null && (
                      <span className="sch-tourn-score">{g.home_sets}–{g.away_sets}</span>
                    )}
                    {completed && g.result && (
                      <span className={`game-result-badge ${g.result === 'W' ? 'win' : 'loss'}`}>{g.result}</span>
                    )}
                    {status === 'live' && (
                      <span className="trn-live"><span className="trn-live-dot" />Live</span>
                    )}
                    {status === 'upcoming' && <span className="sch-tourn-pill">Upcoming</span>}
                    {status === 'noresult' && <span className="sch-tourn-pill">No result</span>}

                    {isAdmin && !completed && (
                      <button
                        type="button"
                        className="sch-tourn-live"
                        onClick={e => { e.stopPropagation(); onStartLive(g); }}
                        title="Track this game live in StatsPal"
                      >
                        {status === 'live' ? 'Resume' : 'StatsPal'}
                      </button>
                    )}
                  </span>
                </div>
              );
            })
          )}

          {error && <div className="sch-tourn-error">{error}</div>}

          <div className="sch-tourn-actions">
            {isAdmin && (
              <button
                type="button"
                className="sch-tourn-add"
                onClick={handleQuickAdd}
                disabled={adding}
              >
                {adding ? 'Adding…' : '+ Add Game'}
              </button>
            )}
            <button type="button" className="sch-tourn-stats" onClick={() => onOpen(tournament)}>
              Open tournament ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
