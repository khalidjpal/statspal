import { useState, useEffect } from 'react';
import { useData } from '../contexts/DataContext';
import { supabase } from '../supabase';
import { hpct, n3, hcol, teamRecord } from '../utils/stats';
import GodStatsModal from '../components/modals/GodStatsModal';

const TABS = ['Teams', 'Players', 'Games', 'Stats'];

export default function GodMode({ onBack }) {
  const data = useData();
  const { teams, players, completedGames, playerGameStats, schedule, refresh } = data;
  const [tab, setTab] = useState('Teams');
  const [editStatsGame, setEditStatsGame] = useState(null);

  useEffect(() => { refresh(); }, [refresh]);

  // Quick add team
  const [newTeam, setNewTeam] = useState('');
  async function addTeam() {
    if (!newTeam.trim()) return;
    await supabase.from('teams').insert({ name: newTeam.trim() });
    setNewTeam('');
    refresh();
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
    await supabase.from('completed_games').insert({
      team_id: gameTeamId,
      opponent: gameOpp.trim(),
      game_date: gameDate,
      result: gameResult,
      home_sets: gameHS,
      away_sets: gameAS,
    });
    setGameOpp('');
    refresh();
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f0fa' }}>
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
                <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>Quick Add Team</label>
                <input value={newTeam} onChange={e => setNewTeam(e.target.value)} placeholder="Team name"
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #ccc', borderRadius: 8, fontSize: 14 }}
                  onKeyDown={e => e.key === 'Enter' && addTeam()} />
              </div>
              <button onClick={addTeam} className="modal-btn-primary" style={{ background: '#7b1fa2' }}>Add</button>
            </div>
            {teams.map(t => {
              const record = teamRecord(completedGames.filter(g => g.team_id === t.id));
              return (
                <div key={t.id} className="game-row">
                  <div>
                    <div style={{ fontWeight: 600 }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: '#888' }}>
                      {[t.gender, t.level, t.season].filter(Boolean).join(' · ')} · {record.w}-{record.l}
                    </div>
                  </div>
                  <button onClick={async () => { if (confirm(`Delete ${t.name}?`)) { await supabase.from('teams').delete().eq('id', t.id); refresh(); }}}
                    style={{ background: '#fdecea', color: '#8b1a1a', padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
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
              const tp = players.filter(p => p.team_id === t.id);
              if (tp.length === 0) return null;
              return (
                <div key={t.id}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, margin: '12px 0 8px', color: '#7b1fa2' }}>{t.name}</h3>
                  {tp.map(p => (
                    <div key={p.id} className="game-row">
                      <div>
                        <div style={{ fontWeight: 600 }}>{p.name}</div>
                        <div style={{ fontSize: 12, color: '#888' }}>
                          {[p.jersey_number ? `#${p.jersey_number}` : null, p.position].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <button onClick={async () => { if (confirm(`Delete ${p.name}?`)) { await supabase.from('player_game_stats').delete().eq('player_id', p.id); await supabase.from('players').delete().eq('id', p.id); refresh(); }}}
                        style={{ background: '#fdecea', color: '#8b1a1a', padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {tab === 'Games' && (
          <div>
            <div className="card">
              <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 8 }}>Quick Add Completed Game</div>
              <select value={gameTeamId} onChange={e => setGameTeamId(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #ccc', borderRadius: 8, fontSize: 14, marginBottom: 8 }}>
                <option value="">Select team...</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <input value={gameOpp} onChange={e => setGameOpp(e.target.value)} placeholder="Opponent"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #ccc', borderRadius: 8, fontSize: 14, marginBottom: 8 }} />
              <input type="date" value={gameDate} onChange={e => setGameDate(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #ccc', borderRadius: 8, fontSize: 14, marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <select value={gameResult} onChange={e => setGameResult(e.target.value)}
                  style={{ flex: 1, padding: '8px 12px', border: '1px solid #ccc', borderRadius: 8, fontSize: 14 }}>
                  <option value="W">Win</option>
                  <option value="L">Loss</option>
                </select>
                <input type="number" min={0} max={3} value={gameHS} onChange={e => setGameHS(+e.target.value)} placeholder="Home"
                  style={{ width: 60, padding: '8px', border: '1px solid #ccc', borderRadius: 8, fontSize: 14, textAlign: 'center' }} />
                <span style={{ alignSelf: 'center' }}>-</span>
                <input type="number" min={0} max={3} value={gameAS} onChange={e => setGameAS(+e.target.value)} placeholder="Away"
                  style={{ width: 60, padding: '8px', border: '1px solid #ccc', borderRadius: 8, fontSize: 14, textAlign: 'center' }} />
              </div>
              <button onClick={addGame} className="modal-btn-primary" style={{ background: '#7b1fa2', width: '100%' }}>Add Game</button>
            </div>

            {completedGames.map(g => {
              const t = teams.find(t => t.id === g.team_id);
              return (
                <div key={g.id} className="game-row">
                  <div>
                    <div style={{ fontWeight: 600 }}>{t?.name} vs {g.opponent}</div>
                    <div style={{ fontSize: 12, color: '#888' }}>
                      {g.result} {g.home_sets}-{g.away_sets} · {g.game_date}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setEditStatsGame(g)}
                      style={{ background: '#f0e6fa', color: '#7b1fa2', padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                      Stats
                    </button>
                    <button onClick={async () => { if (confirm('Delete game?')) { await supabase.from('player_game_stats').delete().eq('game_id', g.id); await supabase.from('completed_games').delete().eq('id', g.id); refresh(); }}}
                      style={{ background: '#fdecea', color: '#8b1a1a', padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
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
            <div style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>Select a game from the Games tab to edit stats, or browse stats below.</div>
            {completedGames.map(g => {
              const t = teams.find(t => t.id === g.team_id);
              const gameStats = playerGameStats.filter(s => s.game_id === g.id);
              if (gameStats.length === 0) return null;
              return (
                <div key={g.id} className="card" style={{ marginBottom: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{t?.name} vs {g.opponent}</div>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>{g.game_date} · {g.result} {g.home_sets}-{g.away_sets}</div>
                  {gameStats.map(s => {
                    const p = players.find(p => p.id === s.player_id);
                    return (
                      <div key={s.id} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                        <span>{p?.name || 'Unknown'}</span>
                        <span style={{ color: '#888' }}>
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
    </div>
  );
}
