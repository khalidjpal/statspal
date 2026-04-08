import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { sortedUpcoming, sortedCompleted } from '../utils/sort';
import { getActiveSession } from '../utils/liveSession';
import AddGameModal from './modals/AddGameModal';
import ManualResultModal from './modals/ManualResultModal';

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

export default function ScheduleTab({ team, schedule, completedGames, players, playerGameStats, leagueTeams, isAdmin, onSelectGame, onStartLive, onResumeGame, refresh }) {
  const [showAdd, setShowAdd] = useState(false);
  const [manualGame, setManualGame] = useState(null);
  const [activeSession, setActiveSession] = useState(null);

  const today = getToday();
  const teamSchedule = schedule.filter(g => g.team_id === team.id);
  const teamCompleted = completedGames.filter(g => g.team_id === team.id);

  // Check for active live session
  useEffect(() => {
    let cancelled = false;
    async function check() {
      const { data } = await getActiveSession(team.id);
      if (!cancelled) setActiveSession(data || null);
    }
    check();
    return () => { cancelled = true; };
  }, [team.id]);

  // Split schedule into past (no result yet), today, and future
  const pastUnplayed = teamSchedule.filter(g => g.game_date < today);
  const todayGames = teamSchedule.filter(g => g.game_date === today);
  const futureGames = teamSchedule.filter(g => g.game_date > today);

  // Upcoming = today + future, sorted earliest first
  const upcoming = sortedUpcoming([...todayGames, ...futureGames]);
  // Completed games sorted most recent first
  const completed = sortedCompleted(teamCompleted);

  // League teams for this team (for AddGameModal)
  const myLeagueTeams = (leagueTeams || []).filter(lt => lt.team_id === team.id);

  function formatDate(dateStr) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // Convert a scheduled game to a completed_games shell for ManualResultModal
  async function openManualEntry(scheduledGame) {
    const payload = {
      team_id: team.id,
      opponent: scheduledGame.opponent,
      game_date: scheduledGame.game_date,
      location: scheduledGame.location || 'Home',
    };
    // Try with league fields
    if (scheduledGame.is_league) {
      payload.is_league = true;
      payload.league_team_id = scheduledGame.league_team_id || null;
    }

    let { data: newGame, error } = await supabase.from('completed_games').insert(payload).select().single();

    // Fallback without league fields if columns don't exist
    if (error) {
      const fallback = {
        team_id: team.id,
        opponent: scheduledGame.opponent,
        game_date: scheduledGame.game_date,
        location: scheduledGame.location || 'Home',
      };
      const res = await supabase.from('completed_games').insert(fallback).select().single();
      newGame = res.data;
      error = res.error;
    }

    if (!error && newGame) {
      await supabase.from('schedule').delete().eq('id', scheduledGame.id);
      await refresh();
      setManualGame(newGame);
    }
  }

  return (
    <div>
      {/* Resume Game Banner */}
      {activeSession && onResumeGame && (
        <button
          className="resume-game-btn"
          onClick={() => onResumeGame(activeSession)}
        >
          <div className="resume-game-label">RESUME GAME</div>
          <div className="resume-game-detail">
            vs. {activeSession.opponent} — Set {activeSession.current_set} — {activeSession.home_score}-{activeSession.away_score}
          </div>
          <div className="resume-game-sets">
            Sets: {activeSession.home_sets}-{activeSession.away_sets}
          </div>
        </button>
      )}

      {isAdmin && (
        <button className="modal-btn-primary mb-16" onClick={() => setShowAdd(true)} style={{ width: '100%' }}>
          + Add Game
        </button>
      )}

      {/* Past unplayed games (need results) */}
      {pastUnplayed.length > 0 && (
        <>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#ef4444' }}>Needs Result</h3>
          {pastUnplayed.map(g => (
            <div key={g.id} className="game-row">
              <div>
                <div style={{ fontWeight: 600 }}>
                  {g.opponent}
                  {g.is_league && <span style={{ fontSize: 10, background: 'rgba(26,58,143,0.15)', color: '#1a3a8f', padding: '2px 6px', borderRadius: 4, marginLeft: 8, fontWeight: 700 }}>LEAGUE</span>}
                </div>
                <div style={{ fontSize: 12, color: '#8892a4' }}>
                  {formatDate(g.game_date)} · {g.location}
                </div>
              </div>
              {isAdmin && (
                <button
                  onClick={() => openManualEntry(g)}
                  style={{ background: '#c9a84c', color: '#000', padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer' }}
                >
                  Enter Result
                </button>
              )}
            </div>
          ))}
        </>
      )}

      {/* Upcoming games */}
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, marginTop: pastUnplayed.length > 0 ? 20 : 0 }}>Upcoming</h3>
      {upcoming.length === 0 && <div className="empty-state">No upcoming games</div>}
      {upcoming.map(g => {
        const isToday = g.game_date === today;
        return (
          <div key={g.id} className="game-row">
            <div>
              <div style={{ fontWeight: 600 }}>
                {g.opponent}
                {g.is_league && <span style={{ fontSize: 10, background: 'rgba(26,58,143,0.15)', color: '#1a3a8f', padding: '2px 6px', borderRadius: 4, marginLeft: 8, fontWeight: 700 }}>LEAGUE</span>}
                {isToday && <span style={{ fontSize: 10, background: 'rgba(16,185,129,0.1)', color: '#10b981', padding: '2px 6px', borderRadius: 4, marginLeft: 8, fontWeight: 700 }}>TODAY</span>}
              </div>
              <div style={{ fontSize: 12, color: '#8892a4' }}>
                {formatDate(g.game_date)} · {g.location}
              </div>
            </div>
            {isAdmin && (
              <button
                onClick={() => onStartLive && onStartLive(g)}
                style={{ background: '#c9a84c', color: '#000', padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer' }}
              >
                {isToday ? 'Start Live' : 'Start Live'}
              </button>
            )}
          </div>
        );
      })}

      {/* Completed games */}
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, marginTop: 20 }}>Completed</h3>
      {completed.length === 0 && <div className="empty-state">No completed games</div>}
      {completed.map(g => (
        <div key={g.id} className="game-row" onClick={() => onSelectGame(g)} style={{ cursor: 'pointer' }}>
          <div>
            <div style={{ fontWeight: 600 }}>
              {g.opponent}
              {g.is_league && <span style={{ fontSize: 10, background: 'rgba(26,58,143,0.15)', color: '#1a3a8f', padding: '2px 6px', borderRadius: 4, marginLeft: 8, fontWeight: 700 }}>LEAGUE</span>}
            </div>
            <div style={{ fontSize: 12, color: '#8892a4' }}>
              {formatDate(g.game_date)} · {g.location}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {g.result ? (
              <>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{g.home_sets}-{g.away_sets}</span>
                <span className={`game-result-badge ${g.result === 'W' ? 'win' : 'loss'}`}>
                  {g.result}
                </span>
                {isAdmin && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setManualGame(g); }}
                    style={{ background: 'rgba(128,128,128,0.1)', color: 'var(--text-secondary)', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer' }}
                  >
                    Edit
                  </button>
                )}
              </>
            ) : (
              isAdmin && (
                <button
                  onClick={(e) => { e.stopPropagation(); setManualGame(g); }}
                  style={{ background: '#c9a84c', color: '#000', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer' }}
                >
                  Enter Result
                </button>
              )
            )}
          </div>
        </div>
      ))}

      {showAdd && (
        <AddGameModal
          teamId={team.id}
          leagueTeams={myLeagueTeams}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); refresh(); }}
        />
      )}

      {manualGame && (
        <ManualResultModal
          game={manualGame}
          team={team}
          players={players || []}
          existingStats={(playerGameStats || []).filter(s => s.game_id === manualGame.id)}
          onClose={() => setManualGame(null)}
          onSaved={() => { setManualGame(null); refresh(); }}
        />
      )}
    </div>
  );
}
