import { useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { computeStandings } from '../utils/stats';
import { useToast } from '../contexts/ToastContext';
import AddLeagueTeamModal from './modals/AddLeagueTeamModal';
import AddResultModal from './modals/AddResultModal';
import EditLeagueTeamModal from './modals/EditLeagueTeamModal';
import EditLeagueResultModal from './modals/EditLeagueResultModal';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SHOW_LIMIT = 8;

function fmtDate(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  if (!y || !m || !d) return s;
  return `${MONTHS[+m - 1]} ${+d}`;
}

function rankClass(i) {
  if (i === 0) return 'lb-rank lb-rank-gold';
  if (i === 1) return 'lb-rank lb-rank-silver';
  if (i === 2) return 'lb-rank lb-rank-bronze';
  return 'lb-rank';
}

export default function StandingsTab({ team, leagueTeams, leagueResults, isAdmin, refresh }) {
  const { addToast } = useToast();
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [showAddResult, setShowAddResult] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [editingResult, setEditingResult] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [filterTeamId, setFilterTeamId] = useState(null);

  const myLeagueTeams = leagueTeams.filter(lt => lt.team_id === team.id);
  const myLeagueResults = leagueResults.filter(lr => lr.team_id === team.id);
  const standings = computeStandings(myLeagueTeams, myLeagueResults);

  const allResultsSorted = useMemo(() => {
    return [...myLeagueResults].sort((a, b) => {
      const sa = String(a.game_date || '');
      const sb = String(b.game_date || '');
      if (sa !== sb) return sa < sb ? 1 : -1;
      const ca = new Date(a.created_at || 0).getTime() || 0;
      const cb = new Date(b.created_at || 0).getTime() || 0;
      return cb - ca;
    });
  }, [myLeagueResults]);

  const teamById = useMemo(() => {
    const m = {};
    for (const lt of myLeagueTeams) m[lt.id] = lt;
    return m;
  }, [myLeagueTeams]);

  const resultMap = useMemo(() => {
    const m = {};
    for (const r of myLeagueResults) {
      if (!m[r.home_league_team_id]) m[r.home_league_team_id] = {};
      m[r.home_league_team_id][r.away_league_team_id] = r;
    }
    return m;
  }, [myLeagueResults]);

  const mostRecentDate = allResultsSorted[0]?.game_date || null;

  const filteredResults = useMemo(() => {
    if (!filterTeamId) return allResultsSorted;
    return allResultsSorted.filter(
      r => r.home_league_team_id === filterTeamId || r.away_league_team_id === filterTeamId
    );
  }, [allResultsSorted, filterTeamId]);

  const visibleResults = filterTeamId
    ? filteredResults
    : showAll ? allResultsSorted : allResultsSorted.slice(0, SHOW_LIMIT);
  const hasMore = !filterTeamId && allResultsSorted.length > SHOW_LIMIT;

  async function handleRemoveTeam(lt) {
    if (!confirm(`Remove "${lt.name}" from the league? This also deletes their results.`)) return;
    await supabase.from('league_results').delete().or(`home_league_team_id.eq.${lt.id},away_league_team_id.eq.${lt.id}`);
    await supabase.from('league_teams').delete().eq('id', lt.id);
    refresh();
  }

  async function handleDeleteResult(r) {
    if (!confirm('Delete this result? Standings will update immediately.')) return;
    const { error } = await supabase.from('league_results').delete().eq('id', r.id);
    if (error) {
      addToast('Failed to delete result: ' + error.message, 'error');
      return;
    }
    addToast('Result deleted', 'success');
    refresh();
  }

  return (
    <div className="lb-wrap">

      {/* ── Standings table ── */}
      <div className="lb-card">
        <div className="lb-table" role="table">
          <div className="lb-header" role="row">
            <div className="lb-h-rank">RANK</div>
            <div className="lb-h-team">TEAM</div>
            <div className="lb-h-stat">W</div>
            <div className="lb-h-stat">L</div>
            <div className="lb-h-stat">SW</div>
            <div className="lb-h-stat">SL</div>
            <div className="lb-h-stat">PCT</div>
          </div>

          {standings.length === 0 ? (
            <div className="lb-empty">No league teams added yet</div>
          ) : (
            standings.map((t, i) => {
              const totalSets = t.setsWon + t.setsLost;
              const pct = totalSets > 0 ? Math.round((t.setsWon / totalSets) * 100) : null;
              const dot = t.dot_color || '#58a6ff';
              const rowClass = ['lb-row'];
              if (t.is_us) rowClass.push('lb-row-us');
              if (i === 0) rowClass.push('lb-row-first');
              return (
                <div key={t.id} className={rowClass.join(' ')} role="row">
                  <div className="lb-h-rank">
                    <span className={rankClass(i)}>{i + 1}</span>
                  </div>
                  <div className="lb-h-team lb-team-cell">
                    <span className="lb-dot" style={{ background: dot }} />
                    <span className="lb-name">{t.name}</span>
                    {t.is_us && <span className="lb-us-badge">★ Us</span>}
                  </div>
                  <div className="lb-h-stat lb-w">{t.wins}</div>
                  <div className="lb-h-stat lb-l">{t.losses}</div>
                  <div className="lb-h-stat lb-mono">{t.setsWon}</div>
                  <div className="lb-h-stat lb-mono">{t.setsLost}</div>
                  <div className="lb-h-stat lb-mono">{pct == null ? '—' : `${pct}%`}</div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Results feed ── */}
      {allResultsSorted.length > 0 && (
        <div className="lb-card lb-feed-card">
          <div className="lb-feed-title">RESULTS</div>

          {/* Filter buttons – standings order */}
          {standings.length >= 2 && (
            <div className="lb-record-bar">
              {standings.map(t => {
                const isSelected = filterTeamId === t.id;
                const isFiltering = filterTeamId !== null;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={[
                      'lb-record-team lb-filter-btn',
                      isSelected ? 'lb-filter-selected' : '',
                      isFiltering && !isSelected ? 'lb-filter-dimmed' : '',
                      t.is_us && !isSelected ? 'lb-record-us' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => { setFilterTeamId(id => id === t.id ? null : t.id); setShowAll(false); }}
                    style={isSelected ? { '--filter-dot': t.dot_color || '#58a6ff' } : {}}
                  >
                    <span className="lb-record-dot" style={{ background: t.dot_color || '#58a6ff' }} />
                    <span className="lb-record-name">{t.name}</span>
                    <span className="lb-record-wl">{t.wins}–{t.losses}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Match cards */}
          <div className="mc-list">
            {visibleResults.map(r => {
              const home = teamById[r.home_league_team_id];
              const away = teamById[r.away_league_team_id];
              if (!home || !away) return null;
              const homeWon = (r.home_sets || 0) > (r.away_sets || 0);
              const usInvolved = home.is_us || away.is_us;
              const isRecent = r.game_date === mostRecentDate;

              // Perspective-aware ordering: filtered team always on left
              const isHomeFilter = filterTeamId === home.id;
              const isAwayFilter = filterTeamId === away.id;
              const isFiltered = !!(isHomeFilter || isAwayFilter);

              // Determine left/right slots
              const leftTeam    = isFiltered && isAwayFilter ? away : home;
              const leftSets    = isFiltered && isAwayFilter ? (r.away_sets ?? 0) : (r.home_sets ?? 0);
              const leftWon     = isFiltered && isAwayFilter ? !homeWon : homeWon;
              const leftIsHome  = !isAwayFilter; // true = home, false = away (for label)

              const rightTeam   = isFiltered && isAwayFilter ? home : away;
              const rightSets   = isFiltered && isAwayFilter ? (r.home_sets ?? 0) : (r.away_sets ?? 0);
              const rightWon    = isFiltered && isAwayFilter ? homeWon : !homeWon;

              const leftSideCls  = isFiltered ? 'mc-focus'    : (leftWon  ? 'mc-winner' : 'mc-loser');
              const rightSideCls = isFiltered ? 'mc-opponent' : (rightWon ? 'mc-winner' : 'mc-loser');

              return (
                <div
                  key={r.id}
                  className={['mc-card', usInvolved ? 'mc-us' : '', isRecent ? 'mc-recent' : ''].filter(Boolean).join(' ')}
                >
                  <div className="mc-match">
                    {/* Left side — always filtered team (or home when no filter) */}
                    <div className={`mc-side mc-home ${leftSideCls}`}>
                      <span className="mc-dot" style={{ background: leftTeam.dot_color || '#58a6ff' }} />
                      <span className="mc-name-wrap">
                        <span className="mc-name">{leftTeam.name}</span>
                        {isFiltered && <span className="mc-ha-label">{leftIsHome ? 'Home' : 'Away'}</span>}
                      </span>
                      <span className={`mc-pill ${leftWon ? 'win' : 'loss'}`}>{leftWon ? 'W' : 'L'}</span>
                      <span className="mc-score">{leftSets}</span>
                    </div>

                    {/* VS separator */}
                    <div className="mc-vs">VS</div>

                    {/* Right side — always opponent (or away when no filter) */}
                    <div className={`mc-side mc-away ${rightSideCls}`}>
                      <span className="mc-score">{rightSets}</span>
                      <span className={`mc-pill ${rightWon ? 'win' : 'loss'}${isFiltered ? ' mc-pill-muted' : ''}`}>{rightWon ? 'W' : 'L'}</span>
                      <span className="mc-name">{rightTeam.name}</span>
                      <span className="mc-dot" style={{ background: rightTeam.dot_color || '#58a6ff' }} />
                    </div>
                  </div>

                  <div className="mc-meta">
                    <span className="mc-date">{fmtDate(r.game_date)}</span>
                    {isRecent && <span className="mc-badge-recent">Recent</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Count label */}
          {filterTeamId ? (
            <div className="mc-count-label">
              Showing {filteredResults.length} result{filteredResults.length !== 1 ? 's' : ''} for{' '}
              <span className="mc-count-team">{teamById[filterTeamId]?.name}</span>
              <button className="mc-clear-filter" onClick={() => { setFilterTeamId(null); setShowAll(false); }}>✕ Clear</button>
            </div>
          ) : (
            allResultsSorted.length > 0 && !showAll && hasMore && (
              <div className="mc-count-label">
                Showing {Math.min(SHOW_LIMIT, allResultsSorted.length)} of {allResultsSorted.length} results
              </div>
            )
          )}

          {hasMore && (
            <button className="mc-show-more" onClick={() => setShowAll(v => !v)}>
              {showAll
                ? 'Show less ▴'
                : `Show ${allResultsSorted.length - SHOW_LIMIT} more result${allResultsSorted.length - SHOW_LIMIT === 1 ? '' : 's'} ▾`}
            </button>
          )}
        </div>
      )}

      {/* ── Advanced Statistics (collapsible matrix) ── */}
      {myLeagueResults.length > 0 && standings.length >= 2 && (
        <div className="lb-card lb-adv-card">
          <button
            type="button"
            className="collapsible-header lb-adv-header"
            onClick={() => setAdvancedOpen(v => !v)}
            aria-expanded={advancedOpen}
          >
            <span className="collapsible-title lb-adv-title">Advanced Statistics — Head to Head Matrix</span>
            <span className={`collapsible-chevron${advancedOpen ? ' open' : ''}`} aria-hidden="true">▾</span>
          </button>

          <div className={`collapsible-body${advancedOpen ? ' open' : ''}`}>
            <div className="collapsible-inner lb-adv-inner">
              <div className="lb-matrix-scroll">
                <div
                  className="lb-matrix"
                  style={{ gridTemplateColumns: `130px repeat(${standings.length}, minmax(70px, 1fr))` }}
                >
                  {/* Corner */}
                  <div className="lb-matrix-corner">
                    <span>HOME ↓</span>
                    <span>AWAY →</span>
                  </div>

                  {/* Column headers (away teams) */}
                  {standings.map(t => (
                    <div key={`ch-${t.id}`} className={`lb-matrix-col-hdr${t.is_us ? ' lb-matrix-us-col' : ''}`}>
                      <span className="lb-matrix-hdr-dot" style={{ background: t.dot_color || '#58a6ff' }} />
                      <span className="lb-matrix-hdr-name">{t.name}</span>
                    </div>
                  ))}

                  {/* Rows: row header + cells */}
                  {standings.flatMap(homeTeam => [
                    <div key={`rh-${homeTeam.id}`} className={`lb-matrix-row-hdr${homeTeam.is_us ? ' lb-matrix-us-row' : ''}`}>
                      <span className="lb-matrix-hdr-dot" style={{ background: homeTeam.dot_color || '#58a6ff' }} />
                      <span className="lb-matrix-hdr-name">{homeTeam.name}</span>
                    </div>,
                    ...standings.map(awayTeam => {
                      if (homeTeam.id === awayTeam.id) {
                        return (
                          <div key={`cell-${homeTeam.id}-${awayTeam.id}`} className="lb-matrix-cell lb-matrix-cell-self">
                            <span>—</span>
                          </div>
                        );
                      }
                      const r = resultMap[homeTeam.id]?.[awayTeam.id];
                      if (!r) {
                        return (
                          <div
                            key={`cell-${homeTeam.id}-${awayTeam.id}`}
                            className={`lb-matrix-cell lb-matrix-cell-empty${(homeTeam.is_us || awayTeam.is_us) ? ' lb-matrix-us-empty' : ''}`}
                          />
                        );
                      }
                      const homeWon = (r.home_sets || 0) > (r.away_sets || 0);
                      const usInvolved = homeTeam.is_us || awayTeam.is_us;
                      const isRecent = r.game_date === mostRecentDate;
                      const cellCls = [
                        'lb-matrix-cell',
                        homeWon ? 'lb-matrix-win' : 'lb-matrix-loss',
                        usInvolved ? 'lb-matrix-us' : '',
                        usInvolved && homeWon ? 'lb-matrix-us-win' : '',
                        isRecent ? 'lb-matrix-recent' : '',
                      ].filter(Boolean).join(' ');
                      return (
                        <div
                          key={`cell-${homeTeam.id}-${awayTeam.id}`}
                          className={cellCls}
                          title={fmtDate(r.game_date)}
                        >
                          <span className="lb-matrix-score">{r.home_sets}–{r.away_sets}</span>
                          <span className={`lb-matrix-pill ${homeWon ? 'win' : 'loss'}`}>{homeWon ? 'W' : 'L'}</span>
                          {isAdmin && (
                            <div className="lb-matrix-actions">
                              <button
                                className="lb-matrix-btn lb-matrix-edit"
                                onClick={e => { e.stopPropagation(); setEditingResult(r); }}
                                title="Edit"
                              >✎</button>
                              <button
                                className="lb-matrix-btn lb-matrix-del"
                                onClick={e => { e.stopPropagation(); handleDeleteResult(r); }}
                                title="Delete"
                              >✕</button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  ])}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Admin ── */}
      {isAdmin && (
        <div className="lb-card lb-admin-card">
          <div className="lb-section-title">ADMIN</div>
          <div className="lb-admin-actions">
            <button className="lb-btn-outline" onClick={() => setShowAddResult(true)}>+ Enter Result</button>
            <button className="lb-btn-outline" onClick={() => setShowAddTeam(true)}>+ Add Team</button>
          </div>
          {myLeagueTeams.length > 0 && (
            <div className="lb-admin-teams">
              {myLeagueTeams.map(lt => (
                <div key={lt.id} className="lb-admin-team-row">
                  <span className="lb-dot" style={{ background: lt.dot_color || '#58a6ff' }} />
                  <span className="lb-admin-team-name">{lt.name}{lt.is_us && <span className="lb-us-badge"> ★ Us</span>}</span>
                  <button className="lb-btn-mini" onClick={() => setEditingTeam(lt)}>Edit</button>
                  <button className="lb-btn-mini lb-btn-danger" onClick={() => handleRemoveTeam(lt)}>Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="lb-legend">
        W = Wins · L = Losses · SW = Sets Won · SL = Sets Lost · PCT = Set Win %
      </div>

      {showAddTeam && <AddLeagueTeamModal teamId={team.id} onClose={() => setShowAddTeam(false)} onSaved={() => { setShowAddTeam(false); refresh(); }} />}
      {showAddResult && <AddResultModal teamId={team.id} leagueTeams={myLeagueTeams} onClose={() => setShowAddResult(false)} onSaved={() => { setShowAddResult(false); refresh(); }} />}
      {editingTeam && <EditLeagueTeamModal leagueTeam={editingTeam} onClose={() => setEditingTeam(null)} onSaved={() => { setEditingTeam(null); refresh(); }} />}
      {editingResult && (
        <EditLeagueResultModal
          result={editingResult}
          allLeagueTeams={myLeagueTeams}
          onClose={() => setEditingResult(null)}
          onSaved={() => { setEditingResult(null); addToast('Result updated', 'success'); refresh(); }}
        />
      )}
    </div>
  );
}
