import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { sortByJersey } from '../utils/sort';
import FullscreenButton from '../components/FullscreenButton';
import {
  drillOf, emptyPracticeRow, drillHeadline, drillBreakdown,
  createPracticeSession, savePracticeStats, isMissingTableError,
} from '../utils/practice';

// Live practice tracking. Same shape as StatsPal's LiveGame — pick a player on
// the left, tap the drill's outcome buttons on the right, tallies update live,
// undo walks the press history backwards — but pointed at practice_sessions /
// practice_stats and with no score, sets or opponent, because a drill has none.

// One button. Flashes on press so a courtside tap is confirmed without the
// coach having to look up at the tally.
//
// A button only ever flashes on its OWN press, so the flash is driven straight
// from the click handler rather than from a key the parent bumps. The timer
// lives in a ref and is restarted on each press, so hammering the same button
// keeps it lit instead of leaving a stale timeout to dark it mid-rally.
function ActBtn({ action, count, onPress }) {
  const [lit, setLit] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function press() {
    setLit(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLit(false), 150);
    onPress();
  }

  return (
    <button
      type="button"
      className={`pp-ab pp-ab-${action.tone}${lit ? ' pp-ab-lit' : ''}`}
      onClick={press}
    >
      {count > 0 && <span className="pp-ab-badge">{count}</span>}
      <span className="pp-ab-abbr">{action.abbr}</span>
      <span className="pp-ab-label">{action.label}</span>
    </button>
  );
}

// The per-player tally shown beside each name in the roster rail.
function RailTally({ drillType, s }) {
  const head = drillHeadline(drillType, s);
  const parts = drillBreakdown(drillType, s);
  const any = parts.some(([, v]) => v > 0);
  if (!any) return <span className="pp-rail-empty">—</span>;
  return (
    <span className="pp-rail-line">
      <b className="pp-rail-head" style={{ color: head.color }}>{head.display}</b>
      {parts.filter(([, v]) => v > 0).map(([abbr, v]) => (
        <span key={abbr} className="pp-rail-pair">
          <b>{v}</b><span>{abbr}</span>
        </span>
      ))}
    </span>
  );
}

export default function PracticeLive({ team, setup, currentUser, onExit, onSaved }) {
  const drill = drillOf(setup.drillType);
  const roster = useMemo(() => sortByJersey(setup.players || []), [setup.players]);

  const [stats, setStats] = useState(() => {
    const o = {};
    roster.forEach(p => { o[p.id] = emptyPracticeRow(); });
    return o;
  });
  const [selectedId, setSelectedId] = useState(roster[0]?.id || null);
  const [history, setHistory] = useState([]);
  const [lastAction, setLastAction] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Set once the session row exists. A retry after a partial failure reuses it
  // instead of creating a second session for the same drill. Mirrored into
  // state because the leave-confirmation text reads it during render.
  const sessionIdRef = useRef(null);
  const [sessionStarted, setSessionStarted] = useState(false);

  const selected = roster.find(p => p.id === selectedId) || null;
  const selectedStats = selectedId ? stats[selectedId] : null;

  const totalReps = useMemo(
    () => history.length,
    [history]
  );

  // ── Recording ────────────────────────────────────────────────────────────
  // A press applies the action's field map to the player. Undo and remove both
  // subtract that same map, so there is exactly one description of what a
  // press means and the three paths can never drift apart.
  const applyFields = useCallback((playerId, fields, sign) => {
    setStats(prev => {
      const cur = prev[playerId] || emptyPracticeRow();
      const next = { ...cur };
      for (const [field, delta] of Object.entries(fields)) {
        next[field] = Math.max(0, (next[field] || 0) + sign * delta);
      }
      return { ...prev, [playerId]: next };
    });
  }, []);

  function record(action) {
    if (!selectedId) return;
    const player = roster.find(p => p.id === selectedId);
    applyFields(selectedId, action.fields, +1);
    setHistory(prev => [...prev, {
      playerId: selectedId,
      playerName: player?.name || '?',
      actionKey: action.key,
      actionAbbr: action.abbr,
      actionLabel: action.hist || action.label,
      fields: action.fields,
      tone: action.tone,
    }]);
    setLastAction(`${player?.name?.split(' ')[0] || '?'} → ${action.hist || action.label}`);
  }

  function undo() {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    applyFields(last.playerId, last.fields, -1);
    setHistory(prev => prev.slice(0, -1));
    setLastAction('(undone)');
  }

  function removeAt(idx) {
    const entry = history[idx];
    if (!entry) return;
    applyFields(entry.playerId, entry.fields, -1);
    setHistory(prev => prev.filter((_, i) => i !== idx));
    setLastAction(`Removed: ${entry.playerName.split(' ')[0]} → ${entry.actionLabel}`);
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setSaveError(null);

    let sessionId = sessionIdRef.current;
    if (!sessionId) {
      const { data, error } = await createPracticeSession({
        teamId: team.id,
        drillType: setup.drillType,
        name: setup.name,
        customLabel: setup.customLabel,
        sessionDate: setup.sessionDate,
        createdBy: currentUser?.id || null,
      });
      if (error || !data) {
        setSaving(false);
        setSaveError(isMissingTableError(error)
          ? 'The practice tables are missing. Run scripts/practicepal_migration.sql in Supabase, then save again.'
          : (error?.message || 'Could not create the practice session.'));
        return;
      }
      sessionId = data.id;
      sessionIdRef.current = sessionId;
      setSessionStarted(true);
    }

    const { error, saved } = await savePracticeStats(sessionId, stats);
    setSaving(false);
    if (error) {
      setSaveError(error.message || 'Could not save the practice stats.');
      return;
    }
    onSaved({ sessionId, playerCount: saved });
  }

  const dirty = history.length > 0;
  const drillTitle = setup.drillType === 'custom'
    ? (setup.customLabel || 'Custom Drill')
    : drill.label;

  return (
    <div className="pp-live">
      {/* ═══ TOP BAR ═══ */}
      <div className="pp-live-top">
        <div className="pp-live-bar">
          <button
            type="button"
            className="pp-pill pp-pill-exit"
            onClick={() => (dirty ? setShowExitConfirm(true) : onExit())}
            aria-label="Leave drill"
          >
            ✕
          </button>
          <button type="button" className="pp-pill" onClick={undo} disabled={!history.length} aria-label="Undo last">
            ↩ Undo
          </button>
          <button type="button" className="pp-pill" onClick={() => setShowHistory(true)} aria-label="Rep history">
            History
          </button>

          <div className="pp-live-title">
            <span className="pp-live-title-name">{drillTitle}</span>
            <span className="pp-live-title-meta">
              {roster.length} player{roster.length !== 1 ? 's' : ''} · {totalReps} rep{totalReps !== 1 ? 's' : ''}
            </span>
          </div>

          <FullscreenButton className="pp-pill pp-pill-icon" size={14} />
          <button
            type="button"
            className="pp-pill pp-pill-save"
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        {saveError && <div className="pp-live-error">{saveError}</div>}
        {lastAction && !saveError && <div className="pp-live-last">{lastAction}</div>}
      </div>

      {/* ═══ BODY ═══ */}
      <div className="pp-live-split">
        {/* Roster rail */}
        <div className="pp-rail">
          {roster.map(p => {
            const sel = p.id === selectedId;
            return (
              <button
                key={p.id}
                type="button"
                className={`pp-rail-btn${sel ? ' pp-rail-sel' : ''}`}
                onMouseDown={e => e.preventDefault()}
                onClick={() => setSelectedId(sel ? null : p.id)}
              >
                {p.jersey_number != null && p.jersey_number !== '' && (
                  <span className="pp-rail-num">#{p.jersey_number}</span>
                )}
                <span className="pp-rail-name">{p.name}</span>
                <RailTally drillType={setup.drillType} s={stats[p.id] || emptyPracticeRow()} />
              </button>
            );
          })}
        </div>

        {/* Action panel */}
        <div className="pp-panel">
          {selected && selectedStats ? (
            <>
              <div className="pp-panel-head">
                <span className="pp-panel-name">{selected.name}</span>
                <span className="pp-panel-stats">
                  {(() => {
                    const head = drillHeadline(setup.drillType, selectedStats);
                    return (
                      <>
                        <span className="pp-panel-head-val" style={{ color: head.color }}>{head.display}</span>
                        <span className="pp-panel-head-lbl">{head.label}</span>
                        {drillBreakdown(setup.drillType, selectedStats).map(([abbr, v]) => (
                          <span key={abbr} className="pp-panel-pair"><b>{v}</b><span>{abbr}</span></span>
                        ))}
                      </>
                    );
                  })()}
                </span>
              </div>
              <div className={`pp-actions pp-actions-${drill.actions.length}`}>
                {drill.actions.map(a => (
                  <ActBtn
                    key={a.key}
                    action={a}
                    // The badge shows the counter this button owns — the first
                    // field in its map, which is the one unique to it.
                    count={selectedStats[Object.keys(a.fields)[0]] || 0}
                    onPress={() => record(a)}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="pp-panel-empty">Select a player to start logging reps</div>
          )}
        </div>
      </div>

      {/* ═══ History ═══ */}
      {showHistory && (
        <div className="pp-hist-ov" onClick={() => setShowHistory(false)}>
          <div className="pp-hist" onClick={e => e.stopPropagation()}>
            <div className="pp-hist-head">
              <span>Rep History</span>
              <button type="button" className="pp-hist-x" onClick={() => setShowHistory(false)} aria-label="Close">✕</button>
            </div>
            <div className="pp-hist-body">
              {history.length === 0 ? (
                <div className="pp-hist-empty">No reps logged yet</div>
              ) : (
                history.map((h, i) => ({ h, i })).reverse().map(({ h, i }) => (
                  <div key={i} className={`pp-hist-row pp-hist-${h.tone}`}>
                    <span className="pp-hist-n">{i + 1}</span>
                    <span className="pp-hist-name">{h.playerName}</span>
                    <span className="pp-hist-act"><b>{h.actionAbbr}</b> — {h.actionLabel}</span>
                    <button type="button" className="pp-hist-del" onClick={() => removeAt(i)} aria-label="Remove rep">✕</button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Leave confirmation ═══ */}
      {showExitConfirm && (
        <div className="modal-overlay" onClick={() => setShowExitConfirm(false)}>
          <div className="modal-content pp-confirm" onClick={e => e.stopPropagation()}>
            <h2>Leave this drill?</h2>
            <p>
              {history.length} rep{history.length !== 1 ? 's' : ''} {history.length !== 1 ? 'have' : 'has'} been
              logged and {sessionStarted ? 'anything added since the last save' : 'none of it'} will be lost.
            </p>
            <div className="pp-confirm-btns">
              <button type="button" className="pp-btn pp-btn-ghost" onClick={() => setShowExitConfirm(false)}>
                Keep tracking
              </button>
              <button type="button" className="pp-btn pp-btn-danger" onClick={onExit}>
                Leave without saving
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
