import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { hpct, n2, n3, hcol, hlbl, playerTotals, computeStandings } from '../utils/stats';
import { pColors, mkInit } from '../utils/colors';
import { sortedUpcoming, sortedCompleted } from '../utils/sort';

const TABS = ['Season', 'Bests', 'Games', 'Efficiency', 'Schedule', 'Standings'];

export default function PlayerHome({ onSelectGame }) {
  const { currentUser, logout } = useAuth();
  const data = useData();
  const { players, completedGames, playerGameStats, schedule, leagueTeams, leagueResults, refresh } = data;
  const [tab, setTab] = useState('Season');

  useEffect(() => { refresh(); }, [refresh]);

  const player = players.find(p => p.id === currentUser?.player_id);
  const team = data.teams.find(t => t.id === currentUser?.team_id);
  if (!player || !team) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
        <p>Player data not found.</p>
        <button onClick={logout} style={{ marginTop: 16, padding: '8px 24px' }}>Logout</button>
      </div>
    );
  }

  const colors = player.colors || pColors(player.player_index ?? 0);
  const myStats = playerGameStats.filter(s => s.player_id === player.id);
  const totals = playerTotals(myStats);
  const sp = totals.sets_played;
  const h = hpct(totals.kills, totals.errors, totals.attempts);

  // Games with stats
  const gameIds = new Set(myStats.map(s => s.game_id));
  const myGames = sortedCompleted(completedGames.filter(g => gameIds.has(g.id)));

  // Bests
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
  const myLeagueTeams = leagueTeams.filter(lt => lt.team_id === team.id);
  const myLeagueResults = leagueResults.filter(lr => lr.team_id === team.id);
  const standings = computeStandings(myLeagueTeams, myLeagueResults);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0f1e' }}>
      <div style={{
        background: `linear-gradient(135deg, ${team.color || '#0d1f5c'}, ${team.color || '#1a3a8f'})`,
        color: '#fff', padding: '16px 20px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="player-badge" style={{ background: colors.bg, color: colors.text, width: 48, height: 48, fontSize: 16 }}>
              {player.initials || mkInit(player.name)}
            </span>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700 }}>{player.name}</h1>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{team.name}</div>
            </div>
          </div>
          <button onClick={logout} className="hub-logout-btn">Logout</button>
        </div>
      </div>

      <div style={{ padding: '12px 20px', maxWidth: 600, margin: '0 auto' }}>
        <div className="tab-bar" style={{ overflowX: 'auto' }}>
          {TABS.map(t => (
            <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}
              style={{ minWidth: 'auto', fontSize: 12, whiteSpace: 'nowrap' }}>
              {t}
            </button>
          ))}
        </div>

        {tab === 'Season' && (
          <div>
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 36, fontWeight: 700, color: hcol(totals.kills, totals.errors, totals.attempts) }}>
                {n3(h)}
              </div>
              <div style={{ fontSize: 13, color: hcol(totals.kills, totals.errors, totals.attempts), fontWeight: 600 }}>
                {hlbl(totals.kills, totals.errors, totals.attempts)}
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: 13, fontWeight: 600, color: '#8892a4', marginBottom: 12 }}>Per Set Averages</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, textAlign: 'center' }}>
                {[
                  { label: 'K/S', value: n2(sp > 0 ? totals.kills / sp : null) },
                  { label: 'A/S', value: n2(sp > 0 ? totals.aces / sp : null) },
                  { label: 'D/S', value: n2(sp > 0 ? totals.digs / sp : null) },
                  { label: 'AST/S', value: n2(sp > 0 ? totals.assists / sp : null) },
                  { label: 'B/S', value: n2(sp > 0 ? totals.blocks / sp : null) },
                  { label: 'Sets', value: sp },
                ].map((item, i) => (
                  <div key={i}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#8892a4', textTransform: 'uppercase' }}>{item.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'Bests' && (
          <div>
            {['kills', 'aces', 'digs', 'assists', 'blocks'].map(field => {
              const best = getBest(field);
              return (
                <div key={field} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#8892a4', textTransform: 'uppercase' }}>{field}</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>{best.value}</div>
                  </div>
                  {best.game && (
                    <div style={{ textAlign: 'right', fontSize: 12, color: '#8892a4' }}>
                      vs {best.game.opponent}<br />
                      {new Date(best.game.game_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === 'Games' && (
          <div>
            {myGames.length === 0 && <div className="empty-state">No games yet</div>}
            {myGames.map(g => {
              const gs = myStats.find(s => s.game_id === g.id);
              return (
                <div key={g.id} className="game-row" onClick={() => onSelectGame && onSelectGame(player, g)}>
                  <div>
                    <div style={{ fontWeight: 600 }}>vs {g.opponent}</div>
                    <div style={{ fontSize: 12, color: '#8892a4' }}>
                      {new Date(g.game_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {gs && <span style={{ fontSize: 12, color: '#8892a4' }}>{gs.kills}K {gs.digs}D</span>}
                    <span className={`game-result-badge ${g.result === 'W' ? 'win' : 'loss'}`}>{g.result}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'Efficiency' && (
          <div>
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#8892a4', marginBottom: 8 }}>Season Hitting %</div>
              <div style={{ fontSize: 48, fontWeight: 700, color: hcol(totals.kills, totals.errors, totals.attempts) }}>
                {n3(h)}
              </div>
              <div style={{ fontSize: 12, color: '#8892a4', marginTop: 8 }}>
                {totals.kills}K - {totals.errors}E / {totals.attempts} Att
              </div>
            </div>
            {/* Per-game hitting chart */}
            <div className="card">
              <div style={{ fontSize: 13, fontWeight: 600, color: '#8892a4', marginBottom: 8 }}>Game-by-Game</div>
              {myGames.map(g => {
                const gs = myStats.find(s => s.game_id === g.id);
                if (!gs) return null;
                const gh = hpct(gs.kills, gs.errors, gs.attempts);
                return (
                  <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ fontSize: 12 }}>vs {g.opponent}</span>
                    <span style={{ fontWeight: 700, color: hcol(gs.kills, gs.errors, gs.attempts) }}>{n3(gh)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'Schedule' && (
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Upcoming</h3>
            {upcoming.length === 0 && <div className="empty-state">No upcoming games</div>}
            {upcoming.map(g => (
              <div key={g.id} className="game-row">
                <div>
                  <div style={{ fontWeight: 600 }}>{g.opponent}</div>
                  <div style={{ fontSize: 12, color: '#8892a4' }}>
                    {new Date(g.game_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {g.location}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'Standings' && (
          <div>
            {team.league_name && <div style={{ fontSize: 14, fontWeight: 600, color: '#8892a4', marginBottom: 12 }}>{team.league_name}</div>}
            {standings.length === 0 ? (
              <div className="empty-state">No league data</div>
            ) : (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>#</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Team</th>
                      <th style={{ padding: '10px 8px', textAlign: 'center' }}>W</th>
                      <th style={{ padding: '10px 8px', textAlign: 'center' }}>L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((t, i) => (
                      <tr key={t.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)', fontWeight: t.is_us ? 700 : 400 }}>
                        <td style={{ padding: '10px 12px' }}>{i + 1}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: t.dot_color, marginRight: 8 }} />
                          <span style={{ color: t.text_color }}>{t.name}</span>
                        </td>
                        <td style={{ textAlign: 'center', padding: '10px 8px' }}>{t.wins}</td>
                        <td style={{ textAlign: 'center', padding: '10px 8px' }}>{t.losses}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
