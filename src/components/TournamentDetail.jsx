import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../contexts/DataContext';
import { sortByJersey } from '../utils/sort';
import { getActiveSession } from '../utils/liveSession';
import {
  tournamentGames, tournamentRecord, tournamentDateLabel, tournamentRoster,
  quickAddTournamentGame, deleteTournamentGame, gameStatus, isTBD, TBD,
} from '../utils/tournaments';
import { IconPencil, IconTrash, IconPlus, IconChart, IconPlay, IconRotate } from './Icons';
import PlayerBadge from './PlayerBadge';

const STATUS_TEXT = {
  live: 'Live',
  final: 'Final',
  noresult: 'No result',
  upcoming: 'Upcoming',
};

// The tournament view — one component opened from every surface that lists a
// tournament (StatsPal schedule, dashboard schedule widget, dashboard calendar),
// so there is exactly one place that knows how a tournament's games are added,
// edited, launched and counted.
//
// It owns no game data of its own: games are derived from the shared
// schedule/completed_games state on every render, so adds and deletes show up
// here and everywhere else the moment refresh() resolves.
export default function TournamentDetail({
  tournament,
  team,
  isAdmin,
  onStartLive,     // schedule row → StatsPal live tracking
  onGameplan,      // schedule row → RotationPal gameplan builder
  onSelectGame,    // completed game → box score
  onEditGame,
  onOpenStats,
  onDeleteTournament,
  refresh,
}) {
  const { players, schedule, completedGames } = useData();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null); // game pending removal
  const [deleting, setDeleting] = useState(false);
  const [activeSession, setActiveSession] = useState(null);
  // Inline "with opponent" composer — a field in the page, not another modal.
  const [composing, setComposing] = useState(false);
  const [newOpponent, setNewOpponent] = useState('');
  const opponentRef = useRef(null);

  // Which game (if any) StatsPal is tracking right now — drives the Live badge.
  useEffect(() => {
    let cancelled = false;
    getActiveSession(team.id).then(({ data }) => {
      if (!cancelled) setActiveSession(data || null);
    });
    return () => { cancelled = true; };
  }, [team.id, schedule, completedGames]);

  useEffect(() => {
    if (composing) opponentRef.current?.focus();
  }, [composing]);

  const games = useMemo(
    () => tournamentGames(tournament.id, schedule, completedGames),
    [tournament.id, schedule, completedGames]
  );

  const roster = useMemo(() => {
    const teamPlayers = sortByJersey((players || []).filter(p => p.team_id === team.id));
    return tournamentRoster(tournament, teamPlayers);
  }, [players, team.id, tournament]);

  const { w, l } = tournamentRecord(games);
  const played = games.filter(g => g._kind === 'completed').length;

  // Both add paths run through here — the only difference is whether an
  // opponent name came with it. Blank falls back to the TBD placeholder.
  async function addGame(opponent) {
    if (adding) return;
    setAdding(true);
    setError('');
    const { error: err } = await quickAddTournamentGame({ tournament, games, opponent });
    setAdding(false);
    if (err) {
      console.error('Add tournament game failed:', err);
      setError(
        /tournament_id|tournament_game_no|schema cache|does not exist/i.test(err.message || '')
          ? 'Tournament columns are missing — run scripts/tournaments_migration.sql in Supabase.'
          : (err.message || 'Could not add game')
      );
      return;
    }
    setComposing(false);
    setNewOpponent('');
    refresh();
  }

  function handleComposerKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); addGame(newOpponent); }
    if (e.key === 'Escape') { setComposing(false); setNewOpponent(''); }
  }

  async function handleDeleteGame() {
    if (!confirmDelete || deleting) return;
    setDeleting(true);
    const { error: err } = await deleteTournamentGame(confirmDelete);
    setDeleting(false);
    if (err) {
      setError(err.message || 'Could not remove game');
      return;
    }
    setConfirmDelete(null);
    refresh();
  }

  return (
    <div className="trn-detail">

      {/* ── Hero header ── */}
      <header className="trn-hero">
        <span className="trn-hero-eyebrow">Tournament</span>
        <h2 className="trn-hero-name">{tournament.name}</h2>
        <p className="trn-hero-meta">
          {tournamentDateLabel(tournament)}
          {tournament.location && <> &middot; {tournament.location}</>}
        </p>

        <div className="trn-stats">
          <span className="trn-stat">
            <span className="trn-stat-val">{games.length}</span>
            <span className="trn-stat-key">{games.length === 1 ? 'Game' : 'Games'}</span>
          </span>
          <span className="trn-stat">
            <span className="trn-stat-val">{played}</span>
            <span className="trn-stat-key">Played</span>
          </span>
          <span className="trn-stat">
            <span className="trn-stat-val">{games.length - played}</span>
            <span className="trn-stat-key">To play</span>
          </span>
          {played > 0 && (
            <span className="trn-stat trn-stat-accent">
              <span className="trn-stat-val">{w}–{l}</span>
              <span className="trn-stat-key">Record</span>
            </span>
          )}
        </div>
      </header>

      {/* ── Roster left, games right. Stacks on mobile, games first. ── */}
      <div className="trn-body">

        <aside className="trn-side">
          <h3 className="trn-side-title">Roster</h3>
          {roster.length === 0 ? (
            <p className="trn-side-empty">No players</p>
          ) : (
            <ul className="trn-players">
              {roster.map(p => (
                <li key={p.id} className="trn-player">
                  <PlayerBadge player={p} team={team} size={22} />
                  <span className="trn-player-name">{p.name}</span>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="trn-main">
          <section className="trn-sec">
            <div className="trn-sec-head">
              <h3 className="trn-sec-title">Games</h3>
              {games.length > 0 && (
                <button type="button" className="trn-textbtn trn-textbtn-icon" onClick={onOpenStats}>
                  <IconChart size={13} />
                  Tournament stats
                </button>
              )}
            </div>

            {games.length === 0 && (
              <p className="trn-empty">
                No games yet. Add one below — an opponent is optional, games show as
                “{TBD}” until you know who you’re playing.
              </p>
            )}

            <div className="trn-cards">
              {games.map(g => {
                const status = gameStatus(g, activeSession);
                const completed = g._kind === 'completed';
                const tbd = isTBD(g.opponent);
                return (
                  <article key={`${g._kind}-${g.id}`} className={`trn-card trn-card-${status}`}>
                    <div className="trn-card-top">
                      <button
                        type="button"
                        className="trn-card-title"
                        onClick={completed && g.result ? () => onSelectGame(g) : () => onEditGame(g)}
                        title={completed && g.result ? 'Open box score' : 'Edit this game'}
                      >
                        {tbd ? <span className="trn-card-tbd">{TBD}</span> : g.opponent}
                      </button>

                      <div className="trn-card-outcome">
                        {completed && g.home_sets != null && g.away_sets != null && (
                          <span className="trn-card-score">{g.home_sets}–{g.away_sets}</span>
                        )}
                        {completed && g.result && (
                          <span className={`game-result-badge ${g.result === 'W' ? 'win' : 'loss'}`}>{g.result}</span>
                        )}
                        <span className={`trn-badge trn-badge-${status}`}>
                          {status === 'live' && <span className="trn-badge-dot" />}
                          {STATUS_TEXT[status]}
                        </span>
                      </div>
                    </div>

                    <div className="trn-card-meta">
                      Game {g.tournament_game_no || '—'}
                      {g.game_date && <> &middot; {g.game_date}</>}
                      {g.location && <> &middot; {g.location}</>}
                    </div>

                    {isAdmin && (
                      <div className="trn-card-actions">
                        {!completed && (
                          <>
                            <button type="button" className="trn-act trn-act-primary" onClick={() => onStartLive(g)}>
                              <IconPlay size={12} />
                              {status === 'live' ? 'Resume' : 'StatsPal'}
                            </button>
                            <button type="button" className="trn-act" onClick={() => onGameplan(g)}>
                              <IconRotate size={12} />
                              RotationPal
                            </button>
                          </>
                        )}
                        <span className="trn-card-gap" />
                        <button
                          type="button"
                          className="trn-ico"
                          onClick={() => onEditGame(g)}
                          aria-label={`Edit game ${g.tournament_game_no || ''}`}
                          title="Edit"
                        >
                          <IconPencil size={13} />
                        </button>
                        <button
                          type="button"
                          className="trn-ico trn-ico-danger"
                          onClick={() => setConfirmDelete(g)}
                          aria-label={`Remove game ${g.tournament_game_no || ''}`}
                          title="Remove"
                        >
                          <IconTrash size={13} />
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}

              {/* Add sits as the last card in the list, so the primary action is
                  always exactly where the eye already is. */}
              {isAdmin && (
                composing ? (
                  <div className="trn-card trn-addcard trn-addcard-open">
                    <input
                      ref={opponentRef}
                      className="trn-input"
                      value={newOpponent}
                      onChange={e => setNewOpponent(e.target.value)}
                      onKeyDown={handleComposerKey}
                      placeholder="Opponent name"
                      aria-label="Opponent name"
                    />
                    <div className="trn-addcard-btns">
                      <button
                        type="button"
                        className="trn-act trn-act-primary"
                        onClick={() => addGame(newOpponent)}
                        disabled={adding || !newOpponent.trim()}
                      >
                        {adding ? 'Adding…' : 'Add game'}
                      </button>
                      <button
                        type="button"
                        className="trn-act"
                        onClick={() => { setComposing(false); setNewOpponent(''); }}
                        disabled={adding}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="trn-card trn-addcard">
                    <button
                      type="button"
                      className="trn-addcard-main"
                      onClick={() => addGame('')}
                      disabled={adding}
                    >
                      <IconPlus size={15} />
                      {adding ? 'Adding…' : 'Add game'}
                    </button>
                    <button
                      type="button"
                      className="trn-act"
                      onClick={() => setComposing(true)}
                      disabled={adding}
                    >
                      With opponent
                    </button>
                  </div>
                )
              )}
            </div>

            {error && <p className="trn-error">{error}</p>}
          </section>

          {/* ── Remove-game confirm ── */}
          {confirmDelete && (
            <div className="trn-confirm">
              <p className="trn-confirm-text">
                Remove <strong>Game {confirmDelete.tournament_game_no || '?'}</strong>
                {!isTBD(confirmDelete.opponent) && <> vs {confirmDelete.opponent}</>}?
                {confirmDelete._kind === 'completed' && ' Its player stats will be deleted too.'}
                {' '}This cannot be undone.
              </p>
              <div className="trn-confirm-actions">
                <button type="button" className="trn-act trn-act-danger" onClick={handleDeleteGame} disabled={deleting}>
                  {deleting ? 'Removing…' : 'Remove game'}
                </button>
                <button type="button" className="trn-act" onClick={() => setConfirmDelete(null)} disabled={deleting}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {isAdmin && onDeleteTournament && (
        <footer className="trn-foot">
          <button type="button" className="trn-textbtn trn-textbtn-danger" onClick={() => onDeleteTournament(tournament)}>
            Delete this tournament
          </button>
        </footer>
      )}
    </div>
  );
}
