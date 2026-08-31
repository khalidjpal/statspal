import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import { sortByJersey } from '../utils/sort';
import FullscreenButton from '../components/FullscreenButton';
import {
  IconArrowLeft, IconArrowRight, IconTrash, IconCheck,
  IconReceive, IconAttack, IconServe, IconDrill,
} from '../components/Icons';
import { ConfirmDelete } from '../components/dashboard/EditModeKit';
import PracticeLive from './PracticeLive';
import PracticeTrends from './PracticeTrends';
import {
  DRILLS, DRILL_ORDER, drillOf, sessionDrillLabel,
  drillHeadline, drillBreakdown, sumPracticeRows, emptyPracticeRow,
  fetchPracticeSessions, fetchPracticeStats, deletePracticeSession,
  isMissingTableError,
} from '../utils/practice';

// PracticePal — the third pillar, alongside RotationPal and StatsPal.
//
// The home screen is a three-column dashboard:
//   LEFT   sessions   — what has been tracked, newest first
//   MIDDLE player     — pick one, see their trend and practice-vs-game
//   RIGHT  start      — the primary action, one entry point per drill
//
// Everything it records goes to practice_sessions / practice_stats; it never
// writes to a game or tournament table. The only game data it touches is the
// read-only player_game_stats it hands to PracticeTrends for the comparison.

const VIEWS = { DASH: 'dash', SETUP: 'setup', LIVE: 'live' };

const DRILL_ICONS = {
  serve_receive: IconReceive,
  hitting: IconAttack,
  serving: IconServe,
  custom: IconDrill,
};

// Filter chips for the sessions card. Ordered the way a coach scans them
// rather than by DRILL_ORDER — the two ball-contact drills sit together.
const SESSION_FILTERS = [
  { key: 'all',           label: 'All' },
  { key: 'serve_receive', label: 'Serve-Receive' },
  { key: 'serving',       label: 'Serving' },
  { key: 'hitting',       label: 'Hitting' },
  { key: 'custom',        label: 'Custom' },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = String(d).split('-');
  if (!y || !m || !day) return String(d);
  return `${Number(m)}/${Number(day)}/${String(y).slice(2)}`;
}

// ─── New session setup ─────────────────────────────────────────────────────
// The drill is already chosen — the dashboard button that opened this screen
// decided it. What is left is who is in the drill: a drill is usually a subset
// of the roster, and tracking the whole squad when only four passers are on
// the court makes the tallies unreadable.
function PracticeSetup({ drillType, roster, onCancel, onStart }) {
  const drill = drillOf(drillType);
  const [customLabel, setCustomLabel] = useState('');
  const [name, setName] = useState('');
  const [sessionDate, setSessionDate] = useState(today());
  const [picked, setPicked] = useState([]);

  const isCustom = drillType === 'custom';
  const allPicked = picked.length === roster.length && roster.length > 0;
  const canStart = picked.length > 0 && (!isCustom || customLabel.trim().length > 0);
  const Icon = DRILL_ICONS[drillType] || IconDrill;

  function toggle(id) {
    setPicked(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  }

  return (
    <div className="pp-setup">
      <div className="pp-setup-banner">
        <span className={`pp-setup-icon pp-tint-${drillType}`}><Icon size={20} /></span>
        <span className="pp-setup-banner-text">
          <span className="pp-setup-banner-title">{drill.label}</span>
          <span className="pp-setup-banner-sub">{drill.blurb}</span>
        </span>
        <span className="pp-setup-keys">
          {drill.actions.map(a => (
            <span key={a.key} className={`pp-drill-key pp-ab-${a.tone}`}>{a.abbr}</span>
          ))}
        </span>
      </div>

      <section className="pp-card">
        <div className="pp-card-head">
          <h3>{isCustom ? 'Name the drill' : 'Session details'}</h3>
          <span className="pp-card-sub">
            {isCustom
              ? 'A custom drill needs a name before it can be tracked.'
              : 'Both optional — the drill and date are enough to save.'}
          </span>
        </div>

        {isCustom && (
          <label className="pp-field">
            <span className="pp-field-lbl">Drill name</span>
            <input
              className="pp-input"
              value={customLabel}
              onChange={e => setCustomLabel(e.target.value)}
              placeholder="e.g. Pepper to 20"
              maxLength={60}
              autoFocus
            />
          </label>
        )}

        <div className="pp-field-row">
          <label className="pp-field">
            <span className="pp-field-lbl">Session label <span className="pp-opt">optional</span></span>
            <input
              className="pp-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Tuesday AM"
              maxLength={80}
            />
          </label>
          <label className="pp-field pp-field-date">
            <span className="pp-field-lbl">Date</span>
            <input
              className="pp-input"
              type="date"
              value={sessionDate}
              onChange={e => setSessionDate(e.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="pp-card">
        <div className="pp-card-head">
          <h3>Players in the drill</h3>
          <span className="pp-card-sub">{picked.length} of {roster.length} selected</span>
        </div>
        <div className="pp-seg pp-seg-inline">
          <button
            type="button"
            className={`pp-seg-btn${allPicked ? ' on' : ''}`}
            onClick={() => setPicked(roster.map(p => p.id))}
          >
            Whole roster
          </button>
          <button
            type="button"
            className={`pp-seg-btn${picked.length === 0 ? ' on' : ''}`}
            onClick={() => setPicked([])}
          >
            Clear
          </button>
        </div>
        {roster.length === 0 ? (
          <div className="pp-empty">This team has no players on its roster yet.</div>
        ) : (
          <div className="pp-pickgrid">
            {roster.map(p => {
              const on = picked.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`pp-pick${on ? ' pp-pick-on' : ''}`}
                  onClick={() => toggle(p.id)}
                  aria-pressed={on}
                >
                  <span className="pp-pick-check">{on ? <IconCheck size={12} /> : null}</span>
                  <span className="pp-pick-num">
                    {p.jersey_number != null && p.jersey_number !== '' ? `#${p.jersey_number}` : '—'}
                  </span>
                  <span className="pp-pick-name">{p.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <div className="pp-setup-actions">
        <button type="button" className="pp-btn pp-btn-ghost" onClick={onCancel}>Cancel</button>
        <button
          type="button"
          className="pp-btn pp-btn-primary"
          disabled={!canStart}
          onClick={() => onStart({
            drillType,
            customLabel: customLabel.trim(),
            name: name.trim(),
            sessionDate,
            players: roster.filter(p => picked.includes(p.id)),
          })}
        >
          Start drill
          {picked.length > 0 && ` · ${picked.length} player${picked.length !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}

// ─── One saved session, opened over the dashboard ──────────────────────────
// A modal rather than a fourth view: the dashboard behind it keeps its place,
// so closing a session detail returns you exactly where you were in the list.
function SessionDetailModal({ session, rows, players, onClose, onDelete }) {
  const byId = useMemo(() => {
    const m = {};
    (players || []).forEach(p => { m[p.id] = p; });
    return m;
  }, [players]);

  const ordered = useMemo(() => {
    const withPlayer = rows.map(r => ({ r, p: byId[r.player_id] })).filter(x => x.p);
    return sortByJersey(withPlayer.map(x => x.p)).map(p => ({
      p,
      r: withPlayer.find(x => x.p.id === p.id).r,
    }));
  }, [rows, byId]);

  const total = useMemo(() => sumPracticeRows(rows), [rows]);
  const totalHead = drillHeadline(session.drill_type, total);
  const drill = drillOf(session.drill_type);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="pp-modal-ov" onClick={onClose} role="dialog" aria-modal="true">
      <div className="pp-modal" onClick={e => e.stopPropagation()}>
        <div className="pp-modal-head">
          <div className="pp-modal-titles">
            <span className="pp-modal-title">{session.name || sessionDrillLabel(session)}</span>
            <span className="pp-modal-sub">
              {sessionDrillLabel(session)} · {fmtDate(session.session_date)} · {ordered.length} player{ordered.length !== 1 ? 's' : ''}
            </span>
          </div>
          <button type="button" className="pp-modal-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="pp-modal-body">
          <div className="pp-detail-total">
            <span className="pp-detail-total-val" style={{ color: totalHead.color }}>{totalHead.display}</span>
            <span className="pp-detail-total-lbl">
              Team {totalHead.label.toLowerCase()} · {totalHead.reps} {totalHead.repsLabel}
            </span>
          </div>

          {ordered.length === 0 ? (
            <div className="pp-empty">No reps were recorded in this session.</div>
          ) : (
            <div className="pp-table-wrap">
              <table className="pp-table">
                <thead>
                  <tr>
                    <th className="pp-th-l">#</th>
                    <th className="pp-th-l">Player</th>
                    {drillBreakdown(session.drill_type, emptyPracticeRow()).map(([abbr]) => (
                      <th key={abbr}>{abbr}</th>
                    ))}
                    <th>{totalHead.label}</th>
                  </tr>
                </thead>
                <tbody>
                  {ordered.map(({ p, r }) => {
                    const head = drillHeadline(session.drill_type, r);
                    return (
                      <tr key={p.id}>
                        <td className="pp-th-l pp-td-num">
                          {p.jersey_number != null && p.jersey_number !== '' ? p.jersey_number : '—'}
                        </td>
                        <td className="pp-th-l pp-td-name">{p.name}</td>
                        {drillBreakdown(session.drill_type, r).map(([abbr, v]) => (
                          <td key={abbr}>{v}</td>
                        ))}
                        <td className="pp-td-head" style={{ color: head.color }}>{head.display}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="pp-detail-foot">
            {drill.blurb}. Stored in <code>practice_stats</code> — separate from match statistics.
          </p>
        </div>

        <div className="pp-modal-foot">
          <button type="button" className="pp-btn pp-btn-danger pp-btn-sm" onClick={onDelete}>
            <IconTrash size={12} /> Delete session
          </button>
          <button type="button" className="pp-btn pp-btn-ghost pp-btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Shell ─────────────────────────────────────────────────────────────────
export default function PracticePal({ team, onHome }) {
  const { currentUser } = useAuth();
  const { players, playerGameStats } = useData();
  const { addToast } = useToast();

  const [view, setView] = useState(VIEWS.DASH);
  const [setupDrill, setSetupDrill] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [practiceStats, setPracticeStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [liveSetup, setLiveSetup] = useState(null);
  const [openSessionId, setOpenSessionId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [sessionFilter, setSessionFilter] = useState('all');
  // null = the middle card shows team stats; a player id drills into them.
  const [focusPlayerId, setFocusPlayerId] = useState(null);

  const canTrack = currentUser?.role === 'admin' || currentUser?.role === 'coach';

  const roster = useMemo(
    () => sortByJersey((players || []).filter(p => p.team_id === team?.id)),
    [players, team?.id]
  );

  // Sessions and their stat rows in two round trips — the second is keyed off
  // the first, so it cannot be parallelised.
  const load = useCallback(async () => {
    if (!team?.id) return;
    setLoading(true);
    const { data: ss, error } = await fetchPracticeSessions(team.id);
    if (error) {
      setLoadError(isMissingTableError(error)
        ? 'PracticePal needs its tables. Run scripts/practicepal_migration.sql in the Supabase SQL editor, then reload.'
        : (error.message || 'Could not load practice sessions.'));
      setSessions([]);
      setPracticeStats([]);
      setLoading(false);
      return;
    }
    setLoadError(null);
    setSessions(ss);
    const { data: rows } = await fetchPracticeStats(ss.map(s => s.id));
    setPracticeStats(rows);
    setLoading(false);
  }, [team?.id]);

  useEffect(() => { load(); }, [load]);

  const rowsBySession = useMemo(() => {
    const m = {};
    for (const r of practiceStats) {
      (m[r.practice_session_id] ||= []).push(r);
    }
    return m;
  }, [practiceStats]);

  const openSession = sessions.find(s => s.id === openSessionId) || null;

  // `sessions` is already newest-first from the query; filtering preserves it.
  const shownSessions = useMemo(
    () => (sessionFilter === 'all'
      ? sessions
      : sessions.filter(s => s.drill_type === sessionFilter)),
    [sessions, sessionFilter]
  );

  function openSetup(drillType) {
    setOpenSessionId(null);
    setSetupDrill(drillType);
    setView(VIEWS.SETUP);
  }

  function startDrill(setup) {
    setLiveSetup(setup);
    setView(VIEWS.LIVE);
  }

  async function handleSaved({ playerCount }) {
    setLiveSetup(null);
    setSetupDrill(null);
    setView(VIEWS.DASH);
    addToast(`Practice saved — ${playerCount} player${playerCount !== 1 ? 's' : ''}`, 'success');
    await load();
  }

  async function confirmDelete() {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    const { error } = await deletePracticeSession(pendingDelete.id);
    setDeleting(false);
    if (error) {
      addToast(error.message || 'Could not delete that session');
      return;
    }
    setPendingDelete(null);
    setOpenSessionId(null);
    addToast('Practice session deleted', 'success');
    await load();
  }

  // Live tracking takes the whole screen — no chrome competing with the tap
  // targets. It is rendered instead of the shell, not inside it.
  if (view === VIEWS.LIVE && liveSetup) {
    return (
      <PracticeLive
        team={team}
        setup={liveSetup}
        currentUser={currentUser}
        onExit={() => { setLiveSetup(null); setSetupDrill(null); setView(VIEWS.DASH); }}
        onSaved={handleSaved}
      />
    );
  }

  const inSetup = view === VIEWS.SETUP && setupDrill;

  return (
    <div className="pp-page" style={{ '--tc': team?.color || '#4ade80' }}>
      <header className="pp-topbar">
        <button
          type="button"
          className="pp-topbar-back"
          onClick={inSetup ? () => { setSetupDrill(null); setView(VIEWS.DASH); } : onHome}
        >
          <IconArrowLeft size={13} /> {inSetup ? 'PracticePal' : 'Dashboard'}
        </button>

        <div className="pp-topbar-brand">
          <span className="pp-topbar-name">Practice<span className="pp-topbar-accent">Pal</span></span>
          <span className="pp-topbar-team">{team?.name}</span>
        </div>

        <div className="pp-topbar-right">
          <FullscreenButton className="pp-pill pp-pill-icon" size={14} />
        </div>
      </header>

      {inSetup ? (
        <main className="pp-main">
          {loadError && <div className="pp-alert">{loadError}</div>}
          <PracticeSetup
            drillType={setupDrill}
            roster={roster}
            onCancel={() => { setSetupDrill(null); setView(VIEWS.DASH); }}
            onStart={startDrill}
          />
        </main>
      ) : (
        <main className="pp-dash">
          {loadError && <div className="pp-dash-alert"><div className="pp-alert">{loadError}</div></div>}

          {/* ══ LEFT — sessions ══ */}
          <section className="pp-col pp-col-sessions">
            <header className="pp-col-head">
              <h2>Sessions</h2>
              <span className="pp-col-count">
                {loading ? '' : `${sessions.length} tracked`}
              </span>
            </header>

            <div className="pp-col-body">
            <div className="pp-filters">
              {SESSION_FILTERS.map(f => (
                <button
                  key={f.key}
                  type="button"
                  className={`pp-filter${f.key === sessionFilter ? ' pp-filter-on' : ''}`}
                  onClick={() => setSessionFilter(f.key)}
                  aria-pressed={f.key === sessionFilter}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="pp-empty">Loading practice sessions…</div>
            ) : shownSessions.length === 0 ? (
              <div className="pp-zero pp-zero-sm">
                <div className="pp-zero-title">
                  {sessionFilter === 'all'
                    ? 'No sessions yet'
                    : `No ${SESSION_FILTERS.find(f => f.key === sessionFilter).label.toLowerCase()} sessions yet`}
                </div>
                <p className="pp-zero-text">
                  {sessions.length === 0
                    ? 'Start a drill from “Start a drill”. Practice numbers stay in their own tables — they never touch match stats.'
                    : 'Nothing tracked for this drill type. Pick another filter, or run one.'}
                </p>
              </div>
            ) : (
              <div className="pp-list">
                {shownSessions.map(s => {
                  const rows = rowsBySession[s.id] || [];
                  const head = drillHeadline(s.drill_type, sumPracticeRows(rows));
                  const hasLabel = !!s.name && s.name !== sessionDrillLabel(s);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`pp-sess${s.id === openSessionId ? ' pp-sess-open' : ''}`}
                      onClick={() => setOpenSessionId(s.id)}
                    >
                      <span className="pp-sess-top">
                        <span className={`pp-sess-type pp-sess-type-${s.drill_type}`}>
                          {sessionDrillLabel(s)}
                        </span>
                        <span className="pp-sess-date">{fmtDate(s.session_date)}</span>
                      </span>
                      {hasLabel && <span className="pp-sess-name">{s.name}</span>}
                      <span className="pp-sess-foot">
                        <span className="pp-sess-meta">
                          {rows.length} player{rows.length !== 1 ? 's' : ''} · {head.reps} {head.repsLabel}
                        </span>
                        <span className="pp-sess-val" style={{ color: head.color }}>
                          <b>{head.display}</b>
                          <span>{head.label}</span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            </div>
          </section>

          {/* ══ MIDDLE — player trends + compare ══ */}
          {/* The middle card titles itself from the selection, which is why
              that selection lives here rather than inside PracticeTrends: the
              header has to say which of the two views is on screen, and carry
              the way back out of the player drill-down. */}
          <section className="pp-col pp-col-player">
            <header className="pp-col-head">
              <h2>{focusPlayerId ? 'Player development' : 'Team stats'}</h2>
              {focusPlayerId ? (
                <button
                  type="button"
                  className="pp-col-back"
                  onClick={() => setFocusPlayerId(null)}
                >
                  <IconArrowLeft size={11} /> Team stats
                </button>
              ) : (
                <span className="pp-col-count">Whole squad across all practice</span>
              )}
            </header>
            <div className="pp-col-body">
            {loading ? (
              <div className="pp-empty">Loading…</div>
            ) : (
              <PracticeTrends
                team={team}
                players={players}
                sessions={sessions}
                practiceStats={practiceStats}
                playerGameStats={playerGameStats}
                playerId={focusPlayerId}
                onSelectPlayer={setFocusPlayerId}
              />
            )}
            </div>
          </section>

          {/* ══ RIGHT — start a drill ══ */}
          <aside className="pp-col pp-col-start">
            <header className="pp-col-head">
              <h2>Start a drill</h2>
              <span className="pp-col-count">Pick players, then track</span>
            </header>

            <div className="pp-col-body">
            {!canTrack ? (
              <div className="pp-empty">Only a coach or admin can track practice.</div>
            ) : (
              <div className="pp-start-list">
                {DRILL_ORDER.map(key => {
                  const d = DRILLS[key];
                  const Icon = DRILL_ICONS[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`pp-start pp-tint-border-${key}`}
                      onClick={() => openSetup(key)}
                    >
                      <span className={`pp-start-icon pp-tint-${key}`}><Icon size={20} /></span>
                      <span className="pp-start-body">
                        <span className="pp-start-title">{d.label}</span>
                        <span className="pp-start-sub">{d.blurb}</span>
                      </span>
                      <span className="pp-start-arrow"><IconArrowRight size={14} /></span>
                    </button>
                  );
                })}
              </div>
            )}
            </div>
          </aside>
        </main>
      )}

      {openSession && (
        <SessionDetailModal
          session={openSession}
          rows={rowsBySession[openSession.id] || []}
          players={players}
          onClose={() => setOpenSessionId(null)}
          onDelete={() => setPendingDelete(openSession)}
        />
      )}

      <ConfirmDelete
        open={!!pendingDelete}
        title={`Delete “${pendingDelete?.name || sessionDrillLabel(pendingDelete)}”?`}
        detail="The session and every practice rep recorded in it are deleted. Match statistics are not affected. This cannot be undone."
        confirmLabel="Delete session"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => !deleting && setPendingDelete(null)}
      />
    </div>
  );
}
