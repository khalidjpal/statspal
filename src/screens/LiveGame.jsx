import { useState, useCallback, useRef, useEffect } from 'react';
import { pColors, mkInit } from '../utils/colors';
import { hpct, n3, hcol } from '../utils/stats';

const POS_ACTIONS = [
  { key: 'kill', label: 'Kill', stat: 'kills', autoAtt: true },
  { key: 'ace', label: 'Ace', stat: 'aces' },
  { key: 'dig', label: 'Dig', stat: 'digs' },
  { key: 'assist', label: 'Assist', stat: 'assists' },
  { key: 'block', label: 'Block', stat: 'blocks' },
  { key: 'attempt', label: 'Attempt', stat: 'attempts' },
];
const NEG_ACTIONS = [
  { key: 'miss_serve', label: 'Miss Serve', stat: 'errors' },
  { key: 'attack_error', label: 'Attack Err', stat: 'errors', autoAtt: true },
  { key: 'receive_error', label: 'Recv Err', stat: 'errors' },
  { key: 'ball_handling', label: 'BH Error', stat: 'errors' },
];

export default function LiveGame({ team, gameInfo, onEndMatch }) {
  const { roster, bestOf } = gameInfo;
  const setsToWin = bestOf === 3 ? 2 : 3;

  // --- Score state ---
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [currentSet, setCurrentSet] = useState(1);
  const [homeSetsWon, setHomeSetsWon] = useState(0);
  const [awaySetsWon, setAwaySetsWon] = useState(0);
  const [sets, setSets] = useState([]);

  // --- Player stats ---
  const [stats, setStats] = useState(() => {
    const o = {};
    roster.forEach(p => { o[p.id] = { kills: 0, aces: 0, digs: 0, assists: 0, blocks: 0, errors: 0, attempts: 0, sets_played: 0 }; });
    return o;
  });

  // --- UI ---
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [view, setView] = useState('track'); // 'track' | 'stats'
  const [history, setHistory] = useState([]);
  const [lastAction, setLastAction] = useState(null);
  const [flashKey, setFlashKey] = useState(0);
  const [flashId, setFlashId] = useState(null);
  const [showSetOver, setShowSetOver] = useState(false);
  const [showMatchOver, setShowMatchOver] = useState(false);
  const [pendingSet, setPendingSet] = useState(null);

  const isFinalSet = currentSet === bestOf;
  const target = isFinalSet ? 15 : 25;
  const isDeuce = homeScore >= target - 1 && awayScore >= target - 1 && homeScore > 0;

  // ----- helpers -----
  function isSetDone(hs, as) {
    const t = (currentSet >= bestOf) ? 15 : 25;
    return (hs >= t || as >= t) && Math.abs(hs - as) >= 2;
  }

  function pushHistory(entry) {
    setHistory(prev => [...prev, entry]);
  }

  // ----- score -----
  function addPoint(side) {
    const nh = side === 'home' ? homeScore + 1 : homeScore;
    const na = side === 'away' ? awayScore + 1 : awayScore;
    pushHistory({ type: 'point', homeScore, awayScore, currentSet, homeSetsWon, awaySetsWon });
    setHomeScore(nh);
    setAwayScore(na);
    if (isSetDone(nh, na)) {
      const hw = nh > na;
      const nhs = homeSetsWon + (hw ? 1 : 0);
      const nas = awaySetsWon + (hw ? 0 : 1);
      setPendingSet({ home: nh, away: na, nhs, nas });
      if (nhs >= setsToWin || nas >= setsToWin) {
        setSets(p => [...p, { home: nh, away: na }]);
        setHomeSetsWon(nhs); setAwaySetsWon(nas);
        setShowMatchOver(true);
      } else {
        setShowSetOver(true);
      }
    }
  }

  function subPoint(side) {
    if (side === 'home' && homeScore > 0) {
      pushHistory({ type: 'point', homeScore, awayScore, currentSet, homeSetsWon, awaySetsWon });
      setHomeScore(homeScore - 1);
    }
    if (side === 'away' && awayScore > 0) {
      pushHistory({ type: 'point', homeScore, awayScore, currentSet, homeSetsWon, awaySetsWon });
      setAwayScore(awayScore - 1);
    }
  }

  // End set from popup
  function confirmEndSet() {
    if (!pendingSet) return;
    finishSet(pendingSet.home, pendingSet.away, pendingSet.nhs, pendingSet.nas);
    setPendingSet(null);
    setShowSetOver(false);
  }
  function keepPlaying() { setPendingSet(null); setShowSetOver(false); }

  // Manual end set
  function manualEndSet() {
    if (homeScore === 0 && awayScore === 0) return;
    if (homeScore === awayScore) return;
    const hw = homeScore > awayScore;
    const nhs = homeSetsWon + (hw ? 1 : 0);
    const nas = awaySetsWon + (hw ? 0 : 1);
    finishSet(homeScore, awayScore, nhs, nas);
  }

  function finishSet(hs, as, nhs, nas) {
    setSets(p => [...p, { home: hs, away: as }]);
    setHomeSetsWon(nhs); setAwaySetsWon(nas);
    // Increment sets_played for everyone
    setStats(prev => {
      const next = { ...prev };
      roster.forEach(p => { next[p.id] = { ...next[p.id], sets_played: (next[p.id].sets_played || 0) + 1 }; });
      return next;
    });
    if (nhs >= setsToWin || nas >= setsToWin) {
      setShowMatchOver(true);
    } else {
      setCurrentSet(c => c + 1);
      setHomeScore(0); setAwayScore(0);
      setHistory([]);
    }
  }

  // ----- stat actions -----
  function recordAction(action) {
    if (!selectedPlayer) return;
    const player = roster.find(p => p.id === selectedPlayer);
    pushHistory({ type: 'stat', playerId: selectedPlayer, prevStats: { ...stats[selectedPlayer] } });
    setStats(prev => {
      const ps = { ...prev[selectedPlayer] };
      ps[action.stat] = (ps[action.stat] || 0) + 1;
      if (action.autoAtt) ps.attempts = (ps.attempts || 0) + 1;
      return { ...prev, [selectedPlayer]: ps };
    });
    setLastAction(`${player?.name?.split(' ')[0] || '?'} → ${action.label}`);
    setFlashId(action.key);
    setFlashKey(k => k + 1);
  }

  // ----- undo -----
  function handleUndo() {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    if (last.type === 'point') {
      setHomeScore(last.homeScore); setAwayScore(last.awayScore);
      setCurrentSet(last.currentSet); setHomeSetsWon(last.homeSetsWon); setAwaySetsWon(last.awaySetsWon);
    } else if (last.type === 'stat') {
      setStats(prev => ({ ...prev, [last.playerId]: last.prevStats }));
    }
    setHistory(prev => prev.slice(0, -1));
    setLastAction('(undone)');
  }

  // ----- end match -----
  function handleMatchConfirm() {
    onEndMatch({
      homeSetsWon, awaySetsWon, sets,
      result: homeSetsWon > awaySetsWon ? 'W' : 'L',
      stats: { ...stats },
    });
  }

  // === RENDER ===
  const selPlayer = roster.find(p => p.id === selectedPlayer);
  const selStats = selectedPlayer ? stats[selectedPlayer] : null;

  return (
    <div className="live-game">
      {/* ── SCOREBOARD ── */}
      <div className="lg-scoreboard">
        <div className="lg-set-label">Set {currentSet} · Best of {bestOf}</div>
        <div className="lg-scores">
          <div className="lg-team-col">
            <div className="lg-team-name" style={{ color: team.color || '#6ea8fe' }}>{team.name}</div>
            <div className="lg-score-row">
              <button className="lg-score-btn" onClick={() => subPoint('home')}>−</button>
              <div className="lg-score-num" style={{ color: team.color || '#6ea8fe' }}>{homeScore}</div>
              <button className="lg-score-btn" onClick={() => addPoint('home')}>+</button>
            </div>
          </div>
          <div className="lg-vs">vs</div>
          <div className="lg-team-col">
            <div className="lg-team-name" style={{ opacity: 0.6 }}>{gameInfo.opponent}</div>
            <div className="lg-score-row">
              <button className="lg-score-btn" onClick={() => subPoint('away')}>−</button>
              <div className="lg-score-num">{awayScore}</div>
              <button className="lg-score-btn" onClick={() => addPoint('away')}>+</button>
            </div>
          </div>
        </div>

        {/* Set chips */}
        {(sets.length > 0 || homeSetsWon > 0) && (
          <div className="lg-set-chips">
            <span className="lg-set-chip" style={{ color: '#c9a84c' }}>Sets: {homeSetsWon}-{awaySetsWon}</span>
            {sets.map((s, i) => (
              <span key={i} className="lg-set-chip">S{i + 1}: {s.home}-{s.away}</span>
            ))}
          </div>
        )}
        {isDeuce && <div className="lg-deuce">DEUCE — WIN BY 2</div>}
      </div>

      {/* ── CONTROLS ── */}
      <div className="lg-controls">
        <button className="lg-ctrl-btn undo" onClick={handleUndo} disabled={history.length === 0}>
          Undo
        </button>
        <div className="lg-last-action">{lastAction || ''}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={`lg-ctrl-btn stats-tab ${view === 'stats' ? 'active' : ''}`}
            onClick={() => setView(view === 'stats' ? 'track' : 'stats')}>
            {view === 'stats' ? 'Track' : 'Stats'}
          </button>
          <button className="lg-ctrl-btn end-set" onClick={manualEndSet}
            disabled={homeScore === 0 && awayScore === 0}>
            End Set
          </button>
        </div>
      </div>

      {/* ── MAIN AREA ── */}
      {view === 'track' ? (
        <>
          {/* Player grid */}
          <div className="lg-players">
            <div className="lg-player-grid">
              {roster.map((p, i) => {
                const c = p.colors || pColors(p.player_index ?? i);
                const s = stats[p.id];
                const sel = p.id === selectedPlayer;
                const hp = hpct(s.kills, s.errors, s.attempts);
                return (
                  <div key={p.id}
                    className={`lg-player-card ${sel ? 'selected' : ''}`}
                    onClick={() => setSelectedPlayer(sel ? null : p.id)}>
                    <div className="lg-pc-top">
                      <div className="lg-pc-badge" style={{ background: c.bg, color: c.text }}>
                        {p.initials || mkInit(p.name)}
                      </div>
                      <div style={{ overflow: 'hidden' }}>
                        <div className="lg-pc-name">{p.name}</div>
                        <div className="lg-pc-meta">
                          {[p.jersey_number ? `#${p.jersey_number}` : null, p.position].filter(Boolean).join(' · ') || '\u00A0'}
                        </div>
                      </div>
                    </div>
                    <div className="lg-pc-stats">
                      <span>{s.kills}K</span>
                      <span>{s.errors}E</span>
                      <span>{s.digs}D</span>
                      <span>{s.aces}A</span>
                      {s.attempts > 0 && (
                        <span style={{ color: hcol(s.kills, s.errors, s.attempts), fontWeight: 700 }}>
                          {n3(hp)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action panel */}
          <div className="lg-actions">
            {selectedPlayer && selPlayer ? (
              <>
                <div className="lg-selected-name">
                  {selPlayer.name}
                  {selStats && selStats.attempts > 0 && (
                    <span style={{ marginLeft: 8, color: hcol(selStats.kills, selStats.errors, selStats.attempts) }}>
                      {n3(hpct(selStats.kills, selStats.errors, selStats.attempts))}
                    </span>
                  )}
                </div>
                <div className="lg-action-row positive">
                  {POS_ACTIONS.map(a => (
                    <ActionBtn key={a.key} action={a} isPos flashId={flashId} flashKey={flashKey}
                      count={selStats ? selStats[a.stat] : 0} onClick={() => recordAction(a)} />
                  ))}
                </div>
                <div className="lg-action-row negative">
                  {NEG_ACTIONS.map(a => (
                    <ActionBtn key={a.key} action={a} isPos={false} flashId={flashId} flashKey={flashKey}
                      count={null} onClick={() => recordAction(a)} />
                  ))}
                </div>
              </>
            ) : (
              <div className="lg-no-selection">Tap a player above to start tracking</div>
            )}
          </div>
        </>
      ) : (
        /* Stats table */
        <div className="lg-stats-view">
          <table className="lg-stats-table">
            <thead>
              <tr>
                <th>Player</th><th>SP</th><th>K</th><th>Ace</th><th>Dig</th><th>Ast</th><th>Blk</th><th>Err</th><th>Hit%</th>
              </tr>
            </thead>
            <tbody>
              {roster.map(p => {
                const s = stats[p.id];
                const hp = hpct(s.kills, s.errors, s.attempts);
                return (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{s.sets_played}</td>
                    <td>{s.kills}</td>
                    <td>{s.aces}</td>
                    <td>{s.digs}</td>
                    <td>{s.assists}</td>
                    <td>{s.blocks}</td>
                    <td style={{ color: '#e74c3c' }}>{s.errors}</td>
                    <td style={{ color: hcol(s.kills, s.errors, s.attempts), fontWeight: 700 }}>
                      {s.attempts > 0 ? n3(hp) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── SET OVER POPUP ── */}
      {showSetOver && pendingSet && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ textAlign: 'center' }}>
            <h2>Set {currentSet} Complete!</h2>
            <div style={{ fontSize: 36, fontWeight: 800, margin: '12px 0' }}>{pendingSet.home} – {pendingSet.away}</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
              Sets: {pendingSet.nhs} – {pendingSet.nas}
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button className="modal-btn-cancel" onClick={keepPlaying}>Keep Playing</button>
              <button className="modal-btn-primary" onClick={confirmEndSet}>End Set</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MATCH OVER POPUP ── */}
      {showMatchOver && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ textAlign: 'center' }}>
            <h2>Match Over!</h2>
            <div style={{ fontSize: 44, fontWeight: 800, margin: '12px 0' }}>{homeSetsWon} – {awaySetsWon}</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, color: homeSetsWon > awaySetsWon ? '#27AE60' : '#C0392B' }}>
              {homeSetsWon > awaySetsWon ? 'Victory!' : 'Defeat'}
            </div>
            {sets.map((s, i) => (
              <div key={i} style={{ fontSize: 13, color: '#888' }}>Set {i + 1}: {s.home}–{s.away}</div>
            ))}
            <button className="modal-btn-primary" onClick={handleMatchConfirm} style={{ marginTop: 20, width: '100%', padding: 14, fontSize: 16 }}>
              Save & Finish
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Action button with flash ── */
function ActionBtn({ action, isPos, flashId, flashKey, count, onClick }) {
  const [showFlash, setShowFlash] = useState(false);
  const prevKey = useRef(flashKey);

  useEffect(() => {
    if (flashKey !== prevKey.current && flashId === action.key) {
      setShowFlash(true);
      const t = setTimeout(() => setShowFlash(false), 350);
      prevKey.current = flashKey;
      return () => clearTimeout(t);
    }
    prevKey.current = flashKey;
  }, [flashKey, flashId, action.key]);

  return (
    <button className={`lg-action-btn ${isPos ? 'pos' : 'neg'}`} onClick={onClick}>
      {showFlash && <div className="flash" />}
      {action.label}
      {count != null && count > 0 && <span className="lg-action-count">{count}</span>}
    </button>
  );
}
