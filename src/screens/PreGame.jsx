import { useState, useEffect } from 'react';
import { useData } from '../contexts/DataContext';
import { sortedUpcoming, sortByJersey } from '../utils/sort';
import PlayerBadge from '../components/PlayerBadge';
import { getActiveSession } from '../utils/liveSession';

const STEPS = ['setup', 'format', 'lineup'];

export default function PreGame({ team, scheduledGame, onBack, onStartGame, onResumeGame }) {
  const { players, schedule, refresh } = useData();
  const [step, setStep] = useState('setup');
  const [opponent, setOpponent] = useState(scheduledGame?.opponent || '');
  const [location, setLocation] = useState(scheduledGame?.location || 'Home');
  const [gameDate, setGameDate] = useState(scheduledGame?.game_date || new Date().toISOString().slice(0, 10));
  const [isLeague, setIsLeague] = useState(scheduledGame?.is_league || false);
  const [leagueTeamId, setLeagueTeamId] = useState(scheduledGame?.league_team_id || null);
  const [bestOf, setBestOf] = useState(5);
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [activeSession, setActiveSession] = useState(null);

  useEffect(() => { refresh(); }, [refresh]);

  // Check for active session
  useEffect(() => {
    let cancelled = false;
    async function check() {
      const { data } = await getActiveSession(team.id);
      if (!cancelled) setActiveSession(data || null);
    }
    check();
    return () => { cancelled = true; };
  }, [team.id]);

  const teamPlayers = sortByJersey(players.filter(p => p.team_id === team.id));
  const upcoming = sortedUpcoming(schedule.filter(s => s.team_id === team.id));

  // Auto-fill from scheduled game or next upcoming
  useEffect(() => {
    if (!scheduledGame && upcoming.length > 0 && !opponent) {
      setOpponent(upcoming[0].opponent);
      setLocation(upcoming[0].location || 'Home');
      setGameDate(upcoming[0].game_date);
      setIsLeague(upcoming[0].is_league || false);
      setLeagueTeamId(upcoming[0].league_team_id || null);
    }
  }, [upcoming.length]);

  // Default: all players selected
  useEffect(() => {
    if (teamPlayers.length > 0 && selectedPlayers.length === 0) {
      setSelectedPlayers(teamPlayers.map(p => p.id));
    }
  }, [teamPlayers.length]);

  function togglePlayer(id) {
    setSelectedPlayers(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  function handleStart() {
    if (!opponent.trim()) return;
    const roster = teamPlayers.filter(p => selectedPlayers.includes(p.id));
    onStartGame({
      opponent: opponent.trim(),
      location,
      gameDate,
      isLeague,
      leagueTeamId,
      bestOf,
      roster,
      scheduledGameId: scheduledGame?.id || (upcoming.length > 0 && upcoming[0].opponent === opponent.trim() ? upcoming[0].id : null),
    });
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{
        background: `linear-gradient(135deg, ${team.color || '#0d1f5c'}, ${team.color || '#1a3a8f'})`,
        color: '#fff', padding: '16px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={step === 'setup' ? onBack : () => setStep(step === 'lineup' ? 'format' : 'setup')}
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            Back
          </button>
          <div style={{ fontSize: 13, opacity: 0.6 }}>
            Step {STEPS.indexOf(step) + 1} of 3
          </div>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 8 }}>
          {step === 'setup' ? 'Game Setup' : step === 'format' ? 'Match Format' : 'Set Lineup'}
        </h1>
      </div>

      <div style={{ padding: '16px 20px', maxWidth: 600, margin: '0 auto' }}>
        {/* Resume active session banner */}
        {activeSession && onResumeGame && step === 'setup' && (
          <button
            className="resume-game-btn"
            style={{ marginBottom: 16 }}
            onClick={() => onResumeGame(activeSession)}
          >
            <div className="resume-game-label">RESUME IN-PROGRESS GAME</div>
            <div className="resume-game-detail">
              vs. {activeSession.opponent} — Set {activeSession.current_set} — {activeSession.home_score}-{activeSession.away_score}
            </div>
            <div className="resume-game-sets">
              Sets: {activeSession.home_sets}-{activeSession.away_sets}
            </div>
          </button>
        )}

        {/* Step 1: Game setup */}
        {step === 'setup' && (
          <>
            <div className="card">
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Opponent</label>
              <input
                value={opponent} onChange={e => setOpponent(e.target.value)} placeholder="Opponent name"
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 15, marginBottom: 12 }}
              />
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Location</label>
                  <select value={location} onChange={e => setLocation(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 15, marginBottom: 12 }}>
                    <option>Home</option><option>Away</option><option>Neutral</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Date</label>
                  <input type="date" value={gameDate} onChange={e => setGameDate(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 15, marginBottom: 12 }} />
                </div>
              </div>
              {isLeague && (
                <div style={{ fontSize: 12, background: 'rgba(26,58,143,0.15)', color: '#6b8cff', padding: '6px 10px', borderRadius: 6, fontWeight: 600 }}>
                  League Game — standings will update automatically
                </div>
              )}
            </div>
            <button
              onClick={() => setStep('format')} disabled={!opponent.trim()}
              style={{ width: '100%', padding: 16, marginTop: 16, background: team.color || '#1a3a8f', color: '#fff', borderRadius: 12, fontSize: 16, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: !opponent.trim() ? 0.5 : 1 }}
            >
              Next: Match Format
            </button>
          </>
        )}

        {/* Step 2: Match format */}
        {step === 'format' && (
          <>
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: 'var(--text)' }}>Match Format</div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                {[3, 5].map(n => (
                  <button key={n} onClick={() => setBestOf(n)}
                    style={{
                      padding: '20px 32px', borderRadius: 12, border: 'none', cursor: 'pointer',
                      background: bestOf === n ? (team.color || '#1a3a8f') : 'var(--card-hover)',
                      color: bestOf === n ? '#fff' : '#f0f4ff',
                      fontSize: 18, fontWeight: 700,
                      boxShadow: bestOf === n ? '0 4px 12px rgba(0,0,0,0.2)' : 'none',
                    }}
                  >
                    Best of {n}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 12 }}>
                {bestOf === 3 ? 'First to win 2 sets' : 'First to win 3 sets'}
              </div>
            </div>
            <button
              onClick={() => setStep('lineup')}
              style={{ width: '100%', padding: 16, marginTop: 16, background: team.color || '#1a3a8f', color: '#fff', borderRadius: 12, fontSize: 16, fontWeight: 700, border: 'none', cursor: 'pointer' }}
            >
              Next: Set Lineup
            </button>
          </>
        )}

        {/* Step 3: Lineup */}
        {step === 'lineup' && (
          <>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>
              Active Roster ({selectedPlayers.length}/{teamPlayers.length})
            </h3>
            {teamPlayers.map(p => {
              const selected = selectedPlayers.includes(p.id);
              return (
                <div key={p.id} className="game-row" onClick={() => togglePlayer(p.id)} style={{ opacity: selected ? 1 : 0.4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <PlayerBadge player={p} team={team} size={40} />
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {[p.jersey_number ? `#${p.jersey_number}` : null, p.position].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  </div>
                  <div style={{ width: 24, height: 24, borderRadius: 6, border: selected ? 'none' : '2px solid var(--border)', background: selected ? (team.color || '#1a3a8f') : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14 }}>
                    {selected && '✓'}
                  </div>
                </div>
              );
            })}
            <button
              onClick={handleStart} disabled={selectedPlayers.length === 0}
              style={{ width: '100%', padding: 16, marginTop: 16, background: '#c9a84c', color: 'var(--text)', borderRadius: 12, fontSize: 18, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: selectedPlayers.length === 0 ? 0.5 : 1 }}
            >
              Start Match
            </button>
          </>
        )}
      </div>
    </div>
  );
}
