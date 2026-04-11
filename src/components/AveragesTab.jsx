import { useMemo, useState, useRef, useEffect } from 'react';
import { useData } from '../contexts/DataContext';
import { hpct, n3, hcol } from '../utils/stats';
import { sortByJersey, sortedCompleted } from '../utils/sort';
import PlayerBadge from './PlayerBadge';

function formatGameLabel(g, short = false) {
  const date = new Date(g.game_date + 'T00:00:00')
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (short) return `vs ${g.opponent} · ${date}`;
  const score = g.home_sets != null && g.away_sets != null ? ` ${g.home_sets}–${g.away_sets}` : '';
  const result = g.result ? ` · ${g.result}${score}` : '';
  return `vs ${g.opponent} · ${date}${result}`;
}

export default function AveragesTab({ players, playerGameStats, completedGames, teamId, onSelectPlayer, onSelectPlayerGame }) {
  const { teams } = useData();
  const team = teams.find(t => t.id === teamId);
  const teamPlayers = sortByJersey(players.filter(p => p.team_id === teamId));

  const [scope, setScope] = useState('all'); // 'all' | 'league'
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    function onMouseDown(e) {
      if (!dropdownRef.current?.contains(e.target)) setDropdownOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [dropdownOpen]);

  // Games for this team, sorted most recent first
  const teamGames = useMemo(
    () => sortedCompleted((completedGames || []).filter(g => g.team_id === teamId)),
    [completedGames, teamId]
  );
  const leagueGames = useMemo(() => teamGames.filter(g => g.is_league), [teamGames]);

  const selectedGame = selectedGameId ? teamGames.find(g => g.id === selectedGameId) : null;

  // Build the set of game IDs to filter stats by
  const scopedGameIds = useMemo(() => {
    if (selectedGameId) return new Set([selectedGameId]);
    const src = scope === 'league' ? leagueGames : teamGames;
    return new Set(src.map(g => g.id));
  }, [selectedGameId, scope, teamGames, leagueGames]);

  const scopedStats = useMemo(
    () => (playerGameStats || []).filter(s => scopedGameIds.has(s.game_id)),
    [playerGameStats, scopedGameIds]
  );

  const gameCount = selectedGameId ? 1 : (scope === 'league' ? leagueGames.length : teamGames.length);

  function handleScopeChange(newScope) {
    setScope(newScope);
    setSelectedGameId(null); // reset game selector when toggling scope
  }

  function handleSelectGame(gameId) {
    setSelectedGameId(gameId);
    setDropdownOpen(false);
  }

  function getPlayerStats(player) {
    const stats = scopedStats.filter(s => s.player_id === player.id);
    if (stats.length === 0) return null;
    const sp  = stats.reduce((a, s) => a + (s.sets_played  || 0), 0);
    const k   = stats.reduce((a, s) => a + (s.kills        || 0), 0);
    const e   = stats.reduce((a, s) => a + (s.errors       || 0), 0);
    const att = stats.reduce((a, s) => a + (s.attempts     || 0), 0);
    const ast = stats.reduce((a, s) => a + (s.assists      || 0), 0);
    const sa  = stats.reduce((a, s) => a + (s.aces         || 0), 0);
    const se  = stats.reduce((a, s) => a + (s.serve_errors || 0), 0);
    const digs = stats.reduce((a, s) => a + (s.digs        || 0), 0);
    const bs  = stats.reduce((a, s) => a + (s.blocks       || 0), 0);
    const ba  = stats.reduce((a, s) => a + (s.block_assists|| 0), 0);
    return { sp, k, e, att, ast, sa, se, digs, bs, ba, h: hpct(k, e, att) };
  }

  const dropdownLabel = 'Select Game';

  return (
    <div>
      {/* ── Controls row — all three buttons grouped center ── */}
      <div className="avg-scope-bar avg-scope-bar-center">
        <div className="avg-seg" ref={dropdownRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className={`avg-seg-btn${scope === 'all' && !selectedGameId ? ' on' : ''}`}
            onClick={() => handleScopeChange('all')}
          >
            All Games
          </button>
          <div className="avg-seg-sep" />
          <button
            type="button"
            className={`avg-seg-btn${scope === 'league' && !selectedGameId ? ' on' : ''}`}
            onClick={() => handleScopeChange('league')}
          >
            League Only
          </button>

          <div className="avg-seg-sep" />

          {/* Game selector — styled as a segment button */}
          <div className="avg-game-sel">
          <button
            type="button"
            className={`avg-game-sel-btn${dropdownOpen ? ' open' : ''}${selectedGameId ? ' avg-game-sel-btn-active' : ''}`}
            onClick={() => setDropdownOpen(v => !v)}
          >
            <span className="avg-game-sel-label">{dropdownLabel}</span>
            <span className={`avg-game-sel-chevron${dropdownOpen ? ' open' : ''}`}>▾</span>
          </button>

          {dropdownOpen && (
            <div className="avg-game-sel-menu">
              {/* Season Average (reset) */}
              <button
                type="button"
                className={`avg-game-sel-item avg-game-sel-reset${!selectedGameId ? ' selected' : ''}`}
                onClick={() => handleSelectGame(null)}
              >
                <span>Season Average</span>
                {!selectedGameId && <span className="avg-game-sel-check">✓</span>}
              </button>

              {teamGames.length > 0 && <div className="avg-game-sel-divider" />}

              {teamGames.map(g => (
                <button
                  key={g.id}
                  type="button"
                  className={`avg-game-sel-item${selectedGameId === g.id ? ' selected' : ''}`}
                  onClick={() => handleSelectGame(g.id)}
                >
                  <div className="avg-game-sel-item-main">
                    <span className="avg-game-sel-opp">vs {g.opponent}</span>
                    <span className="avg-game-sel-date">
                      {new Date(g.game_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {g.home_sets != null && g.away_sets != null && ` · ${g.home_sets}–${g.away_sets}`}
                    </span>
                  </div>
                  <div className="avg-game-sel-item-right">
                    {g.result && (
                      <span className={`game-result-badge ${g.result === 'W' ? 'win' : 'loss'}`}>{g.result}</span>
                    )}
                    {selectedGameId === g.id && <span className="avg-game-sel-check">✓</span>}
                  </div>
                </button>
              ))}

              {teamGames.length === 0 && (
                <div className="avg-game-sel-empty">No completed games</div>
              )}
            </div>
          )}
          </div>{/* end avg-game-sel */}
        </div>{/* end avg-seg */}
      </div>{/* end avg-scope-bar */}

      {/* ── Active game filter label ── */}
      {selectedGame && (
        <div className="avg-game-filter-label">
          <span>Showing stats for <strong>{formatGameLabel(selectedGame)}</strong></span>
          <button
            type="button"
            className="avg-game-filter-clear"
            onClick={() => setSelectedGameId(null)}
            aria-label="Clear game filter"
          >✕</button>
        </div>
      )}

      {/* ── Meta line (when no game selected) ── */}
      {!selectedGame && (
        <div className="avg-scope-meta" style={{ marginBottom: 8 }}>
          Based on {gameCount} {scope === 'league' ? 'league' : 'total'} {gameCount === 1 ? 'game' : 'games'}
        </div>
      )}

      {/* ── Stats table ── */}
      {teamPlayers.length === 0 ? (
        <div className="empty-state">No players on roster</div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(128,128,128,0.07)', textAlign: 'center' }}>
                  <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>Player</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>SP</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>K</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>E</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>TA</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>K%</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>A</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>SA</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>SE</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>Digs</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>BS</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>BA</th>
                </tr>
              </thead>
              <tbody>
                {teamPlayers.map(p => {
                  const a = getPlayerStats(p);
                  const dash = <span style={{ color: 'var(--text-muted)' }}>—</span>;
                  const handleRowClick = () => {
                    if (selectedGame && onSelectPlayerGame) {
                      onSelectPlayerGame(p, selectedGame);
                    } else {
                      onSelectPlayer(p);
                    }
                  };
                  return (
                    <tr
                      key={p.id}
                      className={selectedGame ? 'avg-row-game-mode' : ''}
                      style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                      onClick={handleRowClick}
                    >
                      <td style={{ padding: '8px', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
                        <PlayerBadge player={p} team={team} size={32} />
                        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{p.name}</span>
                        {selectedGame && (
                          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', paddingRight: 4 }}>›</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: 'var(--text)' }}>{a ? a.sp : dash}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: 'var(--text)' }}>{a ? a.k : dash}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: a && a.e > 0 ? '#dc2626' : 'var(--text)' }}>{a ? a.e : dash}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: 'var(--text)' }}>{a ? a.att : dash}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: a ? hcol(a.k, a.e, a.att) : 'var(--text-muted)', fontWeight: 600 }}>
                        {a ? n3(a.h) : '—'}
                      </td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: 'var(--text)' }}>{a ? a.ast : dash}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: 'var(--text)' }}>{a ? a.sa : dash}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: a && a.se > 0 ? '#dc2626' : 'var(--text)' }}>{a ? a.se : dash}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: 'var(--text)' }}>{a ? a.digs : dash}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: 'var(--text)' }}>{a ? a.bs : dash}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: 'var(--text)' }}>{a ? a.ba : dash}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
