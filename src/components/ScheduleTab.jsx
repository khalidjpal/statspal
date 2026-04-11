import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { supabase } from '../supabase';
import { useData } from '../contexts/DataContext';
import { sortedUpcoming, sortedCompleted } from '../utils/sort';
import { getActiveSession } from '../utils/liveSession';
import AddGameModal from './modals/AddGameModal';
import ManualResultModal from './modals/ManualResultModal';

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateParts(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return {
    month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    day:   d.getDate(),
    dow:   d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
  };
}

function formatShortDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function daysUntilLabel(dateStr, today) {
  const diff = Math.round(
    (new Date(dateStr + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000
  );
  if (diff === 0) return 'TODAY';
  if (diff === 1) return 'TOMORROW';
  return `IN ${diff} DAYS`;
}

export default function ScheduleTab({ team, schedule, completedGames, players, playerGameStats, leagueTeams, isAdmin, onSelectGame, onStartLive, onResumeGame, refresh }) {
  const { leagueResults } = useData();
  const [showAdd, setShowAdd]     = useState(false);
  const [manualGame, setManualGame] = useState(null);
  const [activeSession, setActiveSession] = useState(null);

  const timelineRef  = useRef(null);
  const nextGameRef  = useRef(null);

  const today = getToday();
  const teamSchedule  = schedule.filter(g => g.team_id === team.id);
  const teamCompleted = completedGames.filter(g => g.team_id === team.id);

  useEffect(() => {
    let cancelled = false;
    getActiveSession(team.id).then(({ data }) => {
      if (!cancelled) setActiveSession(data || null);
    });
    return () => { cancelled = true; };
  }, [team.id]);

  const pastUnplayed = teamSchedule.filter(g => g.game_date < today);
  const todayGames   = teamSchedule.filter(g => g.game_date === today);
  const futureGames  = teamSchedule.filter(g => g.game_date > today);
  const upcoming     = sortedUpcoming([...todayGames, ...futureGames]);
  const completed    = sortedCompleted(teamCompleted); // most recent first

  const myLeagueTeams    = (leagueTeams || []).filter(lt => lt.team_id === team.id);
  const ourLeagueTeam    = myLeagueTeams.find(lt => lt.is_us);

  // Season record
  const { wins, losses, leagueWins, leagueLosses } = useMemo(() => {
    let w = 0, l = 0, lw = 0, ll = 0;
    for (const g of teamCompleted) {
      if (g.result === 'W') w++; else if (g.result === 'L') l++;
      if (g.is_league) { if (g.result === 'W') lw++; else if (g.result === 'L') ll++; }
    }
    return { wins: w, losses: l, leagueWins: lw, leagueLosses: ll };
  }, [teamCompleted]);

  const hasLeague = leagueWins + leagueLosses > 0;
  const gamesLeft = upcoming.length + pastUnplayed.length;
  const nextGame  = upcoming[0] || null;
  const restUpcoming = upcoming.slice(1);

  // Pregame opponent info
  const pregame = useMemo(() => {
    if (!nextGame?.is_league || !nextGame?.league_team_id) return null;
    const oppId   = nextGame.league_team_id;
    const oppTeam = myLeagueTeams.find(lt => lt.id === oppId);
    if (!oppTeam) return null;

    const myResults = (leagueResults || []).filter(r => r.team_id === team.id);
    const oppGames  = myResults
      .filter(r => r.home_league_team_id === oppId || r.away_league_team_id === oppId)
      .sort((a, b) => a.game_date.localeCompare(b.game_date));

    let oppW = 0, oppL = 0;
    for (const r of oppGames) {
      const homeWon = (r.home_sets || 0) > (r.away_sets || 0);
      const oppHome = r.home_league_team_id === oppId;
      if ((oppHome && homeWon) || (!oppHome && !homeWon)) oppW++; else oppL++;
    }

    const last5 = oppGames.slice(-5).map(r => {
      const homeWon = (r.home_sets || 0) > (r.away_sets || 0);
      const oppHome = r.home_league_team_id === oppId;
      return (oppHome && homeWon) || (!oppHome && !homeWon) ? 'W' : 'L';
    });

    let streakLen = 0, streakType = null;
    for (let i = last5.length - 1; i >= 0; i--) {
      if (streakType === null) streakType = last5[i];
      if (last5[i] === streakType) streakLen++; else break;
    }

    const ourId   = ourLeagueTeam?.id;
    const h2hGames = ourId
      ? myResults
          .filter(r =>
            (r.home_league_team_id === ourId && r.away_league_team_id === oppId) ||
            (r.home_league_team_id === oppId && r.away_league_team_id === ourId)
          )
          .sort((a, b) => a.game_date.localeCompare(b.game_date))
      : [];

    let ourWins = 0, ourLosses = 0;
    for (const r of h2hGames) {
      const homeWon = (r.home_sets || 0) > (r.away_sets || 0);
      const ourHome = r.home_league_team_id === ourId;
      if ((ourHome && homeWon) || (!ourHome && !homeWon)) ourWins++; else ourLosses++;
    }

    let lastMeeting = null;
    if (h2hGames.length > 0) {
      const r       = h2hGames[h2hGames.length - 1];
      const homeWon = (r.home_sets || 0) > (r.away_sets || 0);
      const ourHome = r.home_league_team_id === ourId;
      const weWon   = (ourHome && homeWon) || (!ourHome && !homeWon);
      const ourSets   = ourHome ? (r.home_sets ?? 0) : (r.away_sets ?? 0);
      const theirSets = ourHome ? (r.away_sets ?? 0) : (r.home_sets ?? 0);
      lastMeeting = { result: weWon ? 'W' : 'L', score: `${ourSets}–${theirSets}`, date: formatShortDate(r.game_date) };
    }

    return { oppTeam, oppW, oppL, last5, streakLen, streakType, ourWins, ourLosses, lastMeeting, firstMeeting: h2hGames.length === 0 };
  }, [nextGame, leagueResults, myLeagueTeams, ourLeagueTeam, team.id]);

  // Past timeline: completed games + past unplayed, oldest first so most recent sits directly above next game card
  const pastTimeline = useMemo(() => {
    const items = [
      ...completed.map(g => ({ ...g, _kind: 'completed' })),
      ...pastUnplayed.map(g => ({ ...g, _kind: 'needsResult' })),
    ];
    return items.sort((a, b) => a.game_date.localeCompare(b.game_date));
  }, [completed, pastUnplayed]);

  // Instantly position the timeline before the browser paints.
  // useLayoutEffect is synchronous — scrollTop is already set when the user first sees
  // the screen. No requestAnimationFrame, no smooth behavior, no animation.
  useLayoutEffect(() => {
    const container = timelineRef.current;
    const anchor    = nextGameRef.current; // wraps divider + next game card
    if (!container) return;

    if (!anchor) {
      // No upcoming games — show most-recent completed games (scroll to bottom)
      container.scrollTop = container.scrollHeight;
      return;
    }

    // Scroll so the NEXT GAME divider lands ~25% from the top of the visible area.
    // This keeps completed games visible above it without requiring the user to scroll.
    // Avoids centering the card itself (which is tall and would hide all history above).
    const peekAbove = Math.round(container.clientHeight * 0.25);
    container.scrollTop = Math.max(0, anchor.offsetTop - peekAbove);
  // Empty deps: ScheduleTab remounts on every tab switch (conditional render in
  // TeamDashboard), so this fires fresh each time the Schedule tab becomes active.
  }, []);

  async function openManualEntry(scheduledGame) {
    const payload = { team_id: team.id, opponent: scheduledGame.opponent, game_date: scheduledGame.game_date, location: scheduledGame.location || 'Home' };
    if (scheduledGame.is_league) { payload.is_league = true; payload.league_team_id = scheduledGame.league_team_id || null; }
    let { data: newGame, error } = await supabase.from('completed_games').insert(payload).select().single();
    if (error) {
      const res = await supabase.from('completed_games').insert({ team_id: team.id, opponent: scheduledGame.opponent, game_date: scheduledGame.game_date, location: scheduledGame.location || 'Home' }).select().single();
      newGame = res.data; error = res.error;
    }
    if (!error && newGame) {
      await supabase.from('schedule').delete().eq('id', scheduledGame.id);
      await refresh();
      setManualGame(newGame);
    }
  }

  return (
    <div className="sch-root">

      {/* ── FIXED: Season Record Bar only ── */}
      {(wins + losses > 0 || gamesLeft > 0) && (
        <div className="sch-record-bar">
          <div className="sch-record-main">
            <span className="sch-record-num">{wins}–{losses}</span>
            <span className="sch-record-label">Overall</span>
          </div>
          {hasLeague && (
            <>
              <div className="sch-record-divider" />
              <div className="sch-record-main">
                <span className="sch-record-num">{leagueWins}–{leagueLosses}</span>
                <span className="sch-record-label">League</span>
              </div>
            </>
          )}
          {gamesLeft > 0 && (
            <>
              <div className="sch-record-divider" />
              <div className="sch-record-main">
                <span className="sch-record-num">{gamesLeft}</span>
                <span className="sch-record-label">Remaining</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── SCROLLABLE TIMELINE ── */}
      <div ref={timelineRef} className="sch-timeline-wrap">

        {/* Resume game banner — at top of scroll */}
        {activeSession && onResumeGame && (
          <button className="sch-resume-btn" onClick={() => onResumeGame(activeSession)}>
            <div className="sch-resume-dot" />
            <div className="sch-resume-text">
              <div className="sch-resume-label">LIVE — RESUME GAME</div>
              <div className="sch-resume-detail">vs {activeSession.opponent} · Set {activeSession.current_set} · {activeSession.home_score}–{activeSession.away_score}</div>
            </div>
            <span className="sch-resume-arrow">›</span>
          </button>
        )}

        {/* Completed games + needs-result — most recent first */}
        {pastTimeline.map(g => {
          const { month, day, dow } = formatDateParts(g.game_date);
          const needsResult = g._kind === 'needsResult';
          return (
            <div
              key={g.id}
              className={`sch-tl-row sch-tl-past${needsResult ? ' sch-tl-needs' : ''}`}
              onClick={!needsResult && g.result ? () => onSelectGame(g) : undefined}
              style={{ cursor: !needsResult && g.result ? 'pointer' : 'default' }}
            >
              <div className="sch-tl-date">
                <span className="sch-tl-month">{month}</span>
                <span className="sch-tl-day">{day}</span>
                <span className="sch-tl-dow">{dow}</span>
              </div>
              <div className="sch-tl-mid">
                <div className="sch-tl-opp">
                  {g.opponent}
                  {g.is_league && <span className="sch-badge-league">League</span>}
                </div>
                {g.location && <div className="sch-tl-loc">{g.location}</div>}
              </div>
              <div className="sch-tl-right">
                {needsResult ? (
                  isAdmin && <button className="sch-enter-btn" onClick={e => { e.stopPropagation(); openManualEntry(g); }}>Enter Result</button>
                ) : g.result ? (
                  <>
                    {g.home_sets != null && g.away_sets != null && <span className="sch-tl-score">{g.home_sets}–{g.away_sets}</span>}
                    <span className={`game-result-badge ${g.result === 'W' ? 'win' : 'loss'}`}>{g.result}</span>
                    {isAdmin && <button className="sch-edit-btn" onClick={e => { e.stopPropagation(); setManualGame(g); }}>Edit</button>}
                  </>
                ) : (
                  isAdmin && <button className="sch-enter-btn" onClick={e => { e.stopPropagation(); setManualGame(g); }}>Enter Result</button>
                )}
              </div>
            </div>
          );
        })}

        {/* ── NEXT GAME divider + card ── */}
        {nextGame && (
          <div ref={nextGameRef} className="sch-next-anchor">

            {/* Next game card — two column compact layout */}
            <div className={`sch-next-card${nextGame.game_date === today ? ' sch-next-today' : ''}`}>

              {/* LEFT: opponent info + button */}
              <div className="sch-nc-left">
                <div className="sch-nc-eyebrow">
                  {nextGame.game_date === today ? <><span className="sch-live-dot" /> TODAY</> : 'NEXT GAME'}
                  {nextGame.is_league && <span className="sch-badge-league sch-badge-league-sm">League</span>}
                  {nextGame.game_date !== today && (
                    <span className="sch-next-countdown">{daysUntilLabel(nextGame.game_date, today)}</span>
                  )}
                </div>
                <div className="sch-nc-opp">{nextGame.opponent}</div>
                <div className="sch-nc-meta">
                  {formatShortDate(nextGame.game_date)}
                  {nextGame.location && ` · ${nextGame.location}`}
                </div>
                {isAdmin && (
                  <button className="sch-start-btn" onClick={() => onStartLive && onStartLive(nextGame)}>
                    Start Live Scoring
                  </button>
                )}
              </div>

              {/* Vertical divider */}
              <div className="sch-nc-divider" />

              {/* RIGHT: pre-match stats */}
              <div className="sch-nc-right">
                {pregame ? (
                  <>
                    <div className="sch-nc-stat-row">
                      <span className="sch-nc-lbl">League Record</span>
                      <span className="sch-nc-val">{pregame.oppW}–{pregame.oppL}</span>
                    </div>
                    {pregame.lastMeeting && (
                      <div className="sch-nc-stat-row">
                        <span className="sch-nc-lbl">Last Meeting</span>
                        <span className={`sch-nc-val sch-pregame-result-${pregame.lastMeeting.result === 'W' ? 'w' : 'l'}`}>
                          {pregame.lastMeeting.result} {pregame.lastMeeting.score} · {pregame.lastMeeting.date}
                        </span>
                      </div>
                    )}
                    {pregame.streakType && (
                      <div className="sch-nc-stat-row">
                        <span className="sch-nc-lbl">Streak</span>
                        <span className="sch-nc-val" style={{ color: pregame.streakType === 'W' ? '#3fb950' : '#f85149' }}>
                          {pregame.streakLen}{pregame.streakType}
                        </span>
                      </div>
                    )}
                    {pregame.last5.length > 0 && (
                      <div className="sch-nc-stat-row" style={{ alignItems: 'flex-start' }}>
                        <span className="sch-nc-lbl" style={{ paddingTop: 1 }}>Last 5</span>
                        <div>
                          <div className="sch-streak-wrap" style={{ justifyContent: 'flex-end' }}>
                            {[...pregame.last5].reverse().map((r, i) => (
                              <span key={i} className={`sch-streak-pill sch-streak-${r === 'W' ? 'w' : 'l'}`}>{r}</span>
                            ))}
                          </div>
                          <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 2, textAlign: 'left' }}>← most recent</div>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No league data</div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* Divider if only upcoming with no next game card */}
        {!nextGame && upcoming.length > 0 && (
          <div className="sch-tl-divider">
            <span className="sch-tl-divider-label">UPCOMING</span>
          </div>
        )}

        {/* Rest of upcoming (after next game) */}
        {restUpcoming.map(g => {
          const { month, day, dow } = formatDateParts(g.game_date);
          const isT = g.game_date === today;
          return (
            <div key={g.id} className="sch-tl-row sch-tl-upcoming">
              <div className="sch-tl-date">
                <span className={`sch-tl-month${isT ? ' sch-tl-today-text' : ''}`}>{month}</span>
                <span className={`sch-tl-day${isT ? ' sch-tl-today-text' : ''}`}>{day}</span>
                <span className={`sch-tl-dow${isT ? ' sch-tl-today-text' : ''}`}>{dow}</span>
              </div>
              <div className="sch-tl-mid">
                <div className="sch-tl-opp">
                  {g.opponent}
                  {g.is_league && <span className="sch-badge-league">League</span>}
                  {isT && <span className="sch-badge-today">Today</span>}
                </div>
                {g.location && <div className="sch-tl-loc">{g.location}</div>}
              </div>
              <div className="sch-tl-right">
                {isAdmin && (
                  <button className="sch-up-live-btn" onClick={() => onStartLive && onStartLive(g)}>
                    {isT ? 'Start Live' : 'Live'}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Empty state */}
        {pastTimeline.length === 0 && upcoming.length === 0 && (
          <div className="empty-state" style={{ padding: '32px 16px' }}>No games scheduled</div>
        )}

        {/* Add Game — inside scroll at bottom */}
        {isAdmin && (
          <div className="sch-add-wrap">
            <button className="sch-add-btn" onClick={() => setShowAdd(true)}>
              + Add Game to Schedule
            </button>
          </div>
        )}

      </div>{/* end timeline */}

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
