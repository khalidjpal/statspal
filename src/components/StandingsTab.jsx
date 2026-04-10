import { useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { computeStandings } from '../utils/stats';
import { useToast } from '../contexts/ToastContext';
import AddLeagueTeamModal from './modals/AddLeagueTeamModal';
import AddResultModal from './modals/AddResultModal';
import EditLeagueTeamModal from './modals/EditLeagueTeamModal';
import EditLeagueResultModal from './modals/EditLeagueResultModal';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
  const [manageExpanded, setManageExpanded] = useState(false);

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

  const recent = useMemo(() => {
    return [...myLeagueResults]
      .filter(r => r.game_date)
      .sort((a, b) => (b.game_date || '').localeCompare(a.game_date || ''))
      .slice(0, 5);
  }, [myLeagueResults]);

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

      {recent.length > 0 && (
        <div className="lb-card lb-recent-card">
          <div className="lb-section-title">RECENT RESULTS</div>
          <div className="lb-recent-list">
            {recent.map(r => {
              const home = teamById[r.home_league_team_id];
              const away = teamById[r.away_league_team_id];
              if (!home || !away) return null;
              const homeWon = (r.home_sets || 0) > (r.away_sets || 0);
              const usPlayed = home.is_us || away.is_us;
              const usWon = (home.is_us && homeWon) || (away.is_us && !homeWon);
              const isWin = usPlayed ? usWon : homeWon;
              return (
                <div key={r.id} className="lb-recent-row">
                  <span className={`lb-result-dot ${isWin ? 'win' : 'loss'}`} />
                  <span className="lb-recent-text">
                    <span className={home.is_us ? 'lb-recent-us' : ''}>{home.name}</span>
                    <span className="lb-recent-score"> {r.home_sets} — {r.away_sets} </span>
                    <span className={away.is_us ? 'lb-recent-us' : ''}>{away.name}</span>
                  </span>
                  <span className="lb-recent-date">{fmtDate(r.game_date)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

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

      {isAdmin && (
        <div className="lb-card lb-manage-card">
          <button
            type="button"
            className="collapsible-header lb-manage-header"
            onClick={() => setManageExpanded(v => !v)}
            aria-expanded={manageExpanded}
          >
            <span className="collapsible-title">Manage Results ({allResultsSorted.length})</span>
            <span className={`collapsible-chevron${manageExpanded ? ' open' : ''}`} aria-hidden="true">▾</span>
          </button>
          <div className={`collapsible-body${manageExpanded ? ' open' : ''}`}>
            <div className="collapsible-inner">
              {allResultsSorted.length === 0 ? (
                <div className="empty-state">No results entered yet</div>
              ) : (
                <div className="lb-results-list">
                  {allResultsSorted.map(r => {
                    const home = teamById[r.home_league_team_id];
                    const away = teamById[r.away_league_team_id];
                    return (
                      <div key={r.id} className="lb-result-mgmt">
                        <div className="lb-result-mgmt-main">
                          <div className="lb-result-mgmt-team lb-result-mgmt-team-home">
                            <span className="lb-dot" style={{ background: home?.dot_color || '#58a6ff' }} />
                            <span className="lb-result-mgmt-name">{home?.name || 'Unknown'}</span>
                          </div>
                          <div className="lb-result-mgmt-score">
                            <span className={(r.home_sets || 0) > (r.away_sets || 0) ? 'lb-result-mgmt-win' : ''}>{r.home_sets ?? 0}</span>
                            <span className="lb-result-mgmt-dash">—</span>
                            <span className={(r.away_sets || 0) > (r.home_sets || 0) ? 'lb-result-mgmt-win' : ''}>{r.away_sets ?? 0}</span>
                          </div>
                          <div className="lb-result-mgmt-team lb-result-mgmt-team-away">
                            <span className="lb-result-mgmt-name">{away?.name || 'Unknown'}</span>
                            <span className="lb-dot" style={{ background: away?.dot_color || '#58a6ff' }} />
                          </div>
                        </div>
                        <div className="lb-result-mgmt-meta">
                          <span className="lb-result-mgmt-date">{fmtDate(r.game_date)}</span>
                          <button className="lb-btn-mini lb-btn-edit" onClick={() => setEditingResult(r)}>Edit</button>
                          <button className="lb-btn-mini lb-btn-danger" onClick={() => handleDeleteResult(r)}>Delete</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
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
