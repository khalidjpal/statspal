import { useState, useMemo, useCallback, useRef } from 'react';
import { hpct, n3, hcol, passAvg, pfmt, pcol } from '../utils/stats';
import { sortByJersey } from '../utils/sort';
import FullscreenButton from '../components/FullscreenButton';
import StatActionGrid from '../components/StatActionGrid';
import {
  SIDES, sideLabel, emptyPracticeRow, sumPracticeRows, setsWon,
  createPracticeSession, savePracticeSetStats, isMissingTableError,
} from '../utils/practice';

// Live intrasquad scrimmage tracking.
//
// This is StatsPal's tracker pointed at practice data. It shares the stat set
// and the button grid (StatActionGrid) with LiveGame, so the buttons behave
// and look identical, but it has no opponent, no match format and no
// live_game_sessions row — a scrimmage is a practice session, and it saves to
// practice_sessions / practice_stats like every other drill. No code path here
// writes to a game table.
//
// Both sides are this team's own roster, so every player carries a `side`, and
// stats are kept per SET so a set-by-set breakdown survives to the saved data.

// Compact per-player line for the rail, matching LiveGame's MiniStats.
function MiniStats({ s }) {
  const pairs = [
    [s.kills, 'K'], [s.errors, 'E'], [s.attempts, 'TA'],
    [s.assists, 'A'], [s.aces, 'SA'], [s.serve_errors, 'SE'],
    [s.digs, 'D'], [s.blocks, 'BS'], [s.block_assists, 'BA'],
    [s.receives, 'R'], [s.blocking_errors, 'BE'], [s.digging_errors, 'DE'],
    [s.ball_handling_errors, 'BHE'],
  ];
  const nonZero = pairs.filter(([v]) => v > 0);
  const pa = passAvg(s);
  if (nonZero.length === 0 && !s.attempts) return <span className="lv-ms-empty">—</span>;
  const items = [];
  nonZero.forEach(([v, a], i) => {
    if (i > 0) items.push(<span key={'d' + i} className="lv-ms-dot">·</span>);
    items.push(<span key={i} className="lv-ms-p"><b>{v}</b><span className="lv-ms-a">{a}</span></span>);
  });
  if (pa !== null) {
    items.push(<span key="pd" className="lv-ms-dot">·</span>);
    items.push(<span key="pa" className="lv-ms-p"><b style={{ color: pcol(pa) }}>{pfmt(pa)}</b><span className="lv-ms-a">P</span></span>);
  }
  if (s.attempts > 0) {
    items.push(<span key="hd" className="lv-ms-dot">·</span>);
    items.push(<span key="hp" className="lv-ms-p"><b style={{ color: hcol(s.kills, s.errors, s.attempts) }}>{n3(hpct(s.kills, s.errors, s.attempts))}</b></span>);
  }
  return <span className="lv-ms">{items}</span>;
}

// Header line for the selected player, matching LiveGame's FullStats.
function FullStats({ s }) {
  const hp = hpct(s.kills, s.errors, s.attempts);
  const pa = passAvg(s);
  const all = [
    [s.kills, 'K'], [s.errors, 'E'], [s.attempts, 'TA'], ['_hp', 'K%'],
    [s.receives || 0, 'Rec'], ['_pa', 'Pass'],
    [s.assists, 'A'], [s.aces, 'SA'], [s.serve_errors, 'SE'],
    [s.digs, 'D'], [s.blocks, 'BS'], [s.block_assists, 'BA'],
  ];
  return (
    <span className="lv-fs">
      {all.map(([v, a], i) => {
        const dot = i > 0 ? <span className="lv-fs-dot">·</span> : null;
        if (v === '_hp') return <span key={i}>{dot}<span className="lv-fs-p"><b style={{ color: s.attempts > 0 ? hcol(s.kills, s.errors, s.attempts) : '#484f58' }}>{s.attempts > 0 ? n3(hp) : '—'}</b><span className="lv-fs-a">{a}</span></span></span>;
        if (v === '_pa') return <span key={i}>{dot}<span className="lv-fs-p"><b style={{ color: pa !== null ? pcol(pa) : '#484f58' }}>{pfmt(pa)}</b><span className="lv-fs-a">{a}</span></span></span>;
        return <span key={i}>{dot}<span className="lv-fs-p"><b>{v}</b><span className="lv-fs-a">{a}</span></span></span>;
      })}
    </span>
  );
}

function StatsTable({ players, stats }) {
  return (
    <table className="lv-st">
      <thead>
        <tr>
          <th className="lv-st-l">#</th><th className="lv-st-l">Name</th>
          <th>K</th><th>E</th><th>TA</th><th>K%</th><th>A</th><th>BHE</th>
          <th>SA</th><th>SE</th><th>Rec</th><th>Pass</th><th>D</th><th>DE</th>
          <th>BS</th><th>BA</th><th>BE</th>
        </tr>
      </thead>
      <tbody>
        {players.map(p => {
          const s = stats[p.id] || emptyPracticeRow();
          const pa = passAvg(s);
          return (
            <tr key={p.id}>
              <td className="lv-st-l" style={{ color: '#484f58' }}>{p.jersey_number || '—'}</td>
              <td className="lv-st-l lv-st-n">{p.name}</td>
              <td>{s.kills}</td>
              <td style={{ color: s.errors > 0 ? '#f85149' : 'inherit' }}>{s.errors}</td>
              <td>{s.attempts}</td>
              <td style={{ color: hcol(s.kills, s.errors, s.attempts), fontWeight: 700 }}>
                {s.attempts > 0 ? n3(hpct(s.kills, s.errors, s.attempts)) : '—'}
              </td>
              <td>{s.assists}</td>
              <td style={{ color: s.ball_handling_errors > 0 ? '#f85149' : 'inherit' }}>{s.ball_handling_errors}</td>
              <td>{s.aces}</td>
              <td style={{ color: s.serve_errors > 0 ? '#f85149' : 'inherit' }}>{s.serve_errors}</td>
              <td>{s.receives}</td>
              <td style={{ color: pa !== null ? pcol(pa) : '#484f58', fontWeight: 700 }}>{pfmt(pa)}</td>
              <td>{s.digs}</td>
              <td style={{ color: s.digging_errors > 0 ? '#f85149' : 'inherit' }}>{s.digging_errors}</td>
              <td>{s.blocks}</td>
              <td>{s.block_assists}</td>
              <td style={{ color: s.blocking_errors > 0 ? '#f85149' : 'inherit' }}>{s.blocking_errors}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// Which counters one press moves. Undo subtracts the same map, so a press and
// its reversal can never disagree.
function deltasFor(action) {
  const d = {};
  d[action.stat] = (d[action.stat] || 0) + 1;
  if (action.also) d[action.also] = (d[action.also] || 0) + 1;
  if (action.autoAtt) d.attempts = (d.attempts || 0) + 1;
  return d;
}

export default function PracticeScrimmage({ team, setup, currentUser, onExit, onSaved }) {
  const bySide = useMemo(() => ({
    team_a: sortByJersey(setup.sides?.team_a || []),
    team_b: sortByJersey(setup.sides?.team_b || []),
  }), [setup.sides]);

  const allPlayers = useMemo(() => [...bySide.team_a, ...bySide.team_b], [bySide]);

  const sideOf = useMemo(() => {
    const m = {};
    bySide.team_a.forEach(p => { m[p.id] = 'team_a'; });
    bySide.team_b.forEach(p => { m[p.id] = 'team_b'; });
    return m;
  }, [bySide]);

  // Stats are keyed by SET first: { [setNumber]: { [playerId]: row } }. Session
  // totals are always a sum across sets, never a second running tally — one
  // source of truth, so per-set and overall can never disagree.
  const [setStats, setSetStats] = useState(() => ({ 1: {} }));
  const [currentSet, setCurrentSet] = useState(1);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  // Points from sets already finished; the set in progress is scoreA/scoreB.
  const [doneSets, setDoneSets] = useState([]);

  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState('track');
  const [statsView, setStatsView] = useState('all');   // 'all' | 1 | 2 | ...
  const [history, setHistory] = useState([]);
  const [lastAction, setLastAction] = useState('');
  const [flashKey, setFlashKey] = useState(0);
  const [flashId, setFlashId] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showExit, setShowExit] = useState(false);
  const [showNewSet, setShowNewSet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const sessionIdRef = useRef(null);
  const [sessionStarted, setSessionStarted] = useState(false);

  const selected = allPlayers.find(p => p.id === selectedId) || null;

  // A player's totals across every set — what the rail, the header and the
  // button badges show, matching StatsPal, which also shows match totals.
  const overall = useCallback((pid) => sumPracticeRows(
    Object.values(setStats).map(bySet => bySet[pid]).filter(Boolean)
  ), [setStats]);

  const statsFor = useCallback((pid, setNo) => (
    setNo === 'all' ? overall(pid) : (setStats[setNo]?.[pid] || emptyPracticeRow())
  ), [setStats, overall]);

  const selStats = selectedId ? overall(selectedId) : null;

  // Every set score including the one in progress, in order.
  const allSetScores = useMemo(
    () => [...doneSets, { a: scoreA, b: scoreB }],
    [doneSets, scoreA, scoreB]
  );
  const won = useMemo(() => setsWon(allSetScores), [allSetScores]);

  // Deltas always land on the set named in the call, so undoing an action from
  // two sets ago corrects THAT set rather than the current one.
  const applyDeltas = useCallback((setNo, playerId, deltas, sign) => {
    setSetStats(prev => {
      const bySet = prev[setNo] || {};
      const cur = bySet[playerId] || emptyPracticeRow();
      const next = { ...cur };
      for (const [f, d] of Object.entries(deltas)) {
        next[f] = Math.max(0, (next[f] || 0) + sign * d);
      }
      return { ...prev, [setNo]: { ...bySet, [playerId]: next } };
    });
  }, []);

  function recordAction(action) {
    if (!selectedId) return;
    const player = allPlayers.find(p => p.id === selectedId);
    const deltas = deltasFor(action);
    applyDeltas(currentSet, selectedId, deltas, +1);
    setHistory(prev => [...prev, {
      type: 'stat',
      setNo: currentSet,
      playerId: selectedId,
      playerName: player?.name || '?',
      side: sideOf[selectedId],
      actionAbbr: action.abbr,
      actionLabel: action.hist || action.label,
      actionErr: !!action.err,
      deltas,
    }]);
    setLastAction(`S${currentSet} · ${player?.name?.split(' ')[0] || '?'} → ${action.hist || action.label}`);
    setFlashId(action.key);
    setFlashKey(k => k + 1);
  }

  function addPoint(side) {
    setHistory(prev => [...prev, { type: 'point', side, delta: +1 }]);
    if (side === 'team_a') setScoreA(v => v + 1); else setScoreB(v => v + 1);
  }

  function subPoint(side) {
    if (side === 'team_a' && scoreA === 0) return;
    if (side === 'team_b' && scoreB === 0) return;
    setHistory(prev => [...prev, { type: 'point', side, delta: -1 }]);
    if (side === 'team_a') setScoreA(v => Math.max(0, v - 1)); else setScoreB(v => Math.max(0, v - 1));
  }

  // A new set can start at ANY score — coaches cut sets short constantly, so
  // there is no "set is over" gate. The only thing in the way is the
  // confirmation, because this resets the scoreboard.
  function confirmNewSet() {
    const finished = { a: scoreA, b: scoreB };
    const next = currentSet + 1;
    setHistory(prev => [...prev, { type: 'newset', fromSet: currentSet, score: finished }]);
    setDoneSets(prev => [...prev, finished]);
    setSetStats(prev => ({ ...prev, [next]: prev[next] || {} }));
    setCurrentSet(next);
    setScoreA(0);
    setScoreB(0);
    setShowNewSet(false);
    setLastAction(`Set ${next} started`);
  }

  function undo() {
    if (history.length === 0) return;
    const last = history[history.length - 1];

    if (last.type === 'newset') {
      // Step back into the previous set and restore the score it ended on.
      const dropped = last.fromSet + 1;
      setDoneSets(prev => prev.slice(0, -1));
      setCurrentSet(last.fromSet);
      setScoreA(last.score.a);
      setScoreB(last.score.b);
      setStatsView(v => (v === dropped ? 'all' : v));
      setSetStats(prev => {
        const nextStats = { ...prev };
        delete nextStats[dropped];
        return nextStats;
      });
      setHistory(prev => prev.slice(0, -1));
      setLastAction(`Back to set ${last.fromSet}`);
      return;
    }

    if (last.type === 'point') {
      if (last.side === 'team_a') setScoreA(v => Math.max(0, v - last.delta));
      else setScoreB(v => Math.max(0, v - last.delta));
    } else {
      applyDeltas(last.setNo, last.playerId, last.deltas, -1);
    }
    setHistory(prev => prev.slice(0, -1));
    setLastAction('(undone)');
  }

  function removeAt(idx) {
    const entry = history[idx];
    if (!entry || entry.type !== 'stat') return;
    applyDeltas(entry.setNo, entry.playerId, entry.deltas, -1);
    setHistory(prev => prev.filter((_, i) => i !== idx));
    setLastAction(`Removed: ${entry.playerName.split(' ')[0]} → ${entry.actionLabel}`);
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setSaveError(null);

    let sessionId = sessionIdRef.current;
    if (!sessionId) {
      const { data, error } = await createPracticeSession({
        teamId: team.id,
        drillType: 'scrimmage',
        name: setup.name,
        sessionDate: setup.sessionDate,
        createdBy: currentUser?.id || null,
        // With sets in play the session score is SETS WON; the points for each
        // individual set ride along in set_scores.
        scoreA: won.a,
        scoreB: won.b,
        setScores: allSetScores,
      });
      if (error || !data) {
        setSaving(false);
        setSaveError(isMissingTableError(error)
          ? 'The practice tables are missing or out of date. Run the PracticePal migrations in scripts/, then save again.'
          : (error?.message || 'Could not create the scrimmage.'));
        return;
      }
      sessionId = data.id;
      sessionIdRef.current = sessionId;
      setSessionStarted(true);
    }

    // Every set goes up in one upsert. keepEmpty so both team sheets survive:
    // a player who never touched the ball is still on record for their side.
    const payload = {};
    for (const setNo of Object.keys(setStats)) {
      payload[setNo] = {};
      allPlayers.forEach(p => {
        payload[setNo][p.id] = setStats[setNo][p.id] || emptyPracticeRow();
      });
    }

    const { error, saved } = await savePracticeSetStats(sessionId, payload, {
      sides: sideOf,
      keepEmpty: true,
    });
    setSaving(false);
    if (error) {
      setSaveError(error.message || 'Could not save the scrimmage stats.');
      return;
    }
    onSaved({ sessionId, playerCount: saved });
  }

  const dirty = history.length > 0;
  const setNumbers = useMemo(
    () => Object.keys(setStats).map(Number).sort((a, b) => a - b),
    [setStats]
  );
  const pointsFor = (side, setNo) => {
    const s = setNo === 'all' ? null : allSetScores[setNo - 1];
    return s ? s[side === 'team_a' ? 'a' : 'b'] : null;
  };

  return (
    <div className="lv">
      {/* ═══ TOP BAR ═══ */}
      <div className="lv-top">
        <div className="lv-sb">
          <div className="lv-sb-row1">
            <button className="lv-sb-pill lv-sb-pill-abandon" onClick={() => (dirty ? setShowExit(true) : onExit())} aria-label="Leave scrimmage">✕</button>
            <button className="lv-sb-pill" onClick={undo} disabled={!history.length} aria-label="Undo">↩</button>
            <button className="lv-sb-pill" onClick={() => setShowHistory(true)} aria-label="Action history">🕐</button>
            <div className="lv-sb-set pp-scrim-tag">SET {currentSet}</div>
            <div className="lv-sb-tabs">
              <button className={`lv-sb-tabtn ${view === 'track' ? 'on' : ''}`} onClick={() => setView('track')}>Live</button>
              <button className={`lv-sb-tabtn ${view === 'stats' ? 'on' : ''}`} onClick={() => setView('stats')}>Stats</button>
            </div>
            <FullscreenButton className="lv-sb-pill lv-sb-pill-fs" size={14} />
            <button className="lv-sb-pill pp-newset-btn" onClick={() => setShowNewSet(true)}>New Set</button>
            <button className="lv-sb-pill pp-scrim-save" onClick={handleSave} disabled={saving || !dirty}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
          <div className="lv-sb-scores">
            <div className="lv-sb-team">
              <div className="lv-sb-label">Team A</div>
              <div className="lv-sb-btns">
                <button className="lv-sb-b lv-sb-b-m" onClick={() => subPoint('team_a')}>−</button>
                <div className="lv-sb-score">{scoreA}</div>
                <button className="lv-sb-b lv-sb-b-p" onClick={() => addPoint('team_a')}>+</button>
              </div>
            </div>
            <div className="lv-sb-center"><div className="lv-sb-setw">{won.a}–{won.b}</div></div>
            <div className="lv-sb-team lv-sb-opp">
              <div className="lv-sb-label">Team B</div>
              <div className="lv-sb-btns">
                <button className="lv-sb-b lv-sb-b-m" onClick={() => subPoint('team_b')}>−</button>
                <div className="lv-sb-score">{scoreB}</div>
                <button className="lv-sb-b lv-sb-b-p" onClick={() => addPoint('team_b')}>+</button>
              </div>
            </div>
          </div>
          {doneSets.length > 0 && (
            <div className="lv-sb-foot">
              {doneSets.map((s, i) => (
                <span key={i} className="lv-sb-chip">S{i + 1}: {s.a}–{s.b}</span>
              ))}
            </div>
          )}
        </div>
        {saveError && <div className="pp-live-error">{saveError}</div>}
        {lastAction && !saveError && <div className="lv-lastbar">{lastAction}</div>}
      </div>

      {/* ═══ BODY ═══ */}
      {view === 'track' ? (
        <div className="lv-split">
          <div className="lv-left">
            {SIDES.map(side => (
              <div key={side.key} className="pp-scrim-group">
                <div className={`pp-scrim-side-hd pp-scrim-${side.key}`}>{side.label}</div>
                {bySide[side.key].length === 0 ? (
                  <div className="pp-scrim-side-empty">nobody assigned</div>
                ) : bySide[side.key].map(p => {
                  const sel = p.id === selectedId;
                  return (
                    <button
                      key={p.id}
                      className={`lv-plr ${sel ? 'lv-plr-sel' : ''}`}
                      onMouseDown={e => e.preventDefault()}
                      onClick={e => { e.preventDefault(); e.stopPropagation(); setSelectedId(sel ? null : p.id); }}
                    >
                      {p.jersey_number && <span className="lv-plr-num">#{p.jersey_number}</span>}
                      <span className="lv-plr-name">{p.name}</span>
                      <span className="lv-plr-stats"><MiniStats s={overall(p.id)} /></span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="lv-right">
            {selected && selStats ? (
              <>
                <div className="lv-sr">
                  <span className="lv-sr-name">
                    {selected.name}
                    <span className={`pp-scrim-badge pp-scrim-${sideOf[selected.id]}`}>
                      {sideLabel(sideOf[selected.id])}
                    </span>
                  </span>
                  <span className="lv-sr-line"><FullStats s={selStats} /></span>
                </div>
                <StatActionGrid
                  stats={selStats}
                  flashId={flashId}
                  flashKey={flashKey}
                  onAction={recordAction}
                />
              </>
            ) : (
              <div className="lv-empty"><span className="lv-empty-arrow">←</span> Select a player</div>
            )}
          </div>
        </div>
      ) : (
        <div className="lv-st-wrap">
          {/* ALL / S1 / S2 … — the per-set breakdown, the same control StatsPal
              uses for a match's sets. */}
          <div className="lv-set-toggle">
            <button className={`lv-set-btn${statsView === 'all' ? ' on' : ''}`} onClick={() => setStatsView('all')}>ALL</button>
            {setNumbers.map(n => (
              <button key={n} className={`lv-set-btn${statsView === n ? ' on' : ''}`} onClick={() => setStatsView(n)}>S{n}</button>
            ))}
          </div>
          {SIDES.map(side => {
            const sets = side.key === 'team_a' ? won.a : won.b;
            const pts = pointsFor(side.key, statsView);
            return (
              <div key={side.key} className="pp-scrim-st-block">
                <div className={`pp-scrim-side-hd pp-scrim-${side.key}`}>
                  {side.label} — {statsView === 'all'
                    ? `${sets} set${sets !== 1 ? 's' : ''}`
                    : `${pts ?? 0} pts`}
                </div>
                <StatsTable
                  players={bySide[side.key]}
                  stats={Object.fromEntries(bySide[side.key].map(p => [p.id, statsFor(p.id, statsView)]))}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ History ═══ */}
      {showHistory && (
        <div className="lv-hist-ov" onClick={() => setShowHistory(false)}>
          <div className="lv-hist" onClick={e => e.stopPropagation()}>
            <div className="lv-hist-hd">
              <span>Action History</span>
              <button className="lv-hist-x" onClick={() => setShowHistory(false)} aria-label="Close">✕</button>
            </div>
            <div className="lv-hist-body">
              {history.filter(h => h.type === 'stat').length === 0 ? (
                <div className="lv-hist-empty">No actions logged yet</div>
              ) : (
                history.map((h, i) => ({ h, i })).filter(({ h }) => h.type === 'stat').reverse().map(({ h, i }) => (
                  <div key={i} className={`lv-hist-row ${h.actionErr ? 'lv-hist-err' : 'lv-hist-ok'}`}>
                    <span className="lv-hist-set">S{h.setNo}</span>
                    <span className="lv-hist-name">{h.playerName}</span>
                    <span className="lv-hist-stat"><b>{h.actionAbbr}</b> — {h.actionLabel}</span>
                    <button className="lv-hist-del" onClick={() => removeAt(i)} aria-label="Remove">✕</button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ New set confirmation ═══ */}
      {showNewSet && (
        <div className="modal-overlay" onClick={() => setShowNewSet(false)}>
          <div className="modal-content pp-confirm" onClick={e => e.stopPropagation()}>
            <h2>Start set {currentSet + 1}?</h2>
            <p>
              The score resets to 0–0. Set {currentSet} finishes at {scoreA}–{scoreB},
              and its stats are kept separately.
            </p>
            <div className="pp-confirm-btns">
              <button type="button" className="pp-btn pp-btn-primary" onClick={confirmNewSet}>
                Start set {currentSet + 1}
              </button>
              <button type="button" className="pp-btn pp-btn-ghost" onClick={() => setShowNewSet(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Leave confirmation ═══ */}
      {showExit && (
        <div className="modal-overlay" onClick={() => setShowExit(false)}>
          <div className="modal-content pp-confirm" onClick={e => e.stopPropagation()}>
            <h2>Leave this scrimmage?</h2>
            <p>
              {history.length} action{history.length !== 1 ? 's' : ''} logged across
              {' '}{setNumbers.length} set{setNumbers.length !== 1 ? 's' : ''}, and
              {' '}{sessionStarted ? 'anything added since the last save' : 'none of it'} will be kept.
            </p>
            <div className="pp-confirm-btns">
              <button type="button" className="pp-btn pp-btn-ghost" onClick={() => setShowExit(false)}>Keep tracking</button>
              <button type="button" className="pp-btn pp-btn-danger" onClick={onExit}>Leave without saving</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
