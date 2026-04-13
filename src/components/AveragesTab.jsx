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

// Sortable column header
function SortTh({ col, sortCol, sortDir, onSort, left, noArrow, style, children }) {
  const active = !noArrow && sortCol === col;
  const arrow = active ? (sortDir === 'desc' ? ' ↓' : ' ↑') : '';
  return (
    <th
      onClick={() => onSort(col)}
      style={{
        padding: left ? '10px 8px' : '10px 4px',
        textAlign: left ? 'left' : 'center',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        userSelect: 'none',
        color: active ? 'var(--text)' : 'var(--text-secondary)',
        background: active ? 'rgba(88,166,255,0.07)' : 'transparent',
        transition: 'color 0.12s, background 0.12s',
        ...style,
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(128,128,128,0.08)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = active ? 'rgba(88,166,255,0.07)' : 'transparent'; }}
    >
      {children}
      {arrow && <span style={{ fontSize: 10, opacity: 0.65, marginLeft: 2 }}>{arrow}</span>}
    </th>
  );
}

export default function AveragesTab({ players, playerGameStats, completedGames, teamId, onSelectPlayer, onSelectPlayerGame }) {
  const { teams } = useData();
  const team = teams.find(t => t.id === teamId);
  const teamPlayers = sortByJersey(players.filter(p => p.team_id === teamId));

  const [scope, setScope] = useState('all'); // 'all' | 'league'
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [sortCol, setSortCol] = useState(null);   // null = jersey order
  const [sortDir, setSortDir] = useState('desc'); // 'desc' | 'asc'

  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    function onMouseDown(e) {
      if (!dropdownRef.current?.contains(e.target)) setDropdownOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [dropdownOpen]);

  const teamGames = useMemo(
    () => sortedCompleted((completedGames || []).filter(g => g.team_id === teamId)),
    [completedGames, teamId]
  );
  const leagueGames = useMemo(() => teamGames.filter(g => g.is_league), [teamGames]);
  const selectedGame = selectedGameId ? teamGames.find(g => g.id === selectedGameId) : null;

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
    setSelectedGameId(null);
  }

  function handleSelectGame(gameId) {
    setSelectedGameId(gameId);
    setDropdownOpen(false);
  }

  function handleSort(col) {
    if (col === 'player') {
      setSortCol(null); // always reset to jersey order
    } else {
      if (sortCol === col) {
        setSortDir(d => d === 'desc' ? 'asc' : 'desc');
      } else {
        setSortCol(col); setSortDir('desc');
      }
    }
  }

  function getPlayerStats(player) {
    const stats = scopedStats.filter(s => s.player_id === player.id);
    if (stats.length === 0) return null;
    const sp   = stats.reduce((a, s) => a + (s.sets_played         || 0), 0);
    const k    = stats.reduce((a, s) => a + (s.kills               || 0), 0);
    const e    = stats.reduce((a, s) => a + (s.errors              || 0), 0);
    const att  = stats.reduce((a, s) => a + (s.attempts            || 0), 0);
    const ast  = stats.reduce((a, s) => a + (s.assists             || 0), 0);
    const sa   = stats.reduce((a, s) => a + (s.aces                || 0), 0);
    const se   = stats.reduce((a, s) => a + (s.serve_errors        || 0), 0);
    const digs = stats.reduce((a, s) => a + (s.digs                || 0), 0);
    const bs   = stats.reduce((a, s) => a + (s.blocks              || 0), 0);
    const ba   = stats.reduce((a, s) => a + (s.block_assists       || 0), 0);
    const r    = stats.reduce((a, s) => a + (s.receives            || 0), 0);
    const be   = stats.reduce((a, s) => a + (s.blocking_errors     || 0), 0);
    const de   = stats.reduce((a, s) => a + (s.digging_errors      || 0), 0);
    const bhe  = stats.reduce((a, s) => a + (s.ball_handling_errors|| 0), 0);
    return { sp, k, e, att, ast, sa, se, digs, bs, ba, r, be, de, bhe, h: hpct(k, e, att) };
  }

  // Build sorted player+stats pairs — recalculates whenever filter or sort changes
  const sortedRows = useMemo(() => {
    const rows = teamPlayers.map(p => ({ p, a: getPlayerStats(p) }));

    if (!sortCol) return rows; // default: jersey order

    return [...rows].sort(({ p: pa, a: aa }, { p: pb, a: ab }) => {
      // Player name (alphabetical)
      if (sortCol === 'player') {
        const cmp = pa.name.localeCompare(pb.name);
        return sortDir === 'asc' ? cmp : -cmp;
      }

      // K%: push no-attempts rows to bottom regardless of direction
      if (sortCol === 'h') {
        const ha = aa && aa.att > 0 ? aa.h : null;
        const hb = ab && ab.att > 0 ? ab.h : null;
        if (ha === null && hb === null) return 0;
        if (ha === null) return 1;
        if (hb === null) return -1;
        return sortDir === 'desc' ? hb - ha : ha - hb;
      }

      // Players with no stats at all → always bottom
      if (!aa && !ab) return 0;
      if (!aa) return 1;
      if (!ab) return -1;

      const va = aa[sortCol] ?? 0;
      const vb = ab[sortCol] ?? 0;
      return sortDir === 'desc' ? vb - va : va - vb;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortCol, sortDir, teamPlayers, scopedStats]);

  const sortProps = { sortCol, sortDir, onSort: handleSort };

  return (
    <div>
      {/* ── Controls row ── */}
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

          <div className="avg-game-sel">
            <button
              type="button"
              className={`avg-game-sel-btn${dropdownOpen ? ' open' : ''}${selectedGameId ? ' avg-game-sel-btn-active' : ''}`}
              onClick={() => setDropdownOpen(v => !v)}
            >
              <span className="avg-game-sel-label">Select Game</span>
              <span className={`avg-game-sel-chevron${dropdownOpen ? ' open' : ''}`}>▾</span>
            </button>

            {dropdownOpen && (
              <div className="avg-game-sel-menu">
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
          </div>
        </div>
      </div>

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

      {/* ── Meta line ── */}
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
                  <SortTh col="player" left noArrow {...sortProps}>Player</SortTh>
                  <SortTh col="sp"   {...sortProps}>SP</SortTh>
                  <SortTh col="k"    {...sortProps}>K</SortTh>
                  <SortTh col="e"    {...sortProps}>E</SortTh>
                  <SortTh col="att"  {...sortProps}>TA</SortTh>
                  <SortTh col="h"    {...sortProps}>K%</SortTh>
                  <SortTh col="ast"  {...sortProps}>A</SortTh>
                  <SortTh col="bhe"  {...sortProps}>BHE</SortTh>
                  <SortTh col="sa"   {...sortProps}>SA</SortTh>
                  <SortTh col="se"   {...sortProps}>SE</SortTh>
                  <SortTh col="r"    {...sortProps}>R</SortTh>
                  <SortTh col="digs" {...sortProps}>Digs</SortTh>
                  <SortTh col="de"   {...sortProps}>DE</SortTh>
                  <SortTh col="bs"   {...sortProps}>BS</SortTh>
                  <SortTh col="ba"   {...sortProps}>BA</SortTh>
                  <SortTh col="be"   {...sortProps}>BE</SortTh>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map(({ p, a }) => {
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
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: a && a.bhe > 0 ? '#dc2626' : 'var(--text)' }}>{a ? a.bhe : dash}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: 'var(--text)' }}>{a ? a.sa : dash}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: a && a.se > 0 ? '#dc2626' : 'var(--text)' }}>{a ? a.se : dash}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: 'var(--text)' }}>{a ? a.r : dash}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: 'var(--text)' }}>{a ? a.digs : dash}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: a && a.de > 0 ? '#dc2626' : 'var(--text)' }}>{a ? a.de : dash}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: 'var(--text)' }}>{a ? a.bs : dash}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: 'var(--text)' }}>{a ? a.ba : dash}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: a && a.be > 0 ? '#dc2626' : 'var(--text)' }}>{a ? a.be : dash}</td>
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
