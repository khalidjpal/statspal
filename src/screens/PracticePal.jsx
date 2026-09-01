import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import { sortByJersey } from '../utils/sort';
import FullscreenButton from '../components/FullscreenButton';
import {
  IconArrowLeft, IconArrowRight, IconTrash, IconCheck,
  IconReceive, IconAttack, IconServe, IconDrill, IconUsers,
} from '../components/Icons';
import { ConfirmDelete } from '../components/dashboard/EditModeKit';
import PracticeLive from './PracticeLive';
import PracticeScrimmage from './PracticeScrimmage';
import PracticeTrends from './PracticeTrends';
import {
  DRILLS, DRILL_ORDER, drillOf, sessionDrillLabel, SIDES, setScoreLine,
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
  scrimmage: IconUsers,
};

// Filter chips for the sessions card. Ordered the way a coach scans them
// rather than by DRILL_ORDER — the two ball-contact drills sit together.
const SESSION_FILTERS = [
  { key: 'all',           label: 'All' },
  { key: 'serve_receive', label: 'Serve-Receive' },
  { key: 'serving',       label: 'Serving' },
  { key: 'hitting',       label: 'Hitting' },
  { key: 'custom',        label: 'Custom' },
  { key: 'scrimmage',     label: 'Scrimmage' },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

// 'Aug 31, 2026' — shown once per day, so the chips beneath it can drop the
// date entirely. Built from the parts rather than Date() so a YYYY-MM-DD string
// is never shifted by the local timezone.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDateLong(d) {
  if (!d) return 'Undated';
  const [y, m, day] = String(d).split('-');
  if (!y || !m || !day) return String(d);
  return `${MONTHS[Number(m) - 1] || m} ${Number(day)}, ${y}`;
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

// ─── Scrimmage setup: split the roster into two sides ──────────────────────
// A scrimmage is intrasquad, so both sides come out of the same roster and a
// player is on exactly one of them. Each row carries an A|B pair rather than a
// drag-and-drop board: one tap assigns, tapping the lit side unassigns, and it
// works one-handed on a phone — which a two-pane drag target does not.
function ScrimmageSetup({ roster, onCancel, onStart }) {
  const [name, setName] = useState('');
  const [sessionDate, setSessionDate] = useState(today());
  const [assign, setAssign] = useState({});   // playerId -> 'team_a' | 'team_b'

  const counts = {
    team_a: roster.filter(p => assign[p.id] === 'team_a').length,
    team_b: roster.filter(p => assign[p.id] === 'team_b').length,
  };
  const unassigned = roster.length - counts.team_a - counts.team_b;
  const canStart = counts.team_a > 0 && counts.team_b > 0;

  function put(id, side) {
    setAssign(prev => (prev[id] === side
      ? { ...prev, [id]: undefined }
      : { ...prev, [id]: side }));
  }

  // Alternate down the jersey order — a reasonable default split that the
  // coach then adjusts, rather than making them tap every player.
  function splitEvenly() {
    const next = {};
    roster.forEach((p, i) => { next[p.id] = i % 2 === 0 ? 'team_a' : 'team_b'; });
    setAssign(next);
  }

  return (
    <div className="pp-setup">
      <div className="pp-setup-banner">
        <span className="pp-setup-icon pp-tint-scrimmage"><IconUsers size={20} /></span>
        <span className="pp-setup-banner-text">
          <span className="pp-setup-banner-title">Scrimmage</span>
          <span className="pp-setup-banner-sub">{DRILLS.scrimmage.blurb}</span>
        </span>
      </div>

      <section className="pp-card">
        <div className="pp-card-head">
          <h3>Session details</h3>
          <span className="pp-card-sub">Both optional — the date is enough to save.</span>
        </div>
        <div className="pp-field-row">
          <label className="pp-field">
            <span className="pp-field-lbl">Session label <span className="pp-opt">optional</span></span>
            <input
              className="pp-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Friday scrimmage"
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
          <h3>Assign the two sides</h3>
          <span className="pp-card-sub">
            Team A {counts.team_a} · Team B {counts.team_b}
            {unassigned > 0 ? ` · ${unassigned} unassigned` : ''}
          </span>
        </div>

        <div className="pp-seg pp-seg-inline">
          <button type="button" className="pp-seg-btn" onClick={splitEvenly}>Split evenly</button>
          <button type="button" className="pp-seg-btn" onClick={() => setAssign({})}>Clear</button>
        </div>

        {roster.length === 0 ? (
          <div className="pp-empty">This team has no players on its roster yet.</div>
        ) : (
          <div className="pp-assign">
            <div className="pp-assign-head">
              <span className="pp-assign-head-name">Player</span>
              <span className="pp-assign-head-side pp-scrim-team_a">Team A</span>
              <span className="pp-assign-head-side pp-scrim-team_b">Team B</span>
            </div>
            {roster.map(p => (
              <div key={p.id} className="pp-assign-row">
                <span className="pp-assign-num">
                  {p.jersey_number != null && p.jersey_number !== '' ? p.jersey_number : '—'}
                </span>
                <span className="pp-assign-name">{p.name}</span>
                {SIDES.map(side => (
                  <button
                    key={side.key}
                    type="button"
                    className={`pp-assign-btn${assign[p.id] === side.key ? ` on pp-scrim-bg-${side.key}` : ''}`}
                    onClick={() => put(p.id, side.key)}
                    aria-pressed={assign[p.id] === side.key}
                    aria-label={`${p.name} to ${side.label}`}
                  >
                    {side.key === 'team_a' ? 'A' : 'B'}
                  </button>
                ))}
              </div>
            ))}
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
            drillType: 'scrimmage',
            name: name.trim(),
            sessionDate,
            sides: {
              team_a: roster.filter(p => assign[p.id] === 'team_a'),
              team_b: roster.filter(p => assign[p.id] === 'team_b'),
            },
          })}
        >
          Start scrimmage
          {canStart && ` · ${counts.team_a} v ${counts.team_b}`}
        </button>
      </div>
    </div>
  );
}

// ─── One saved session, opened over the dashboard ──────────────────────────
// A modal rather than a fourth view: the dashboard behind it keeps its place,
// so closing a session detail returns you exactly where you were in the list.
// The per-player table inside a session detail. Split out because a scrimmage
// renders it twice — once per side.
function DetailTable({ drillType, ordered, headLabel }) {
  return (
    <div className="pp-table-wrap">
      <table className="pp-table">
        <thead>
          <tr>
            <th className="pp-th-l">#</th>
            <th className="pp-th-l">Player</th>
            {drillBreakdown(drillType, emptyPracticeRow()).map(([abbr]) => (
              <th key={abbr}>{abbr}</th>
            ))}
            <th>{headLabel}</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map(({ p, r }) => {
            const head = drillHeadline(drillType, r);
            return (
              <tr key={p.id}>
                <td className="pp-th-l pp-td-num">
                  {p.jersey_number != null && p.jersey_number !== '' ? p.jersey_number : '—'}
                </td>
                <td className="pp-th-l pp-td-name">{p.name}</td>
                {drillBreakdown(drillType, r).map(([abbr, v]) => (
                  <td key={abbr}>{v}</td>
                ))}
                <td className="pp-td-head" style={{ color: head.color }}>{head.display}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SessionDetailModal({ session, rows, players, onClose, onDelete }) {
  const byId = useMemo(() => {
    const m = {};
    (players || []).forEach(p => { m[p.id] = p; });
    return m;
  }, [players]);

  // Which sets this session holds. A focused drill has only set 1; a scrimmage
  // has one row per player PER SET, so the rows have to be folded per player.
  const setsPresent = useMemo(
    () => [...new Set(rows.map(r => r.set_number || 1))].sort((a, b) => a - b),
    [rows]
  );
  const [setView, setSetView] = useState('all');
  const shownRows = useMemo(
    () => (setView === 'all' ? rows : rows.filter(r => (r.set_number || 1) === setView)),
    [rows, setView]
  );

  // One entry per PLAYER, summing whatever rows they have in scope. For a
  // focused drill that is a single row and the sum is a no-op; for a scrimmage
  // viewed as ALL it is the session total across sets.
  const ordered = useMemo(() => {
    const byPlayer = new Map();
    for (const r of shownRows) {
      const p = byId[r.player_id];
      if (!p) continue;
      const cur = byPlayer.get(p.id) || { p, rows: [], side: null };
      cur.rows.push(r);
      if (r.side) cur.side = r.side;
      byPlayer.set(p.id, cur);
    }
    return sortByJersey([...byPlayer.values()].map(x => x.p)).map(p => {
      const e = byPlayer.get(p.id);
      return { p, r: { ...sumPracticeRows(e.rows), side: e.side } };
    });
  }, [shownRows, byId]);

  const total = useMemo(() => sumPracticeRows(shownRows), [shownRows]);
  const totalHead = drillHeadline(session.drill_type, total);
  const drill = drillOf(session.drill_type);
  const isScrimmage = session.drill_type === 'scrimmage';
  const setScores = Array.isArray(session.set_scores) ? session.set_scores : [];
  // Exactly one set: the headline is that set's POINTS. Several sets: it is
  // sets won, which is what score_a/score_b hold. Zero recorded sets means a
  // scrimmage saved before set_scores existed — fall back to score_a/score_b,
  // which back then were the points, so the headline stays correct either way.
  const oneSet = setScores.length === 1;
  const headA = oneSet ? (setScores[0].a ?? 0) : (session.score_a ?? 0);
  const headB = oneSet ? (setScores[0].b ?? 0) : (session.score_b ?? 0);

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
          {isScrimmage ? (
            <>
              {/* The score is the headline of a scrimmage, not a rate. With
                  one set it is that set's points; with several it is sets won,
                  and the per-set points sit underneath. */}
              <div className="pp-scrim-score">
                <span className="pp-scrim-score-side">
                  <span className="pp-scrim-score-lbl pp-scrim-team_a">Team A</span>
                  <span className="pp-scrim-score-val">
                    {headA}
                  </span>
                </span>
                <span className="pp-scrim-score-sep">–</span>
                <span className="pp-scrim-score-side">
                  <span className="pp-scrim-score-lbl pp-scrim-team_b">Team B</span>
                  <span className="pp-scrim-score-val">
                    {headB}
                  </span>
                </span>
              </div>
              {setScores.length > 0 && (
                <div className="pp-scrim-setline">
                  {oneSet ? 'Single set' : `${setScores.length} sets · sets won`}
                  <span className="pp-scrim-setline-scores">{setScoreLine(setScores)}</span>
                </div>
              )}

              {/* Per-set breakdown. ALL is the session total across sets. */}
              {setsPresent.length > 1 && (
                <div className="lv-set-toggle pp-detail-sets">
                  <button
                    type="button"
                    className={`lv-set-btn${setView === 'all' ? ' on' : ''}`}
                    onClick={() => setSetView('all')}
                  >
                    ALL
                  </button>
                  {setsPresent.map(n => (
                    <button
                      key={n}
                      type="button"
                      className={`lv-set-btn${setView === n ? ' on' : ''}`}
                      onClick={() => setSetView(n)}
                    >
                      S{n}
                    </button>
                  ))}
                </div>
              )}
              {SIDES.map(side => {
                const sideRows = ordered.filter(x => x.r.side === side.key);
                return (
                  <div key={side.key} className="pp-scrim-st-block">
                    <div className={`pp-scrim-side-hd pp-scrim-${side.key}`}>
                      {side.label} · {sideRows.length} player{sideRows.length !== 1 ? 's' : ''}
                    </div>
                    {sideRows.length === 0 ? (
                      <div className="pp-empty">Nobody was recorded on this side.</div>
                    ) : (
                      <DetailTable
                        drillType={session.drill_type}
                        ordered={sideRows}
                        headLabel={totalHead.label}
                      />
                    )}
                  </div>
                );
              })}
              {/* Rows written before the side column existed have no side and
                  would otherwise vanish between the two tables above. */}
              {ordered.some(x => !x.r.side) && (
                <div className="pp-scrim-st-block">
                  <div className="pp-scrim-side-hd">Unassigned</div>
                  <DetailTable
                    drillType={session.drill_type}
                    ordered={ordered.filter(x => !x.r.side)}
                    headLabel={totalHead.label}
                  />
                </div>
              )}
            </>
          ) : (
            <>
              <div className="pp-detail-total">
                <span className="pp-detail-total-val" style={{ color: totalHead.color }}>{totalHead.display}</span>
                <span className="pp-detail-total-lbl">
                  Team {totalHead.label.toLowerCase()} · {totalHead.reps} {totalHead.repsLabel}
                </span>
              </div>

              {ordered.length === 0 ? (
                <div className="pp-empty">No reps were recorded in this session.</div>
              ) : (
                <DetailTable
                  drillType={session.drill_type}
                  ordered={ordered}
                  headLabel={totalHead.label}
                />
              )}
            </>
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

  // Sessions grouped by day. `shownSessions` is already newest-first and a Map
  // preserves insertion order, so the groups come out newest-first for free —
  // no second sort, and no chance of the two orderings disagreeing.
  const sessionsByDay = useMemo(() => {
    const byDay = new Map();
    for (const s of shownSessions) {
      const key = s.session_date || '';
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(s);
    }
    return [...byDay.entries()];
  }, [shownSessions]);

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
    const leaveLive = () => { setLiveSetup(null); setSetupDrill(null); setView(VIEWS.DASH); };
    // A scrimmage is tracked with StatsPal's full stat set and a score, so it
    // gets its own tracker rather than the focused-drill one.
    if (liveSetup.drillType === 'scrimmage') {
      return (
        <PracticeScrimmage
          team={team}
          setup={liveSetup}
          currentUser={currentUser}
          onExit={leaveLive}
          onSaved={handleSaved}
        />
      );
    }
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
          {setupDrill === 'scrimmage' ? (
            <ScrimmageSetup
              roster={roster}
              onCancel={() => { setSetupDrill(null); setView(VIEWS.DASH); }}
              onStart={startDrill}
            />
          ) : (
            <PracticeSetup
              drillType={setupDrill}
              roster={roster}
              onCancel={() => { setSetupDrill(null); setView(VIEWS.DASH); }}
              onStart={startDrill}
            />
          )}
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
              <div className="pp-days">
                {sessionsByDay.map(([date, daySessions]) => (
                  <div key={date} className="pp-day">
                    <div className="pp-day-hd">
                      <span className="pp-day-date">{fmtDateLong(date)}</span>
                      <span className="pp-day-count">{daySessions.length}</span>
                    </div>
                    <div className="pp-day-chips">
                      {daySessions.map(s => {
                        const rows = rowsBySession[s.id] || [];
                        const head = drillHeadline(s.drill_type, sumPracticeRows(rows));
                        const label = sessionDrillLabel(s);
                        const hasLabel = !!s.name && s.name !== label;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            className={`pp-schip pp-schip-${s.drill_type}${s.id === openSessionId ? ' pp-schip-open' : ''}`}
                            onClick={() => setOpenSessionId(s.id)}
                            title={hasLabel
                              ? `${s.name} — ${rows.length} player${rows.length !== 1 ? 's' : ''}, ${head.reps} ${head.repsLabel}`
                              : `${label} — ${rows.length} player${rows.length !== 1 ? 's' : ''}, ${head.reps} ${head.repsLabel}`}
                          >
                            <span className="pp-schip-name">{hasLabel ? s.name : label}</span>
                            <span className="pp-schip-val" style={{ color: head.color }}>
                              {head.display}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
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
