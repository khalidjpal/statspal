import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { supabase } from '../supabase';
import { hpct, n3, hcol, hlbl, playerTotals, computeStandings } from '../utils/stats';
import { sortedUpcoming, sortedCompleted } from '../utils/sort';
import PlayerBadge from '../components/PlayerBadge';
import Modal from '../components/Modal';
import PlayerGameDetail from './PlayerGameDetail';

const TABS = ['Season', 'Bests', 'Games', 'Efficiency', 'Schedule', 'Standings'];

export default function PlayerHome({ onSelectGame }) {
  const { currentUser, logout } = useAuth();
  const data = useData();
  const { players, completedGames, playerGameStats, schedule, leagueTeams, leagueResults, refresh } = data;
  const [tab, setTab] = useState('Season');
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [popupPlayerGame, setPopupPlayerGame] = useState(null);

  // Inbox state
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inboxMessages, setInboxMessages] = useState([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxError, setInboxError] = useState('');
  const [selectedMessage, setSelectedMessage] = useState(null);

  useEffect(() => { refresh(); }, [refresh]);

  const fetchInbox = useCallback(async () => {
    if (!currentUser?.id) return;
    setInboxLoading(true);
    setInboxError('');

    const { data: rows, error } = await supabase
      .from('message_recipients')
      .select('id, read, read_at, messages(id, subject, body, sender_name, created_at)')
      .eq('account_id', currentUser.id);

    if (error) {
      setInboxError(error.message);
      setInboxLoading(false);
      return;
    }

    const valid = (rows || [])
      .filter(r => r.messages)
      .sort((a, b) => new Date(b.messages.created_at) - new Date(a.messages.created_at));

    setInboxMessages(valid);
    setInboxLoading(false);
  }, [currentUser?.id]); // eslint-disable-line

  useEffect(() => { fetchInbox(); }, [fetchInbox]);

  async function openMessage(recipient) {
    setSelectedMessage(recipient);
    if (!recipient.read) {
      await supabase
        .from('message_recipients')
        .update({ read: true, read_at: new Date().toISOString() })
        .eq('id', recipient.id);
      setInboxMessages(prev => prev.map(m => m.id === recipient.id ? { ...m, read: true } : m));
    }
  }

  const unreadCount = inboxMessages.filter(m => !m.read).length;

  const player = players.find(p => p.id === currentUser?.player_id);
  const team = data.teams.find(t => t.id === currentUser?.team_id);

  if (!player || !team) {
    return (
      <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', background: 'var(--bg)' }}>
        <p>Player data not found.</p>
        <button onClick={logout} style={{ marginTop: 16, padding: '8px 24px' }}>Logout</button>
      </div>
    );
  }

  const myStats = playerGameStats.filter(s => s.player_id === player.id);
  const totals = playerTotals(myStats);
  const sp = totals.sets_played;
  const h = hpct(totals.kills, totals.errors, totals.attempts);

  const gameIds = new Set(myStats.map(s => s.game_id));
  const myGames = sortedCompleted(completedGames.filter(g => gameIds.has(g.id)));

  function getBest(field) {
    if (myStats.length === 0) return { value: 0, game: null };
    let best = myStats[0];
    for (const s of myStats) {
      if ((s[field] || 0) > (best[field] || 0)) best = s;
    }
    const game = completedGames.find(g => g.id === best.game_id);
    return { value: best[field] || 0, game };
  }

  const upcoming = sortedUpcoming(schedule.filter(s => s.team_id === team.id));
  const teamCompleted = sortedCompleted(completedGames.filter(g => g.team_id === team.id));
  const myLeagueTeams = leagueTeams.filter(lt => lt.team_id === team.id);
  const myLeagueResults = leagueResults.filter(lr => lr.team_id === team.id);
  const standings = computeStandings(myLeagueTeams, myLeagueResults);

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  const teamColor = team.color || '#1a3a8f';
  const headerBg = `linear-gradient(135deg, ${teamColor}, ${teamColor}CC)`;

  return (
    <div
      className="screen-shell"
      style={{ '--team-color': teamColor }}
    >
      {/* ── Player hero header (64px) ── */}
      <div className="player-header" style={{ background: headerBg }}>
        <PlayerBadge player={player} team={team} size={38} />
        <div className="player-header-info">
          <div className="player-header-name">{player.name}</div>
          <div className="player-header-team">{team.name}</div>
        </div>
        <div className="player-header-actions">
          <button
            className="app-header-btn"
            onClick={() => { setInboxOpen(true); fetchInbox(); }}
            title="Inbox"
          >
            ✉
            {unreadCount > 0 && (
              <span className="header-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </button>
          <button className="app-header-btn" onClick={logout} title="Logout">
            Out
          </button>
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="app-content">
        <div className="page-wrap">

          {/* Top tab bar */}
          <div className="tab-bar" style={{ overflowX: 'auto' }}>
            {TABS.map(t => (
              <button
                key={t}
                className={`tab-btn${tab === t ? ' active' : ''}`}
                onClick={() => setTab(t)}
                style={{ whiteSpace: 'nowrap' }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* SEASON TAB */}
          {tab === 'Season' && (
            <div>
              <div className="card" style={{ textAlign: 'center', padding: '14px 18px' }}>
                <div style={{ fontSize: 34, fontWeight: 700, fontFamily: 'var(--mono)', color: hcol(totals.kills, totals.errors, totals.attempts) }}>
                  {n3(h)}
                </div>
                <div style={{ fontSize: 12, color: hcol(totals.kills, totals.errors, totals.attempts), fontWeight: 600, marginTop: 2 }}>
                  {hlbl(totals.kills, totals.errors, totals.attempts)}
                </div>
              </div>
              <div className="card">
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Season Totals</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, textAlign: 'center' }}>
                  {[
                    { label: 'SP',   value: sp },
                    { label: 'K',    value: totals.kills },
                    { label: 'E',    value: totals.errors },
                    { label: 'TA',   value: totals.attempts },
                    { label: 'A',    value: totals.assists },
                    { label: 'SA',   value: totals.aces },
                    { label: 'SE',   value: totals.serve_errors },
                    { label: 'Digs', value: totals.digs },
                    { label: 'BS',   value: totals.blocks },
                    { label: 'BA',   value: totals.block_assists },
                  ].map((item, i) => (
                    <div key={i} style={{ padding: '8px 4px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{item.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)' }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* BESTS TAB */}
          {tab === 'Bests' && (
            <div>
              {[
                { field: 'kills',         label: 'Kills',           abbr: 'K' },
                { field: 'aces',          label: 'Service Aces',    abbr: 'SA' },
                { field: 'digs',          label: 'Digs',            abbr: 'D' },
                { field: 'blocks',        label: 'Block Solos',     abbr: 'BS' },
                { field: 'block_assists', label: 'Block Assists',   abbr: 'BA' },
              ].map(({ field, label, abbr }) => {
                const best = getBest(field);
                return (
                  <div key={field} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: 30, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)', lineHeight: 1 }}>{best.value}</div>
                    </div>
                    {best.game && (
                      <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-secondary)' }}>
                        vs {best.game.opponent}<br />
                        <span style={{ color: 'var(--text-muted)' }}>
                          {new Date(best.game.game_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* GAMES TAB */}
          {tab === 'Games' && (
            <div>
              {myGames.length === 0 && <div className="empty-state">No games yet</div>}
              {myGames.map(g => {
                const gs = myStats.find(s => s.game_id === g.id);
                return (
                  <div key={g.id} className="game-row" onClick={() => setPopupPlayerGame({ player, game: g })}>
                    <div>
                      <div style={{ fontWeight: 600 }}>vs {g.opponent}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {new Date(g.game_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {gs && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{gs.kills}K {gs.aces}SA {gs.digs}D</span>}
                      <span className={`game-result-badge ${g.result === 'W' ? 'win' : 'loss'}`}>{g.result}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* EFFICIENCY TAB */}
          {tab === 'Efficiency' && (
            <div>
              <div className="card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Season K% — Hitting Efficiency</div>
                <div style={{ fontSize: 44, fontWeight: 700, fontFamily: 'var(--mono)', color: hcol(totals.kills, totals.errors, totals.attempts) }}>
                  {n3(h)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
                  {totals.kills}K − {totals.errors}E / {totals.attempts} TA
                </div>
              </div>
              <div className="card">
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Game-by-Game</div>
                {myGames.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No games yet</div>}
                {myGames.map(g => {
                  const gs = myStats.find(s => s.game_id === g.id);
                  if (!gs) return null;
                  const gh = hpct(gs.kills, gs.errors, gs.attempts);
                  return (
                    <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 13 }}>vs {g.opponent}</span>
                      <span style={{ fontWeight: 700, fontFamily: 'var(--mono)', color: hcol(gs.kills, gs.errors, gs.attempts) }}>{n3(gh)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* SCHEDULE TAB */}
          {tab === 'Schedule' && (
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Upcoming</h3>
              {upcoming.length === 0 && <div className="empty-state" style={{ padding: '20px' }}>No upcoming games</div>}
              {upcoming.map((g, i) => (
                <div key={g.id} className={`game-row${i === 0 ? ' game-row-next' : ''}`}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{g.opponent}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {new Date(g.game_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {g.location}
                    </div>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="collapsible-header"
                onClick={() => setCompletedExpanded(v => !v)}
                aria-expanded={completedExpanded}
              >
                <span className="collapsible-title">Completed ({teamCompleted.length})</span>
                <span className={`collapsible-chevron${completedExpanded ? ' open' : ''}`} aria-hidden="true">▾</span>
              </button>
              <div className={`collapsible-body${completedExpanded ? ' open' : ''}`}>
                <div className="collapsible-inner">
                  {teamCompleted.length === 0 && <div className="empty-state">No completed games</div>}
                  {teamCompleted.map(g => (
                    <div key={g.id} className="game-row">
                      <div>
                        <div style={{ fontWeight: 600 }}>{g.opponent}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {new Date(g.game_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {g.result && (
                          <>
                            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{g.home_sets}-{g.away_sets}</span>
                            <span className={`game-result-badge ${g.result === 'W' ? 'win' : 'loss'}`}>{g.result}</span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STANDINGS TAB */}
          {tab === 'Standings' && (
            <div>
              {team.league_name && (
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12 }}>{team.league_name}</div>
              )}
              {standings.length === 0 ? (
                <div className="empty-state">No league data</div>
              ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead>
                      <tr style={{ background: 'rgba(128,128,128,0.05)' }}>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>#</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Team</th>
                        <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>W</th>
                        <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((t, i) => (
                        <tr key={t.id} style={{ borderTop: '1px solid var(--border)', fontWeight: t.is_us ? 700 : 400 }}>
                          <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)' }}>{i + 1}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: t.dot_color, marginRight: 8 }} />
                            <span style={{ color: t.text_color }}>{t.name}</span>
                          </td>
                          <td style={{ textAlign: 'center', padding: '10px 8px', color: 'var(--win)', fontFamily: 'var(--mono)' }}>{t.wins}</td>
                          <td style={{ textAlign: 'center', padding: '10px 8px', color: 'var(--loss)', fontFamily: 'var(--mono)' }}>{t.losses}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>{/* end page-wrap */}
      </div>{/* end app-content */}

      {/* ── Inbox overlay ── */}
      {inboxOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
            display: 'flex', flexDirection: 'column',
          }}
          onClick={() => { setInboxOpen(false); setSelectedMessage(null); }}
        >
          <div
            style={{
              marginTop: 'auto',
              background: 'var(--bg)', borderRadius: '16px 16px 0 0',
              maxHeight: '85dvh', display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Inbox header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', borderBottom: '1px solid var(--border)',
              flexShrink: 0,
            }}>
              {selectedMessage ? (
                <button
                  onClick={() => setSelectedMessage(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0 }}
                >
                  ← Back
                </button>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Inbox</span>
                  {unreadCount > 0 && (
                    <span style={{ background: '#ef4444', color: '#fff', borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                      {unreadCount} unread
                    </span>
                  )}
                </div>
              )}
              <button
                onClick={() => { setInboxOpen(false); setSelectedMessage(null); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: '0 4px' }}
              >
                ×
              </button>
            </div>

            {/* Content */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '12px 16px' }}>
              {selectedMessage ? (
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                    {selectedMessage.messages.subject}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
                    From {selectedMessage.messages.sender_name} · {formatDate(selectedMessage.messages.created_at)}
                  </div>
                  <div style={{ fontSize: 15, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                    {selectedMessage.messages.body}
                  </div>
                </div>
              ) : inboxError ? (
                <div style={{ padding: '20px 0' }}>
                  <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#ef4444', marginBottom: 12 }}>
                    Could not load messages: {inboxError}
                  </div>
                </div>
              ) : inboxLoading ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading…</div>
              ) : inboxMessages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>✉</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>No messages yet</div>
                </div>
              ) : (
                inboxMessages.map(r => (
                  <div
                    key={r.id}
                    onClick={() => openMessage(r)}
                    style={{
                      padding: '12px 14px', borderRadius: 10, cursor: 'pointer', marginBottom: 8,
                      background: r.read ? 'rgba(255,255,255,0.02)' : 'rgba(59,130,246,0.08)',
                      border: `1px solid ${r.read ? 'var(--border)' : 'rgba(59,130,246,0.3)'}`,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 }}>
                        {!r.read && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />}
                        <span style={{ fontWeight: r.read ? 500 : 700, fontSize: 14, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.messages.subject}
                        </span>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                        {new Date(r.messages.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, paddingLeft: r.read ? 0 : 15 }}>
                      From {r.messages.sender_name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, paddingLeft: r.read ? 0 : 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.messages.body}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Game detail popup ── */}
      <Modal open={!!popupPlayerGame} onClose={() => setPopupPlayerGame(null)} maxWidth={520}>
        {popupPlayerGame && (
          <PlayerGameDetail
            asModal
            player={popupPlayerGame.player}
            game={popupPlayerGame.game}
            team={team}
          />
        )}
      </Modal>
    </div>
  );
}
