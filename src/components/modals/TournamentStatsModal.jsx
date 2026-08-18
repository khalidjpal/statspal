import { useMemo, useState } from 'react';
import { useData } from '../../contexts/DataContext';
import {
  n3, hcol, pfmt, pcol, hpct, playerTotals, passAvg, aggregatePlayerStats,
} from '../../utils/stats';
import { sortByJersey } from '../../utils/sort';
import {
  tournamentGames, tournamentRecord, tournamentDateLabel, gameLabel,
} from '../../utils/tournaments';
import PlayerBadge from '../PlayerBadge';

const COLS = [
  ['sp', 'SP'], ['k', 'K'], ['e', 'E'], ['att', 'TA'], ['h', 'K%'],
  ['ast', 'A'], ['bhe', 'BHE'], ['sa', 'SA'], ['se', 'SE'],
  ['r', 'Rec'], ['pass', 'Pass'], ['digs', 'Digs'], ['de', 'DE'],
  ['bs', 'BS'], ['ba', 'BA'], ['be', 'BE'],
];

// Roll-up view for a tournament: per-player totals across every game in the
// event, plus the same team-totals strip the single-game box score uses.
//
// Aggregation is aggregatePlayerStats() from utils/stats — the exact function
// the season Averages tab uses. That matters most for passing average: the
// pass_3/2/1/0 counters are summed across all games first and divided once, so
// the tournament number is properly weighted by receive volume rather than an
// average of the per-game averages.
export default function TournamentStatsModal({ tournament, team, onClose, onSelectGame }) {
  const { players, schedule, completedGames, playerGameStats } = useData();
  // 'total' = the whole tournament; otherwise a single game's id.
  const [scope, setScope] = useState('total');

  const games = useMemo(
    () => tournamentGames(tournament.id, schedule, completedGames),
    [tournament.id, schedule, completedGames]
  );
  const playedGames = useMemo(() => games.filter(g => g._kind === 'completed'), [games]);
  const { w, l } = tournamentRecord(games);

  const selectedGame = scope === 'total' ? null : playedGames.find(g => g.id === scope) || null;

  // Stat rows in scope — every played game, or just the selected one.
  const scopedStats = useMemo(() => {
    const ids = new Set(
      (selectedGame ? [selectedGame] : playedGames).map(g => g.id)
    );
    return (playerGameStats || []).filter(s => ids.has(s.game_id));
  }, [playerGameStats, playedGames, selectedGame]);

  const teamPlayers = useMemo(
    () => sortByJersey((players || []).filter(p => p.team_id === team.id)),
    [players, team.id]
  );

  const rows = useMemo(
    () => teamPlayers
      .map(p => ({ p, a: aggregatePlayerStats(scopedStats.filter(s => s.player_id === p.id)) }))
      .filter(r => r.a),
    [teamPlayers, scopedStats]
  );

  const totals = useMemo(() => playerTotals(scopedStats), [scopedStats]);
  const hasStats = scopedStats.length > 0;

  const teamStrip = [
    { label: 'K',    value: totals.kills },
    { label: 'E',    value: totals.errors },
    { label: 'TA',   value: totals.attempts },
    { label: 'K%',   value: n3(hpct(totals.kills, totals.errors, totals.attempts)), color: hcol(totals.kills, totals.errors, totals.attempts) },
    { label: 'A',    value: totals.assists },
    { label: 'BHE',  value: totals.ball_handling_errors },
    { label: 'SA',   value: totals.aces },
    { label: 'SE',   value: totals.serve_errors },
    { label: 'Rec',  value: totals.receives },
    { label: 'Pass', value: pfmt(passAvg(totals)), color: pcol(passAvg(totals)) },
    { label: 'Digs', value: totals.digs },
    { label: 'DE',   value: totals.digging_errors },
    { label: 'BS',   value: totals.blocks },
    { label: 'BA',   value: totals.block_assists },
    { label: 'BE',   value: totals.blocking_errors },
  ];

  function cell(a, key) {
    if (key === 'h') {
      return <span style={{ color: hcol(a.k, a.e, a.att), fontWeight: 600 }}>{n3(a.h)}</span>;
    }
    if (key === 'pass') {
      return <span style={{ color: pcol(a.pass), fontWeight: 600 }}>{pfmt(a.pass)}</span>;
    }
    const errorish = key === 'e' || key === 'se' || key === 'de' || key === 'be' || key === 'bhe';
    return <span style={{ color: errorish && a[key] > 0 ? '#dc2626' : 'var(--text)' }}>{a[key]}</span>;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content trn-stats-modal" onClick={e => e.stopPropagation()}>

        <div className="trn-stats-head">
          <div className="trn-stats-title">{tournament.name}</div>
          <div className="trn-stats-sub">
            {tournamentDateLabel(tournament)}
            {tournament.location && ` · ${tournament.location}`}
          </div>
        </div>

        {/* Scope: the whole tournament vs one game — labelled so the aggregate
            can't be mistaken for a single game's box score. */}
        <div className="trn-stats-scope">
          <button
            type="button"
            className={`trn-scope-btn${scope === 'total' ? ' on' : ''}`}
            onClick={() => setScope('total')}
          >
            Tournament Total
          </button>
          {playedGames.map(g => (
            <button
              key={g.id}
              type="button"
              className={`trn-scope-btn${scope === g.id ? ' on' : ''}`}
              onClick={() => setScope(g.id)}
            >
              Game {g.tournament_game_no || '?'}
            </button>
          ))}
        </div>

        <div className="trn-stats-banner">
          {selectedGame ? (
            <>
              <span className="trn-stats-banner-tag trn-stats-banner-tag-single">SINGLE GAME</span>
              <span>{gameLabel(selectedGame)}</span>
              {selectedGame.result && (
                <span className={`game-result-badge ${selectedGame.result === 'W' ? 'win' : 'loss'}`}>
                  {selectedGame.result}
                </span>
              )}
              {selectedGame.home_sets != null && selectedGame.away_sets != null && (
                <span className="trn-stats-banner-score">{selectedGame.home_sets}–{selectedGame.away_sets}</span>
              )}
              {onSelectGame && (
                <button
                  type="button"
                  className="trn-btn-ghost trn-stats-banner-open"
                  onClick={() => onSelectGame(selectedGame)}
                >
                  Full box score ›
                </button>
              )}
            </>
          ) : (
            <>
              <span className="trn-stats-banner-tag">AGGREGATE</span>
              <span>
                Combined across <strong>{playedGames.length}</strong>{' '}
                {playedGames.length === 1 ? 'game' : 'games'} · record <strong>{w}–{l}</strong>
              </span>
            </>
          )}
        </div>

        {!hasStats ? (
          <div className="empty-state" style={{ padding: '28px 16px' }}>
            {playedGames.length === 0
              ? 'No games played yet — stats appear here once you track a game.'
              : 'No player stats recorded for this selection.'}
          </div>
        ) : (
          <>
            <div className="card trn-stats-totals">
              <div className="trn-stats-totals-label">
                {selectedGame ? 'Game Totals' : 'Tournament Totals'}
              </div>
              <div className="trn-stats-totals-row">
                {teamStrip.map((item, i) => (
                  <div key={i} className="trn-stats-totals-item">
                    <div className="trn-stats-totals-key">{item.label}</div>
                    <div className="trn-stats-totals-val" style={{ color: item.color || '#ffffff' }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card trn-stats-tablecard">
              <div className="trn-stats-tablescroll">
                <table className="trn-stats-table">
                  <thead>
                    <tr>
                      <th className="trn-th-player">Player</th>
                      {COLS.map(([key, label]) => <th key={key}>{label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ p, a }) => (
                      <tr key={p.id}>
                        <td className="trn-td-player">
                          <PlayerBadge player={p} team={team} size={28} />
                          <span className="trn-td-player-name">{p.name}</span>
                        </td>
                        {COLS.map(([key]) => <td key={key}>{cell(a, key)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {!selectedGame && (
              <div className="trn-field-note" style={{ marginTop: 10 }}>
                Rate stats are computed from the summed counters across all {playedGames.length} games —
                passing average is (3·pass 3 + 2·pass 2 + 1·pass 1) ÷ total graded receives for the whole
                tournament, not an average of the per-game averages.
              </div>
            )}
          </>
        )}

        <div className="modal-actions">
          <button className="modal-btn-cancel" type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
