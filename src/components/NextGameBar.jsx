import { useState, useEffect } from 'react';
import { teamRecord } from '../utils/stats';
import { sortedUpcoming } from '../utils/sort';
import { getActiveSession } from '../utils/liveSession';

function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const game = new Date(dateStr + 'T00:00:00');
  game.setHours(0, 0, 0, 0);
  return Math.round((game - today) / (1000 * 60 * 60 * 24));
}

function daysLabel(n) {
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n < 0) return 'Past';
  return n + ' days';
}

function formatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function NextGameBar({ team, schedule, completedGames, onResumeGame }) {
  const [activeSession, setActiveSession] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getActiveSession(team.id).then(({ data }) => {
      if (!cancelled) setActiveSession(data || null);
    });
    return () => { cancelled = true; };
  }, [team.id]);

  const today = new Date().toISOString().slice(0, 10);
  const teamSchedule = schedule.filter(g => g.team_id === team.id);
  const upcoming = sortedUpcoming(teamSchedule.filter(g => g.game_date >= today));
  const nextGame = upcoming[0] || null;
  const teamGames = completedGames.filter(g => g.team_id === team.id);
  const record = teamRecord(teamGames);

  // Active session takes priority
  if (activeSession && onResumeGame) {
    return (
      <div className="next-game-bar next-game-bar-live" onClick={() => onResumeGame(activeSession)}>
        <div className="ngb-live-pulse" />
        <div style={{ flex: 1 }}>
          <div className="ngb-label" style={{ color: '#c9a84c' }}>GAME IN PROGRESS</div>
          <div className="ngb-opponent">vs. {activeSession.opponent}</div>
          <div className="ngb-meta">
            Set {activeSession.current_set} — {activeSession.home_score}-{activeSession.away_score} — Sets {activeSession.home_sets}-{activeSession.away_sets}
          </div>
        </div>
        <div className="ngb-resume-btn">Resume</div>
      </div>
    );
  }

  // Next upcoming game
  if (nextGame) {
    const days = daysUntil(nextGame.game_date);
    const pillColor = days === 0 ? '#16a34a' : '#c9a84c';
    return (
      <div className="next-game-bar">
        <div style={{ flex: 1 }}>
          <div className="ngb-label">NEXT GAME</div>
          <div className="ngb-opponent">
            vs. {nextGame.opponent}
            {nextGame.is_league && <span className="ngb-league-badge">LEAGUE</span>}
          </div>
          <div className="ngb-meta">{formatDate(nextGame.game_date)} · {nextGame.location || 'TBD'}</div>
        </div>
        <div className="ngb-days-pill" style={{ background: pillColor }}>
          {daysLabel(days)}
        </div>
      </div>
    );
  }

  // No upcoming games — show season record
  return (
    <div className="next-game-bar next-game-bar-record">
      <div style={{ flex: 1 }}>
        <div className="ngb-record">{record.w} – {record.l}</div>
        <div className="ngb-meta">{teamGames.length > 0 ? 'Season record' : 'No games played yet'}</div>
      </div>
      {teamGames.length > 0 && (
        <div className="ngb-meta" style={{ textAlign: 'right', fontSize: 11 }}>
          No upcoming games
        </div>
      )}
    </div>
  );
}
