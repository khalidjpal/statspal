import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../contexts/DataContext';
import { sortByJersey } from '../utils/sort';
import { getActiveSession } from '../utils/liveSession';
import {
  tournamentGames, tournamentRecord, tournamentDateLabel,
  quickAddTournamentGame, deleteTournamentGame, gameStatus, isTBD, TBD,
  gamePlaceParts, groupGamesByDay, gameDayHeading, gameDateShort, formatGameTime,
} from '../utils/tournaments';
import {
  n3, hcol, pfmt, pcol, hpct, playerTotals, passAvg, aggregatePlayerStats,
} from '../utils/stats';
import {
  IconPencil, IconTrash, IconPlus, IconChart, IconPlay, IconRotate, IconUndo,
  IconHome, IconPin,
} from './Icons';
import PlayerBadge from './PlayerBadge';

// The compact roll-up shown in the right rail. A deliberate subset of the full
// TournamentStatsModal grid — the numbers a coach glances at between games. The
// full 16-column table is one click away via "Full table".
const MINI_COLS = [
  ['k', 'K'], ['h', 'K%'], ['sa', 'SA'], ['r', 'Rec'], ['pass', 'Pass'], ['digs', 'Digs'],
];

const STATUS_TEXT = {
  live: 'Live',
  final: 'Final',
  noresult: 'No result',
  upcoming: 'Upcoming',
};

// One line icon per place bit, so the trailing detail on a fixture row reads at
// a glance without needing its labels spelled out.
const PLACE_ICONS = {
  court: IconPin,
  location: IconHome,
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
  onResetStats,   // completed game → wipe its stats, back to untracked
  onOpenStats,
  onDeleteTournament,
  refresh,
}) {
  const { players, schedule, completedGames, playerGameStats } = useData();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null); // game pending removal
  const [deleting, setDeleting] = useState(false);
  const [activeSession, setActiveSession] = useState(null);
  // Inline "with details" composer — fields in the page, not another modal.
  // Every field is optional; an empty composer add is the same TBD game the
  // one-tap button makes.
  const [composing, setComposing] = useState(false);
  const [newOpponent, setNewOpponent] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newCourt, setNewCourt] = useState('');
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

  // The fixture list runs in playing order, not game-number order, cut into
  // day blocks. A tournament that only ever touches one day yields one block
  // and renders without a day divider — the modal header already names it.
  const dayGroups = useMemo(() => groupGamesByDay(games), [games]);
  const showDayHeadings = dayGroups.length > 1;

  const teamPlayers = useMemo(
    () => sortByJersey((players || []).filter(p => p.team_id === team.id)),
    [players, team.id]
  );

  const { w, l } = tournamentRecord(games);
  const played = games.filter(g => g._kind === 'completed').length;

  // ── Tournament roll-up for the right rail ──
  // Same aggregation the full TournamentStatsModal uses: every stat row from
  // every played game in this tournament, summed per player by
  // aggregatePlayerStats(). Summing the raw counters before dividing is what
  // makes the passing average weighted by receive volume rather than an
  // average of per-game averages — so this panel and the full table always
  // agree.
  const statRows = useMemo(() => {
    const ids = new Set(games.filter(g => g._kind === 'completed').map(g => g.id));
    return (playerGameStats || []).filter(s => ids.has(s.game_id));
  }, [playerGameStats, games]);

  // Driven off the whole team, not the tournament roster: a player who was
  // dropped from the roster after playing still has stats in these games, and
  // the rail must not silently omit numbers the full table would show.
  const statPlayers = useMemo(
    () => teamPlayers
      .map(p => ({ p, a: aggregatePlayerStats(statRows.filter(s => s.player_id === p.id)) }))
      .filter(r => r.a),
    [teamPlayers, statRows]
  );

  const teamAgg = useMemo(() => playerTotals(statRows), [statRows]);
  const hasStats = statRows.length > 0;

  // The headline strip above the per-player table.
  const statSummary = hasStats ? [
    { key: 'K',    val: teamAgg.kills },
    { key: 'K%',   val: n3(hpct(teamAgg.kills, teamAgg.errors, teamAgg.attempts)),
      color: hcol(teamAgg.kills, teamAgg.errors, teamAgg.attempts) },
    { key: 'SA',   val: teamAgg.aces },
    { key: 'Rec',  val: teamAgg.receives },
    { key: 'Pass', val: pfmt(passAvg(teamAgg)), color: pcol(passAvg(teamAgg)) },
    { key: 'Digs', val: teamAgg.digs },
  ] : [];

  // One cell of the mini table — rate stats keep the colour coding they carry
  // everywhere else in the app, errors stay red.
  function miniCell(a, key) {
    if (key === 'h') return <span style={{ color: hcol(a.k, a.e, a.att), fontWeight: 600 }}>{n3(a.h)}</span>;
    if (key === 'pass') return <span style={{ color: pcol(a.pass), fontWeight: 600 }}>{pfmt(a.pass)}</span>;
    return <span>{a[key]}</span>;
  }

  function closeComposer() {
    setComposing(false);
    setNewOpponent('');
    setNewTime('');
    setNewCourt('');
  }

  // Both add paths run through here — the one-tap button passes nothing at all,
  // the composer passes whatever was filled in. Every field is optional: a blank
  // opponent falls back to the TBD placeholder, and a blank time/court is simply
  // left off the row.
  async function addGame({ opponent = '', gameTime = '', court = '' } = {}) {
    if (adding) return;
    setAdding(true);
    setError('');
    const { error: err } = await quickAddTournamentGame({
      tournament, games, opponent, gameTime, court,
    });
    setAdding(false);
    if (err) {
      console.error('Add tournament game failed:', err);
      setError(
        /game_time|court/i.test(err.message || '')
          ? 'Time/court columns are missing — run scripts/game_time_court_migration.sql in Supabase.'
          : /tournament_id|tournament_game_no|schema cache|does not exist/i.test(err.message || '')
            ? 'Tournament columns are missing — run scripts/tournaments_migration.sql in Supabase.'
            : (err.message || 'Could not add game')
      );
      return;
    }
    closeComposer();
    refresh();
  }

  function addFromComposer() {
    addGame({ opponent: newOpponent, gameTime: newTime, court: newCourt });
  }

  function handleComposerKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); addFromComposer(); }
    if (e.key === 'Escape') { closeComposer(); }
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

      {/* ── Games left, tournament stats right. Stacks on mobile, games first.
          The tournament's shared roster is NOT shown here — it still governs
          which players a game starts with (TournamentHost hands it to the
          RotationPal gameplan, PreGame seeds the lineup from it); it just
          isn't a panel in this view. ── */}
      <div className="trn-body">

        <div className="trn-main">
          <section className="trn-sec">
            <div className="trn-sec-head">
              <h3 className="trn-sec-title">Games</h3>
            </div>

            {games.length === 0 && (
              <p className="trn-empty">
                No games yet. Add one below — an opponent is optional, games show as
                “{TBD}” until you know who you’re playing.
              </p>
            )}

            <div className="trn-fixtures">
              {dayGroups.map(day => (
                <Fragment key={day.date || 'undated'}>

                  {/* Day divider — only earns its line on a multi-day event. */}
                  {showDayHeadings && (
                    <div className="trn-fix-day">
                      <span className="trn-fix-day-label">{gameDayHeading(day.date)}</span>
                      <span className="trn-fix-day-rule" />
                      <span className="trn-fix-day-count">
                        {day.games.length} {day.games.length === 1 ? 'game' : 'games'}
                      </span>
                    </div>
                  )}

                  {day.games.map(g => {
                    const status = gameStatus(g, activeSession);
                    const completed = g._kind === 'completed';
                    const tbd = isTBD(g.opponent);
                    const time = formatGameTime(g.game_time);
                    const place = gamePlaceParts(g);
                    return (
                      <article key={`${g._kind}-${g.id}`} className={`trn-fix trn-fix-${status}`}>

                        {/* Column 1 — when. Tabular mono so the times stack into
                            a true column down the list. The compact date only
                            appears where no day divider is carrying it. */}
                        <div className="trn-fix-when">
                          {time
                            ? <span className="trn-fix-time">{time}</span>
                            : <span className="trn-fix-time trn-fix-time-tbd" title="No start time set">—</span>}
                          {!showDayHeadings && g.game_date && (
                            <span className="trn-fix-date">{gameDateShort(g.game_date)}</span>
                          )}
                        </div>

                        {/* Column 2 — who. The opponent is the row's focal
                            point; the game number and court sit around it at a
                            deliberate step down in weight. */}
                        <div className="trn-fix-match">
                          <span className="trn-fix-no">G{g.tournament_game_no || '—'}</span>
                          <button
                            type="button"
                            className="trn-fix-name"
                            onClick={completed && g.result ? () => onSelectGame(g) : () => onEditGame(g)}
                            title={completed && g.result ? 'Open box score' : 'Edit this game'}
                          >
                            <span className="trn-fix-vs">vs</span>
                            {tbd ? <span className="trn-fix-tbd">{TBD}</span> : g.opponent}
                          </button>
                          {place.length > 0 && (
                            <span className="trn-fix-place">
                              {place.map(part => {
                                const Icon = PLACE_ICONS[part.key] || IconPin;
                                return (
                                  <span key={part.key} className="trn-fix-placebit">
                                    <Icon size={10.5} className="trn-fix-placeico" />
                                    {part.text}
                                  </span>
                                );
                              })}
                            </span>
                          )}
                        </div>

                        {/* Column 3 — result, state, and the controls, in that
                            order so the row always ends with the same shape. */}
                        <div className="trn-fix-end">
                          {completed && (g.result || g.home_sets != null) && (
                            <span className="trn-fix-outcome">
                              {g.home_sets != null && g.away_sets != null && (
                                <span className="trn-fix-score">{g.home_sets}–{g.away_sets}</span>
                              )}
                              {g.result && (
                                <span className={`game-result-badge ${g.result === 'W' ? 'win' : 'loss'}`}>{g.result}</span>
                              )}
                            </span>
                          )}
                          <span className={`trn-badge trn-badge-${status}`}>
                            <span className="trn-badge-dot" />
                            {STATUS_TEXT[status]}
                          </span>

                          {isAdmin && (
                            <div className="trn-fix-actions">
                              {!completed && (
                                <>
                                  <button type="button" className="trn-act trn-act-sm trn-act-primary" onClick={() => onStartLive(g)}>
                                    <IconPlay size={10} />
                                    {status === 'live' ? 'Resume' : 'StatsPal'}
                                  </button>
                                  <button type="button" className="trn-act trn-act-sm" onClick={() => onGameplan(g)}>
                                    <IconRotate size={10} />
                                    RotationPal
                                  </button>
                                </>
                              )}
                              {/* Only a played game has stats to clear. */}
                              {completed && onResetStats && (
                                <button
                                  type="button"
                                  className="trn-ico"
                                  onClick={() => onResetStats(g)}
                                  aria-label={`Reset stats for game ${g.tournament_game_no || ''}`}
                                  title="Reset stats"
                                >
                                  <IconUndo size={12} />
                                </button>
                              )}
                              <button
                                type="button"
                                className="trn-ico"
                                onClick={() => onEditGame(g)}
                                aria-label={`Edit game ${g.tournament_game_no || ''}`}
                                title="Edit"
                              >
                                <IconPencil size={12} />
                              </button>
                              <button
                                type="button"
                                className="trn-ico trn-ico-danger"
                                onClick={() => setConfirmDelete(g)}
                                aria-label={`Remove game ${g.tournament_game_no || ''}`}
                                title="Remove"
                              >
                                <IconTrash size={12} />
                              </button>
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </Fragment>
              ))}

              {/* Add closes the schedule, so the primary action is always
                  exactly where the eye already is. */}
              {isAdmin && (
                composing ? (
                  <div className="trn-addcard trn-addcard-open">
                    <input
                      ref={opponentRef}
                      className="trn-input"
                      value={newOpponent}
                      onChange={e => setNewOpponent(e.target.value)}
                      onKeyDown={handleComposerKey}
                      placeholder="Opponent name (optional)"
                      aria-label="Opponent name"
                    />
                    <div className="trn-addcard-row">
                      <input
                        className="trn-input trn-input-time"
                        type="time"
                        value={newTime}
                        onChange={e => setNewTime(e.target.value)}
                        onKeyDown={handleComposerKey}
                        aria-label="Start time (optional)"
                      />
                      <input
                        className="trn-input"
                        value={newCourt}
                        onChange={e => setNewCourt(e.target.value)}
                        onKeyDown={handleComposerKey}
                        placeholder="Court (optional)"
                        aria-label="Court"
                      />
                    </div>
                    <div className="trn-addcard-btns">
                      <button
                        type="button"
                        className="trn-act trn-act-primary"
                        onClick={addFromComposer}
                        disabled={adding}
                      >
                        {adding ? 'Adding…' : 'Add game'}
                      </button>
                      <button
                        type="button"
                        className="trn-act"
                        onClick={closeComposer}
                        disabled={adding}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="trn-addcard">
                    <button
                      type="button"
                      className="trn-addcard-main"
                      onClick={() => addGame()}
                      disabled={adding}
                    >
                      <IconPlus size={13} />
                      {adding ? 'Adding…' : 'Add game'}
                    </button>
                    <button
                      type="button"
                      className="trn-act trn-act-sm"
                      onClick={() => setComposing(true)}
                      disabled={adding}
                    >
                      With details
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

        {/* ── Stats rail, right column ──
            The tournament roll-up as a glanceable panel, so the numbers are
            visible alongside the games instead of only behind a modal. Same
            aggregation as the full table, a narrower set of columns. */}
        <aside className="trn-statsrail">
          <div className="trn-rail-head">
            <h3 className="trn-side-title">Tournament Stats</h3>
            {hasStats && (
              <button type="button" className="trn-textbtn trn-textbtn-icon" onClick={onOpenStats}>
                <IconChart size={12} />
                Full table
              </button>
            )}
          </div>

          {!hasStats ? (
            <p className="trn-side-empty">
              {played === 0
                ? 'No games played yet. Player totals appear here once you track a game with StatsPal.'
                : 'No player stats recorded for this tournament yet.'}
            </p>
          ) : (
            <>
              <div className="trn-railsum">
                {statSummary.map(item => (
                  <div key={item.key} className="trn-railsum-item">
                    <span className="trn-railsum-key">{item.key}</span>
                    <span className="trn-railsum-val" style={item.color ? { color: item.color } : undefined}>
                      {item.val}
                    </span>
                  </div>
                ))}
              </div>

              <div className="trn-railtable-scroll">
                <table className="trn-railtable">
                  <thead>
                    <tr>
                      <th className="trn-railtable-player">Player</th>
                      {MINI_COLS.map(([key, label]) => <th key={key}>{label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {statPlayers.map(({ p, a }) => (
                      <tr key={p.id}>
                        <td className="trn-railtable-player">
                          <PlayerBadge player={p} team={team} size={20} />
                          <span className="trn-railtable-name">{p.name}</span>
                        </td>
                        {MINI_COLS.map(([key]) => <td key={key}>{miniCell(a, key)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="trn-rail-note">
                Combined across {played} {played === 1 ? 'game' : 'games'} · record {w}–{l}
              </p>
            </>
          )}
        </aside>
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
