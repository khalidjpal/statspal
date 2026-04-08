import { useState, useRef, useEffect } from 'react';
import { pColors, mkInit } from '../utils/colors';
import { hpct, n3, hcol } from '../utils/stats';

const GOOD_ACTIONS = [
  { key: 'kill',         label: 'Kill',         stat: 'kills',         autoAtt: true },
  { key: 'ace',          label: 'Ace',          stat: 'aces' },
  { key: 'dig',          label: 'Dig',          stat: 'digs' },
  { key: 'assist',       label: 'Assist',       stat: 'assists' },
  { key: 'block_solo',   label: 'Block Solo',   stat: 'blocks' },
  { key: 'block_assist', label: 'Block Assist', stat: 'block_assists' },
  { key: 'attempt',      label: 'Attempt',      stat: 'attempts' },
];

const ERROR_ACTIONS = [
  { key: 'serve_error',  label: 'Serve Error',  stat: 'serve_errors' },
  { key: 'attack_error', label: 'Attack Err',   stat: 'errors', autoAtt: true },
  { key: 'recv_error',   label: 'Recv Error',   stat: 'digs' },
];

export default function LiveGame({ team, gameInfo, onEndMatch }) {
  const { roster, bestOf } = gameInfo;
  const setsToWin = bestOf === 3 ? 2 : 3;

  const [homeScore,    setHomeScore]    = useState(0);
  const [awayScore,    setAwayScore]    = useState(0);
  const [currentSet,   setCurrentSet]   = useState(1);
  const [homeSetsWon,  setHomeSetsWon]  = useState(0);
  const [awaySetsWon,  setAwaySetsWon]  = useState(0);
  const [sets,         setSets]         = useState([]);

  const [stats, setStats] = useState(() => {
    const o = {};
    roster.forEach(p => {
      o[p.id] = { kills: 0, aces: 0, digs: 0, assists: 0, blocks: 0, errors: 0, attempts: 0, sets_played: 0, block_assists: 0, serve_errors: 0 };
    });
    return o;
  });

  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [view,           setView]           = useState('track');
  const [history,        setHistory]        = useState([]);
  const [lastAction,     setLastAction]     = useState('');
  const [flashKey,       setFlashKey]       = useState(0);
  const [flashId,        setFlashId]        = useState(null);
  const [showSetOver,    setShowSetOver]    = useState(false);
  const [showMatchOver,  setShowMatchOver]  = useState(false);
  const [pendingSet,     setPendingSet]     = useState(null);

  const isFinalSet = currentSet === bestOf;
  const target     = isFinalSet ? 15 : 25;
  const isDeuce    = homeScore >= target - 1 && awayScore >= target - 1 && homeScore > 0;

  function isSetDone(hs, as) {
    const t = currentSet >= bestOf ? 15 : 25;
    return (hs >= t || as >= t) && Math.abs(hs - as) >= 2;
  }
  function pushHistory(entry) { setHistory(prev => [...prev, entry]); }

  function addPoint(side) {
    const nh = side === 'home' ? homeScore + 1 : homeScore;
    const na = side === 'away' ? awayScore + 1 : awayScore;
    pushHistory({ type: 'point', homeScore, awayScore, currentSet, homeSetsWon, awaySetsWon });
    setHomeScore(nh); setAwayScore(na);
    if (isSetDone(nh, na)) {
      const hw  = nh > na;
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

  function confirmEndSet() {
    if (!pendingSet) return;
    finishSet(pendingSet.home, pendingSet.away, pendingSet.nhs, pendingSet.nas);
    setPendingSet(null); setShowSetOver(false);
  }
  function keepPlaying() { setPendingSet(null); setShowSetOver(false); }

  function manualEndSet() {
    if (homeScore === 0 && awayScore === 0) return;
    if (homeScore === awayScore) return;
    const hw  = homeScore > awayScore;
    const nhs = homeSetsWon + (hw ? 1 : 0);
    const nas = awaySetsWon + (hw ? 0 : 1);
    finishSet(homeScore, awayScore, nhs, nas);
  }

  function finishSet(hs, as, nhs, nas) {
    setSets(p => [...p, { home: hs, away: as }]);
    setHomeSetsWon(nhs); setAwaySetsWon(nas);
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

  function handleMatchConfirm() {
    onEndMatch({
      homeSetsWon, awaySetsWon, sets,
      result: homeSetsWon > awaySetsWon ? 'W' : 'L',
      stats: { ...stats },
    });
  }

  const selPlayer = roster.find(p => p.id === selectedPlayer);
  const selStats  = selectedPlayer ? stats[selectedPlayer] : null;

  return (
    <div className="nlg">

      {/* ── SCOREBOARD (always dark navy) ─────────────────────────────── */}
      <div className="nlg-sb">
        <div className="nlg-sb-top">
          <button className="nlg-sb-undo" onClick={handleUndo} disabled={history.length === 0}>
            ↩ Undo
          </button>
          <div className="nlg-sb-set-info">
            <span className="nlg-sb-set-pill">SET {currentSet}</span>
            <div className="nlg-sb-bof">Best of {bestOf}</div>
          </div>
          <button className="nlg-sb-endset" onClick={manualEndSet} disabled={homeScore === 0 && awayScore === 0}>
            End Set
          </button>
        </div>

        <div className="nlg-sb-scores">
          <div className="nlg-team-side">
            <div className="nlg-team-name-lbl">{team.name}</div>
            <div className="nlg-score-num">{homeScore}</div>
            <div className="nlg-score-btns">
              <button className="nlg-score-btn nlg-score-btn-sub" onClick={() => subPoint('home')}>−</button>
              <button className="nlg-score-btn nlg-score-btn-add" onClick={() => addPoint('home')}>+</button>
            </div>
          </div>

          <div className="nlg-sb-center">
            <div className="nlg-sets-won">{homeSetsWon}–{awaySetsWon}</div>
            <div className="nlg-sets-lbl">SETS</div>
          </div>

          <div className="nlg-team-side nlg-team-right">
            <div className="nlg-team-name-lbl" style={{ color: 'rgba(255,255,255,0.5)' }}>{gameInfo.opponent}</div>
            <div className="nlg-score-num" style={{ color: 'rgba(255,255,255,0.65)' }}>{awayScore}</div>
            <div className="nlg-score-btns">
              <button className="nlg-score-btn nlg-score-btn-sub" onClick={() => subPoint('away')}>−</button>
              <button className="nlg-score-btn nlg-score-btn-add" onClick={() => addPoint('away')}>+</button>
            </div>
          </div>
        </div>

        {(sets.length > 0 || isDeuce) && (
          <div className="nlg-sb-footer">
            {sets.map((s, i) => <span key={i} className="nlg-set-chip">S{i + 1}: {s.home}–{s.away}</span>)}
            {isDeuce && <span className="nlg-deuce">✦ DEUCE · WIN BY 2 ✦</span>}
          </div>
        )}
      </div>

      {/* ── VIEW TABS ─────────────────────────────────────────────────── */}
      <div className="nlg-tabs">
        <button className={`nlg-tab ${view === 'track' ? 'active' : ''}`} onClick={() => setView('track')}>
          Tracking
        </button>
        <button className={`nlg-tab ${view === 'stats' ? 'active' : ''}`} onClick={() => setView('stats')}>
          Stats
        </button>
      </div>

      {/* ── BODY ──────────────────────────────────────────────────────── */}
      {view === 'track' ? (
        <div className="nlg-track">

          {/* Player grid */}
          <div className={`nlg-players ${selectedPlayer ? 'has-sel' : ''}`}>
            <div className="nlg-player-grid">
              {roster.map((p, i) => {
                const c   = p.colors || pColors(p.player_index ?? i);
                const s   = stats[p.id];
                const sel = p.id === selectedPlayer;
                const hp  = hpct(s.kills, s.errors, s.attempts);
                return (
                  <div
                    key={p.id}
                    className={`nlg-pc ${sel ? 'sel' : ''}`}
                    onClick={() => setSelectedPlayer(sel ? null : p.id)}
                  >
                    <div className="nlg-pc-top">
                      <div className="nlg-pc-badge" style={{ background: c.bg, color: c.text }}>
                        {p.initials || mkInit(p.name)}
                      </div>
                      <div style={{ overflow: 'hidden', flex: 1 }}>
                        <div className="nlg-pc-name">{p.name}</div>
                        <div className="nlg-pc-meta">
                          {[p.jersey_number ? `#${p.jersey_number}` : null, p.position].filter(Boolean).join(' · ') || '\u00A0'}
                        </div>
                      </div>
                    </div>
                    <div className="nlg-pc-stats">
                      K:{s.kills} SA:{s.aces} D:{s.digs} BS:{s.blocks} BA:{s.block_assists} E:{s.errors} SE:{s.serve_errors}
                      {s.attempts > 0 && (
                        <span style={{ marginLeft: 4, color: hcol(s.kills, s.errors, s.attempts), fontWeight: 700 }}>
                          | {n3(hp)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action zone */}
          {selectedPlayer && selPlayer && selStats ? (
            <div className="nlg-actions">
              <div className="nlg-actions-hdr">
                <span className="nlg-sel-name">{selPlayer.name}</span>
                <button className="nlg-desel-btn" onClick={() => setSelectedPlayer(null)}>✕</button>
              </div>

              <div className="nlg-row-label good">Good Play</div>
              <div className="nlg-btn-row">
                {GOOD_ACTIONS.map(a => (
                  <ActionBtn
                    key={a.key}
                    action={a}
                    isKill={a.key === 'kill'}
                    isErr={false}
                    count={selStats[a.stat]}
                    flashId={flashId}
                    flashKey={flashKey}
                    onClick={() => recordAction(a)}
                  />
                ))}
              </div>

              <div className="nlg-row-label err">Error</div>
              <div className="nlg-btn-row">
                {ERROR_ACTIONS.map(a => (
                  <ActionBtn
                    key={a.key}
                    action={a}
                    isKill={false}
                    isErr={true}
                    count={null}
                    flashId={flashId}
                    flashKey={flashKey}
                    onClick={() => recordAction(a)}
                  />
                ))}
              </div>

              <div className="nlg-last-action">{lastAction}</div>
            </div>
          ) : (
            <div className="nlg-no-sel">
              <div className="nlg-no-sel-text">Select a player above</div>
            </div>
          )}
        </div>
      ) : (
        /* Stats table */
        <div className="nlg-stats-view">
          <table className="nlg-stats-tbl">
            <thead>
              <tr>
                <th>Player</th>
                <th>SP</th><th>K</th><th>E</th><th>TA</th><th>K%</th><th>A</th><th>SA</th><th>SE</th><th>Digs</th><th>BS</th><th>BA</th>
              </tr>
            </thead>
            <tbody>
              {roster.map(p => {
                const s  = stats[p.id];
                const hp = hpct(s.kills, s.errors, s.attempts);
                return (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{s.sets_played}</td>
                    <td>{s.kills}</td>
                    <td style={{ color: s.errors > 0 ? '#dc2626' : 'inherit' }}>{s.errors}</td>
                    <td>{s.attempts}</td>
                    <td style={{ color: hcol(s.kills, s.errors, s.attempts), fontWeight: 700 }}>
                      {s.attempts > 0 ? n3(hp) : '—'}
                    </td>
                    <td>{s.assists}</td>
                    <td>{s.aces}</td>
                    <td style={{ color: s.serve_errors > 0 ? '#dc2626' : 'inherit' }}>{s.serve_errors}</td>
                    <td>{s.digs}</td>
                    <td>{s.blocks}</td>
                    <td>{s.block_assists}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── SET OVER POPUP ─────────────────────────────────────────────── */}
      {showSetOver && pendingSet && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ textAlign: 'center' }}>
            <h2>Set {currentSet} Over!</h2>
            <div style={{ fontSize: 40, fontWeight: 900, margin: '12px 0', color: 'var(--text)' }}>
              {pendingSet.home} – {pendingSet.away}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
              Sets: {pendingSet.nhs} – {pendingSet.nas}
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button className="modal-btn-cancel" onClick={keepPlaying}>Keep Playing</button>
              <button className="modal-btn-primary" onClick={confirmEndSet}>End Set</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MATCH OVER POPUP ───────────────────────────────────────────── */}
      {showMatchOver && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ textAlign: 'center' }}>
            <h2>Match Over!</h2>
            <div style={{ fontSize: 52, fontWeight: 900, margin: '12px 0', color: 'var(--text)' }}>
              {homeSetsWon} – {awaySetsWon}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: homeSetsWon > awaySetsWon ? '#16a34a' : '#dc2626' }}>
              {homeSetsWon > awaySetsWon ? 'Victory!' : 'Defeat'}
            </div>
            {sets.map((s, i) => (
              <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Set {i + 1}: {s.home}–{s.away}
              </div>
            ))}
            <button className="modal-btn-primary" onClick={handleMatchConfirm} style={{ marginTop: 20, width: '100%', padding: 14, fontSize: 16 }}>
              Save &amp; Finish
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ActionBtn ─────────────────────────────────────────────────────────────────
function ActionBtn({ action, isKill, isErr, count, flashId, flashKey, onClick }) {
  const [flashing, setFlashing] = useState(false);
  const prevKey = useRef(flashKey);

  useEffect(() => {
    if (flashKey !== prevKey.current && flashId === action.key) {
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), 150);
      prevKey.current = flashKey;
      return () => clearTimeout(t);
    }
    prevKey.current = flashKey;
  }, [flashKey, flashId, action.key]);

  const cls = [
    'nlg-action-btn',
    isKill ? 'kill' : '',
    isErr ? 'err-btn' : 'good-btn',
    flashing ? 'flashing' : '',
  ].filter(Boolean).join(' ');

  return (
    <button className={cls} onClick={onClick}>
      {action.label}
      {count > 0 && <span className="nlg-btn-count">{count}</span>}
    </button>
  );
}
