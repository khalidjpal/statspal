import { useState, useEffect } from 'react';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import { supabase } from '../supabase';
import { hpct, n3, hcol, teamRecord } from '../utils/stats';
import { mkInit } from '../utils/colors';
import { sortByJersey, sortedCompleted } from '../utils/sort';
import GodStatsModal from '../components/modals/GodStatsModal';
import AddPlayerModal from '../components/modals/AddPlayerModal';
import EditPlayerModal from '../components/modals/EditPlayerModal';
import ManualResultModal from '../components/modals/ManualResultModal';
import EditLeagueResultModal from '../components/modals/EditLeagueResultModal';

const TABS = ['Teams', 'Players', 'Games', 'Stats', 'League', 'Accounts'];

export default function GodMode({ onBack }) {
  const data = useData();
  const { teams, players, completedGames, playerGameStats, accounts, coachAssignments, schedule, leagueTeams, leagueResults, refresh } = data;
  const { addToast } = useToast();
  const [tab, setTab] = useState('Teams');
  const [editStatsGame, setEditStatsGame] = useState(null);
  const [addingPlayerTeam, setAddingPlayerTeam] = useState(null);
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [editGameGod, setEditGameGod] = useState(null);
  const [editingLeagueResult, setEditingLeagueResult] = useState(null);

  // Admin account creation
  const [accName, setAccName] = useState('');
  const [accUser, setAccUser] = useState('');
  const [accPass, setAccPass] = useState('');
  const [accRole, setAccRole] = useState('admin');
  const [accTeamId, setAccTeamId] = useState('');
  const [accError, setAccError] = useState('');
  const [accCreds, setAccCreds] = useState(null);

  async function createAccount() {
    if (!accName.trim() || !accUser.trim() || !accPass.trim()) { setAccError('All fields required'); return; }
    setAccError('');
    const { error } = await supabase.from('accounts').insert({
      name: accName.trim(), username: accUser.trim(), password_plain: accPass.trim(),
      role: accRole, team_id: accTeamId || null, active: true,
    });
    if (error) { setAccError(error.message.includes('duplicate') ? 'Username taken' : error.message); return; }
    setAccCreds({ name: accName.trim(), username: accUser.trim(), password: accPass.trim(), role: accRole });
    setAccName(''); setAccUser(''); setAccPass('');
    refresh();
  }

  useEffect(() => { refresh(); }, [refresh]);

  // Quick add team
  const [newTeam, setNewTeam] = useState('');
  async function addTeam() {
    if (!newTeam.trim()) return;
    const r = await supabase.from('teams').insert({ name: newTeam.trim() });
    if (r.error) addToast('Failed to add team: ' + r.error.message);
    else addToast('Team added', 'success');
    setNewTeam('');
    await refresh();
  }

  // Quick add completed game
  const [gameTeamId, setGameTeamId] = useState('');
  const [gameOpp, setGameOpp] = useState('');
  const [gameDate, setGameDate] = useState('');
  const [gameResult, setGameResult] = useState('W');
  const [gameHS, setGameHS] = useState(3);
  const [gameAS, setGameAS] = useState(0);
  async function addGame() {
    if (!gameTeamId || !gameOpp.trim() || !gameDate) return;
    const r = await supabase.from('completed_games').insert({
      team_id: gameTeamId,
      opponent: gameOpp.trim(),
      game_date: gameDate,
      result: gameResult,
      home_sets: gameHS,
      away_sets: gameAS,
    });
    if (r.error) addToast('Failed to add game: ' + r.error.message);
    else addToast('Game added', 'success');
    setGameOpp('');
    await refresh();
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{
        background: 'linear-gradient(135deg, #4a148c, #7b1fa2)',
        color: '#fff', padding: '16px 20px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            Back
          </button>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 8 }}>God Mode</h1>
        <div style={{ fontSize: 13, opacity: 0.6 }}>Direct database access</div>
      </div>

      <div style={{ padding: '16px 20px', maxWidth: 800, margin: '0 auto' }}>
        <div className="tab-bar">
          {TABS.map(t => (
            <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}
              style={tab === t ? { color: '#7b1fa2', borderBottomColor: '#7b1fa2' } : undefined}>
              {t}
            </button>
          ))}
        </div>

        {tab === 'Teams' && (
          <div>
            <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#8892a4' }}>Quick Add Team</label>
                <input value={newTeam} onChange={e => setNewTeam(e.target.value)} placeholder="Team name"
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 14 }}
                  onKeyDown={e => e.key === 'Enter' && addTeam()} />
              </div>
              <button onClick={addTeam} className="modal-btn-primary" style={{ background: '#7b1fa2' }}>Add</button>
            </div>
            {teams.map(t => {
              const record = teamRecord(completedGames.filter(g => g.team_id === t.id));
              return (
                <div key={t.id} className="game-row">
                  <div>
                    <div style={{ fontWeight: 600, color: '#f0f4ff' }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: '#8892a4' }}>
                      {[t.gender, t.level, t.season].filter(Boolean).join(' · ')} · {record.w}-{record.l}
                    </div>
                  </div>
                  <button onClick={async () => { if (confirm(`Delete ${t.name}?`)) { const r = await supabase.from('teams').delete().eq('id', t.id); if (r.error) addToast('Failed: ' + r.error.message); else addToast('Team deleted', 'success'); await refresh(); }}}
                    style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'Players' && (
          <div>
            {teams.map(t => {
              const tp = sortByJersey(players.filter(p => p.team_id === t.id));
              const teamColor = t.color || '#1a3a8f';
              return (
                <div key={t.id} style={{ marginBottom: 20 }}>
                  {/* Team color banner */}
                  <div style={{
                    background: teamColor,
                    borderRadius: '12px 12px 0 0',
                    padding: '12px 16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>{t.name}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>
                        {tp.length} {tp.length === 1 ? 'player' : 'players'}
                        {t.gender ? ` · ${t.gender}` : ''}
                        {t.level ? ` · ${t.level}` : ''}
                      </div>
                    </div>
                    <button
                      onClick={() => setAddingPlayerTeam(t)}
                      style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: '1px solid rgba(255,255,255,0.35)', cursor: 'pointer' }}
                    >
                      + Add Player
                    </button>
                  </div>

                  {/* Player rows with colored left border */}
                  <div style={{ borderLeft: `4px solid ${teamColor}`, borderBottom: `1px solid var(--border)`, borderRight: `1px solid var(--border)`, borderRadius: '0 0 12px 12px', overflow: 'hidden', background: 'var(--card)' }}>
                    {tp.length === 0 ? (
                      <div style={{ padding: '20px', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
                        No players yet — click + Add Player to get started
                      </div>
                    ) : (
                      tp.map((p, pi) => (
                        <div key={p.id} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '12px 14px',
                          borderTop: pi > 0 ? '1px solid var(--border)' : 'none',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{
                              width: 34, height: 34, borderRadius: '50%',
                              background: p.colors?.bg || teamColor,
                              color: p.colors?.text || '#fff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 11, fontWeight: 800, flexShrink: 0,
                            }}>
                              {p.initials || mkInit(p.name)}
                            </span>
                            <div>
                              <div style={{ fontWeight: 600, color: 'var(--text)' }}>{p.name}</div>
                              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                {[p.jersey_number ? `#${p.jersey_number}` : null, p.position, p.grade, p.height].filter(Boolean).join(' · ')}
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => setEditingPlayer(p)}
                              style={{ background: `${teamColor}22`, color: teamColor, padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, border: `1px solid ${teamColor}55`, cursor: 'pointer' }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={async () => { if (confirm(`Delete ${p.name}? This also deletes all their stats.`)) { await supabase.from('player_game_stats').delete().eq('player_id', p.id); const r = await supabase.from('players').delete().eq('id', p.id); if (r.error) addToast('Failed: ' + r.error.message); else addToast('Player deleted', 'success'); await refresh(); }}}
                              style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer' }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
            {teams.length === 0 && <div className="empty-state">No teams yet</div>}
          </div>
        )}

        {tab === 'Games' && (
          <div>
            <div className="card">
              <div style={{ fontSize: 13, fontWeight: 600, color: '#8892a4', marginBottom: 8 }}>Quick Add Completed Game</div>
              <select value={gameTeamId} onChange={e => setGameTeamId(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 14, marginBottom: 8 }}>
                <option value="">Select team...</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <input value={gameOpp} onChange={e => setGameOpp(e.target.value)} placeholder="Opponent"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 14, marginBottom: 8 }} />
              <input type="date" value={gameDate} onChange={e => setGameDate(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 14, marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <select value={gameResult} onChange={e => setGameResult(e.target.value)}
                  style={{ flex: 1, padding: '8px 12px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 14 }}>
                  <option value="W">Win</option>
                  <option value="L">Loss</option>
                </select>
                <input type="number" min={0} max={3} value={gameHS} onChange={e => setGameHS(+e.target.value)} placeholder="Home"
                  style={{ width: 60, padding: '8px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 14, textAlign: 'center' }} />
                <span style={{ alignSelf: 'center' }}>-</span>
                <input type="number" min={0} max={3} value={gameAS} onChange={e => setGameAS(+e.target.value)} placeholder="Away"
                  style={{ width: 60, padding: '8px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 14, textAlign: 'center' }} />
              </div>
              <button onClick={addGame} className="modal-btn-primary" style={{ background: '#7b1fa2', width: '100%' }}>Add Game</button>
            </div>

            {sortedCompleted(completedGames).map(g => {
              const t = teams.find(t => t.id === g.team_id);
              return (
                <div key={g.id} className="game-row">
                  <div>
                    <div style={{ fontWeight: 600, color: '#f0f4ff' }}>{t?.name} vs {g.opponent}</div>
                    <div style={{ fontSize: 12, color: '#8892a4' }}>
                      {g.result} {g.home_sets}-{g.away_sets} · {g.game_date}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setEditStatsGame(g)}
                      style={{ background: 'rgba(123,31,162,0.15)', color: '#7b1fa2', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                      Stats
                    </button>
                    <button onClick={() => setEditGameGod(g)}
                      style={{ background: 'rgba(26,58,143,0.15)', color: '#60a5fa', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                      Edit
                    </button>
                    <button onClick={async () => {
                      if (!confirm('Delete game? This also deletes all player stats for this game.')) return;
                      const r1 = await supabase.from('player_game_stats').delete().eq('game_id', g.id);
                      if (r1.error) addToast('Failed to delete player stats: ' + r1.error.message);
                      // Delete any associated league result
                      if (g.is_league && g.league_team_id) {
                        await supabase.from('league_results').delete()
                          .eq('team_id', g.team_id)
                          .eq('game_date', g.game_date)
                          .or(`home_league_team_id.eq.${g.league_team_id},away_league_team_id.eq.${g.league_team_id}`);
                      }
                      const r2 = await supabase.from('completed_games').delete().eq('id', g.id);
                      if (r2.error) addToast('Failed to delete game: ' + r2.error.message);
                      else addToast('Game deleted', 'success');
                      await refresh();
                    }}
                      style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'Stats' && (
          <div>
            <div style={{ fontSize: 13, color: '#8892a4', marginBottom: 12 }}>Select a game from the Games tab to edit stats, or browse stats below.</div>
            {sortedCompleted(completedGames).map(g => {
              const t = teams.find(t => t.id === g.team_id);
              const gameStats = playerGameStats.filter(s => s.game_id === g.id);
              if (gameStats.length === 0) return null;
              return (
                <div key={g.id} className="card" style={{ marginBottom: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4, color: '#f0f4ff' }}>{t?.name} vs {g.opponent}</div>
                  <div style={{ fontSize: 12, color: '#8892a4', marginBottom: 8 }}>{g.game_date} · {g.result} {g.home_sets}-{g.away_sets}</div>
                  {gameStats.map(s => {
                    const p = players.find(p => p.id === s.player_id);
                    return (
                      <div key={s.id} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                        <span style={{ color: '#f0f4ff' }}>{p?.name || 'Unknown'}</span>
                        <span style={{ color: '#8892a4' }}>
                          {s.kills}K {s.aces}A {s.digs}D {s.assists}AST {s.blocks}B {s.errors}E
                          <span style={{ color: hcol(s.kills, s.errors, s.attempts), fontWeight: 600, marginLeft: 8 }}>
                            {n3(hpct(s.kills, s.errors, s.attempts))}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {tab === 'League' && (
          <div>
            {teams.map(t => {
              const teamLeagueTeams = leagueTeams.filter(lt => lt.team_id === t.id);
              const teamLeagueResults = leagueResults.filter(lr => lr.team_id === t.id);
              if (teamLeagueTeams.length === 0) return null;
              const teamColor = t.color || '#1a3a8f';
              const sorted = [...teamLeagueResults].sort((a, b) => a.game_date?.localeCompare(b.game_date));
              return (
                <div key={t.id} style={{ marginBottom: 24 }}>
                  <div style={{ background: teamColor, borderRadius: '12px 12px 0 0', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>{t.name}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>{teamLeagueResults.length} results recorded</div>
                    </div>
                  </div>
                  <div style={{ border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 12px 12px', background: 'var(--card)', overflow: 'hidden' }}>
                    {sorted.length === 0 ? (
                      <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No league results recorded</div>
                    ) : (
                      sorted.map((lr, idx) => {
                        const home = teamLeagueTeams.find(lt => lt.id === lr.home_league_team_id);
                        const away = teamLeagueTeams.find(lt => lt.id === lr.away_league_team_id);
                        return (
                          <div key={lr.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderTop: idx > 0 ? '1px solid var(--border)' : 'none' }}>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
                                {home?.name || '?'} <span style={{ color: teamColor }}>{lr.home_sets}–{lr.away_sets}</span> {away?.name || '?'}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{lr.game_date}</div>
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={() => setEditingLeagueResult(lr)}
                                style={{ background: `${teamColor}22`, color: teamColor, padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: `1px solid ${teamColor}44`, cursor: 'pointer' }}
                              >
                                Edit
                              </button>
                              <button
                                onClick={async () => {
                                  if (!confirm('Delete this league result? Standings will update immediately.')) return;
                                  const r = await supabase.from('league_results').delete().eq('id', lr.id);
                                  if (r.error) addToast('Failed: ' + r.error.message);
                                  else addToast('League result deleted', 'success');
                                  await refresh();
                                }}
                                style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer' }}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
            {teams.filter(t => leagueTeams.some(lt => lt.team_id === t.id)).length === 0 && (
              <div className="empty-state">No league teams set up yet</div>
            )}
          </div>
        )}

        {tab === 'Accounts' && (
          <div>
            {accCreds && (
              <div style={{ background: 'rgba(16,185,129,0.1)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <div style={{ fontWeight: 700, color: '#10b981', marginBottom: 8 }}>Account Created!</div>
                <div style={{ fontSize: 13, color: '#f0f4ff' }}><strong>Name:</strong> {accCreds.name}</div>
                <div style={{ fontSize: 13, color: '#f0f4ff' }}><strong>Username:</strong> {accCreds.username}</div>
                <div style={{ fontSize: 13, color: '#f0f4ff' }}><strong>Password:</strong> {accCreds.password}</div>
                <div style={{ fontSize: 13, color: '#f0f4ff' }}><strong>Role:</strong> {accCreds.role}</div>
                <div style={{ fontSize: 11, color: '#ef4444', marginTop: 8 }}>Save these credentials.</div>
                <button onClick={() => setAccCreds(null)} style={{ marginTop: 8, fontSize: 12, background: '#10b981', color: '#fff', padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer' }}>Dismiss</button>
              </div>
            )}
            <div className="card">
              <div style={{ fontSize: 13, fontWeight: 600, color: '#8892a4', marginBottom: 8 }}>Create Account</div>
              {accError && <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 8 }}>{accError}</div>}
              <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                {['admin', 'coach'].map(r => (
                  <button key={r} onClick={() => setAccRole(r)}
                    style={{ flex: 1, padding: 8, fontSize: 12, fontWeight: 600, background: accRole === r ? '#7b1fa2' : '#111827', color: accRole === r ? '#fff' : '#8892a4', border: 'none', cursor: 'pointer' }}>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </button>
                ))}
              </div>
              <input value={accName} onChange={e => setAccName(e.target.value)} placeholder="Full name" style={{ width: '100%', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 14, marginBottom: 8 }} />
              <input value={accUser} onChange={e => setAccUser(e.target.value)} placeholder="Username" style={{ width: '100%', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 14, marginBottom: 8 }} />
              <input value={accPass} onChange={e => setAccPass(e.target.value)} placeholder="Password" style={{ width: '100%', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 14, marginBottom: 8 }} />
              {accRole === 'coach' && (
                <select value={accTeamId} onChange={e => setAccTeamId(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 14, marginBottom: 8 }}>
                  <option value="">No team</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
              <button onClick={createAccount} className="modal-btn-primary" style={{ background: '#7b1fa2', width: '100%' }}>Create</button>
            </div>

            <h3 style={{ fontSize: 14, fontWeight: 700, margin: '16px 0 8px', color: '#7b1fa2' }}>All Accounts</h3>
            {accounts.map(acc => {
              const accTeamIds = (coachAssignments || []).filter(a => a.account_id === acc.id).map(a => a.team_id);
              // Include legacy team_id
              if (acc.team_id && !accTeamIds.includes(acc.team_id)) accTeamIds.push(acc.team_id);
              const accTeams = teams.filter(t => accTeamIds.includes(t.id));

              return (
                <div key={acc.id} className="card" style={{ marginBottom: 8, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: acc.role === 'coach' ? 8 : 0 }}>
                    <div>
                      <div style={{ fontWeight: 600, color: '#f0f4ff' }}>{acc.name}</div>
                      <div style={{ fontSize: 12, color: '#8892a4' }}>
                        @{acc.username} · {acc.role}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 12, fontWeight: 600, background: acc.active ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: acc.active ? '#10b981' : '#ef4444' }}>
                        {acc.active ? 'Active' : 'Off'}
                      </span>
                      <button onClick={async () => { await supabase.from('accounts').update({ active: !acc.active }).eq('id', acc.id); await refresh(); }}
                        style={{ background: 'rgba(123,31,162,0.15)', color: '#7b1fa2', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                        {acc.active ? 'Disable' : 'Enable'}
                      </button>
                      <button onClick={async () => { if (confirm(`Delete ${acc.name}?`)) { await supabase.from('coach_team_assignments').delete().eq('account_id', acc.id); await supabase.from('accounts').delete().eq('id', acc.id); await refresh(); }}}
                        style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Coach team assignments */}
                  {acc.role === 'coach' && (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#8892a4', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Team Access</div>
                      {accTeams.length === 0 && (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>No teams assigned</div>
                      )}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        {accTeams.map(t => (
                          <span key={t.id} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            background: `${t.color || '#1a3a8f'}22`, color: t.color || '#6b8cff',
                            padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                            border: `1px solid ${t.color || '#1a3a8f'}44`,
                          }}>
                            {t.name}
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                // Remove from coach_team_assignments
                                await supabase.from('coach_team_assignments').delete()
                                  .eq('account_id', acc.id).eq('team_id', t.id);
                                // Also clear legacy team_id if it matches
                                if (acc.team_id === t.id) {
                                  await supabase.from('accounts').update({ team_id: null }).eq('id', acc.id);
                                }
                                addToast(`Removed ${t.name}`, 'success');
                                await refresh();
                              }}
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14, fontWeight: 700, padding: 0, lineHeight: 1 }}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                      <select
                        value=""
                        onChange={async (e) => {
                          const tid = e.target.value;
                          if (!tid) return;
                          const { error } = await supabase.from('coach_team_assignments').insert({ account_id: acc.id, team_id: tid });
                          if (error) {
                            if (error.message.includes('duplicate')) addToast('Already assigned');
                            else addToast('Failed: ' + error.message);
                          } else {
                            addToast(`Assigned to ${teams.find(t => t.id === tid)?.name}`, 'success');
                          }
                          await refresh();
                        }}
                        style={{ width: '100%', padding: '6px 10px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, fontSize: 12, background: 'var(--card)', color: 'var(--text)' }}
                      >
                        <option value="">+ Assign team...</option>
                        {teams.filter(t => !accTeamIds.includes(t.id)).map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
            {accounts.length === 0 && <div className="empty-state">No accounts</div>}
          </div>
        )}
      </div>

      {editStatsGame && (
        <GodStatsModal
          game={editStatsGame}
          players={players}
          existingStats={playerGameStats.filter(s => s.game_id === editStatsGame.id)}
          onClose={() => setEditStatsGame(null)}
          onSaved={() => { setEditStatsGame(null); refresh(); }}
        />
      )}

      {addingPlayerTeam && (
        <AddPlayerModal
          teamId={addingPlayerTeam.id}
          playerCount={players.filter(p => p.team_id === addingPlayerTeam.id).length}
          onClose={() => setAddingPlayerTeam(null)}
          onSaved={() => { setAddingPlayerTeam(null); refresh(); }}
        />
      )}

      {editingPlayer && (
        <EditPlayerModal
          player={editingPlayer}
          onClose={() => setEditingPlayer(null)}
          onSaved={() => { setEditingPlayer(null); refresh(); }}
        />
      )}

      {editingLeagueResult && (
        <EditLeagueResultModal
          result={editingLeagueResult}
          allLeagueTeams={leagueTeams}
          onClose={() => setEditingLeagueResult(null)}
          onSaved={() => { setEditingLeagueResult(null); refresh(); }}
        />
      )}

      {editGameGod && (() => {
        const gameTeam = teams.find(t => t.id === editGameGod.team_id);
        return gameTeam ? (
          <ManualResultModal
            game={editGameGod}
            team={gameTeam}
            players={players}
            existingStats={playerGameStats.filter(s => s.game_id === editGameGod.id)}
            onClose={() => setEditGameGod(null)}
            onSaved={() => { setEditGameGod(null); refresh(); }}
          />
        ) : null;
      })()}
    </div>
  );
}
