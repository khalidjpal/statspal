import { supabase } from '../supabase';
import { hpct, n3, hcol, passAvg, pfmt, pcol } from './stats';

// ═══════════════════════════════════════════════════════════════════════════
// PracticePal — drill definitions, derived stats and persistence.
//
// EVERY Supabase call in this file targets one of the two tables named here.
// PracticePal never writes to player_game_stats, completed_games, schedule or
// any tournament table — practice reps are not match statistics and the two
// data sets stay physically separate. The comparison view reads game stats
// through DataContext, which is read-only.
// ═══════════════════════════════════════════════════════════════════════════
const SESSIONS_TABLE = 'practice_sessions';
const STATS_TABLE = 'practice_stats';

// ─── Drills ────────────────────────────────────────────────────────────────
// Each action lists the counters one press increments. A press is a single
// object mutation on the client and a single integer bump in the row, which is
// what makes undo a straight subtraction of the same map.
//
// `tone` drives the button colour and reuses LiveGame's vocabulary:
//   r3/r2/r1/r0 — the graded-receive violet ramp with amber for an ace against
//   ok / err    — green for a good outcome, red for an error
//   neutral     — a countable that is neither good nor bad on its own
export const DRILLS = {
  serve_receive: {
    key: 'serve_receive',
    label: 'Serve-Receive',
    short: 'Passing',
    blurb: 'Grade every receive 0–3, same scale as StatsPal',
    // Ascending 1·2·3 then 0, matching LiveGame's RECEIVE control exactly so
    // the muscle memory carries over from game tracking.
    actions: [
      { key: 'pass_1', abbr: '1', label: 'Poor',    tone: 'r1', hist: 'Pass 1 (Poor)',    fields: { pass_1: 1, receives: 1 } },
      { key: 'pass_2', abbr: '2', label: 'Good',    tone: 'r2', hist: 'Pass 2 (Good)',    fields: { pass_2: 1, receives: 1 } },
      { key: 'pass_3', abbr: '3', label: 'Perfect', tone: 'r3', hist: 'Pass 3 (Perfect)', fields: { pass_3: 1, receives: 1 } },
      { key: 'pass_0', abbr: '0', label: 'Aced',    tone: 'r0', hist: 'Pass 0 (Aced)',    fields: { pass_0: 1, receives: 1 } },
    ],
  },
  hitting: {
    key: 'hitting',
    label: 'Hitting',
    short: 'Hitting %',
    blurb: 'Kills, errors and attempts for hitting percentage',
    // Kill and error each carry their own attempt, so attempts is never lower
    // than kills + errors and the percentage cannot go out of range. "Attempt"
    // is the third outcome — a swing that was neither.
    actions: [
      { key: 'kill',    abbr: 'K',   label: 'Kill',    tone: 'ok',      hist: 'Kill',           fields: { kills: 1, attempts: 1 } },
      { key: 'hiterr',  abbr: 'E',   label: 'Error',   tone: 'err',     hist: 'Hitting error',  fields: { errors: 1, attempts: 1 } },
      { key: 'attempt', abbr: 'Att', label: 'Attempt', tone: 'neutral', hist: 'Attempt',        fields: { attempts: 1 } },
    ],
  },
  serving: {
    key: 'serving',
    label: 'Serving',
    short: 'Serving',
    blurb: 'Aces, serves in and errors for in / ace / error rates',
    // An ace is in, so it bumps serves_in as well. serves_in + serve_errors
    // therefore always equals serve_attempts.
    actions: [
      { key: 'ace',       abbr: 'SA', label: 'Ace',   tone: 'ok',      hist: 'Ace',          fields: { aces: 1, serves_in: 1, serve_attempts: 1 } },
      { key: 'serve_in',  abbr: 'In', label: 'In',    tone: 'neutral', hist: 'Serve in',     fields: { serves_in: 1, serve_attempts: 1 } },
      { key: 'serve_err', abbr: 'SE', label: 'Error', tone: 'err',     hist: 'Serve error',  fields: { serve_errors: 1, serve_attempts: 1 } },
    ],
  },
  custom: {
    key: 'custom',
    label: 'Custom Drill',
    short: 'Custom',
    blurb: 'Name your own drill and tally made / missed',
    actions: [
      { key: 'made', abbr: 'MADE', label: 'Success', tone: 'ok',  hist: 'Made',   fields: { made: 1 } },
      { key: 'miss', abbr: 'MISS', label: 'Missed',  tone: 'err', hist: 'Missed', fields: { missed: 1 } },
    ],
  },
  // A scrimmage is an intrasquad practice match: both sides are this team's
  // own roster, every StatsPal stat is tracked, and a score is kept. It has no
  // `actions` of its own because it uses StatsPal's full CATEGORIES button set
  // (src/utils/statActions.js) rather than a short drill-specific list.
  scrimmage: {
    key: 'scrimmage',
    label: 'Scrimmage',
    short: 'Scrimmage',
    blurb: 'Intrasquad match — full stat set, Team A vs Team B',
    actions: [],
  },
};

export const DRILL_ORDER = ['serve_receive', 'hitting', 'serving', 'custom', 'scrimmage'];

// The two sides of a scrimmage. Stored on practice_stats.side; null everywhere
// else, because no other drill has sides.
export const SIDES = [
  { key: 'team_a', label: 'Team A' },
  { key: 'team_b', label: 'Team B' },
];

export function sideLabel(side) {
  return SIDES.find(s => s.key === side)?.label || '';
}

export function drillOf(type) {
  return DRILLS[type] || DRILLS.serve_receive;
}

// Label a session the way a coach reads it: a custom drill shows its own name.
export function sessionDrillLabel(session) {
  if (!session) return '';
  if (session.drill_type === 'custom') return session.custom_label || 'Custom Drill';
  return drillOf(session.drill_type).label;
}

// ─── Row shape ─────────────────────────────────────────────────────────────
// Every counter in practice_stats. Used to build empty rows, to strip anything
// that isn't a stat before an insert, and to sum rows across sessions.
// The last seven arrived with the scrimmage drill, which tracks StatsPal's
// full stat set. They stay at 0 for the focused drills.
export const PRACTICE_FIELDS = [
  'receives', 'pass_3', 'pass_2', 'pass_1', 'pass_0',
  'kills', 'errors', 'attempts',
  'aces', 'serve_errors', 'serves_in', 'serve_attempts',
  'made', 'missed',
  'digs', 'assists', 'blocks', 'block_assists',
  'blocking_errors', 'digging_errors', 'ball_handling_errors',
];

export function emptyPracticeRow() {
  const o = {};
  for (const f of PRACTICE_FIELDS) o[f] = 0;
  return o;
}

// Keep only real stat fields, coerced to non-negative integers. Mirrors
// cleanStatRow() in utils/stats.js — it stops a DB row's id / created_at /
// player_id leaking back into an insert payload.
export function cleanPracticeRow(raw) {
  const out = {};
  for (const f of PRACTICE_FIELDS) out[f] = Math.max(0, parseInt(raw?.[f], 10) || 0);
  return out;
}

// True when a row holds anything worth writing. A player who was picked for the
// drill but never got a rep is skipped rather than saved as an all-zero row.
export function hasPracticeStats(row) {
  return PRACTICE_FIELDS.some(f => (parseInt(row?.[f], 10) || 0) > 0);
}

// Sum a set of rows into one. Rate stats are always derived from the SUMMED
// counters, never averaged from per-session rates, so a trend across sessions
// is correctly weighted by how many reps each session actually held.
export function sumPracticeRows(rows) {
  const t = emptyPracticeRow();
  for (const r of rows || []) {
    for (const f of PRACTICE_FIELDS) t[f] += parseInt(r?.[f], 10) || 0;
  }
  return t;
}

// ─── Derived stats ─────────────────────────────────────────────────────────
// Passing average and hitting % are deliberately NOT reimplemented here —
// passAvg() and hpct() from utils/stats.js run on a practice row unchanged,
// because practice_stats reuses those column names. One implementation for
// both data sets is what makes the practice-vs-game comparison meaningful.

// Share of serves that landed in (aces included).
export function serveInPct(s) {
  const a = s?.serve_attempts || 0;
  return a > 0 ? (s.serves_in || 0) / a : null;
}

export function acePct(s) {
  const a = s?.serve_attempts || 0;
  return a > 0 ? (s.aces || 0) / a : null;
}

export function serveErrPct(s) {
  const a = s?.serve_attempts || 0;
  return a > 0 ? (s.serve_errors || 0) / a : null;
}

// Made / (made + missed) for a custom drill.
export function successPct(s) {
  const total = (s?.made || 0) + (s?.missed || 0);
  return total > 0 ? (s.made || 0) / total : null;
}

// Percentage as "72%" / "—".
export function pctFmt(v) {
  return v == null ? '—' : `${Math.round(v * 100)}%`;
}

// Colour ramp for a 0–1 rate where higher is better.
export function rateCol(v) {
  if (v == null) return '#484f58';
  if (v < 0.5) return '#f85149';
  if (v < 0.65) return '#e3883a';
  if (v < 0.8) return '#3fb950';
  return '#2ea043';
}

// The one headline number for a drill, in the shape every view renders:
//   { value, display, color, label, reps, repsLabel }
// `value` is the raw comparable number (null when there are no reps) so charts
// can plot it; `display` is what a human reads.
export function drillHeadline(drillType, s) {
  switch (drillType) {
    case 'hitting': {
      const v = hpct(s.kills, s.errors, s.attempts);
      return {
        value: v,
        display: s.attempts > 0 ? n3(v) : '—',
        color: s.attempts > 0 ? hcol(s.kills, s.errors, s.attempts) : '#484f58',
        label: 'Hitting %',
        reps: s.attempts || 0,
        repsLabel: 'attempts',
        // A hitting % runs -1…+1; charts need that domain, not 0…1.
        domain: [-0.3, 0.5],
      };
    }
    case 'serving': {
      const v = serveInPct(s);
      return {
        value: v,
        display: pctFmt(v),
        color: rateCol(v),
        label: 'Serve In %',
        reps: s.serve_attempts || 0,
        repsLabel: 'serves',
        domain: [0, 1],
      };
    }
    case 'custom': {
      const v = successPct(s);
      return {
        value: v,
        display: pctFmt(v),
        color: rateCol(v),
        label: 'Success %',
        reps: (s.made || 0) + (s.missed || 0),
        repsLabel: 'reps',
        domain: [0, 1],
      };
    }
    // A scrimmage carries every stat, so its single headline is the one that
    // best summarises a match — the same hitting % a game is judged on, on the
    // same bands.
    case 'scrimmage': {
      const v = hpct(s.kills, s.errors, s.attempts);
      return {
        value: v,
        display: s.attempts > 0 ? n3(v) : '—',
        color: s.attempts > 0 ? hcol(s.kills, s.errors, s.attempts) : '#484f58',
        label: 'Hitting %',
        reps: s.attempts || 0,
        repsLabel: 'attempts',
        domain: [-0.3, 0.5],
      };
    }
    case 'serve_receive':
    default: {
      const v = passAvg(s);
      return {
        value: v,
        display: pfmt(v),
        color: pcol(v),
        label: 'Passing Avg',
        reps: s.receives || 0,
        repsLabel: 'receives',
        domain: [0, 3],
      };
    }
  }
}

// The secondary breakdown line for a drill — the counters behind the headline.
export function drillBreakdown(drillType, s) {
  switch (drillType) {
    case 'hitting':
      return [['K', s.kills || 0], ['E', s.errors || 0], ['TA', s.attempts || 0]];
    case 'serving':
      return [
        ['SA', s.aces || 0],
        ['In', s.serves_in || 0],
        ['SE', s.serve_errors || 0],
        ['Att', s.serve_attempts || 0],
      ];
    case 'custom':
      return [['Made', s.made || 0], ['Miss', s.missed || 0]];
    // The box-score line for a scrimmage, in the order StatsPal's own stats
    // table uses so the two read the same way.
    case 'scrimmage':
      return [
        ['K', s.kills || 0],
        ['E', s.errors || 0],
        ['TA', s.attempts || 0],
        ['A', s.assists || 0],
        ['SA', s.aces || 0],
        ['D', s.digs || 0],
        ['BS', s.blocks || 0],
        ['Rec', s.receives || 0],
      ];
    case 'serve_receive':
    default:
      return [
        ['3', s.pass_3 || 0],
        ['2', s.pass_2 || 0],
        ['1', s.pass_1 || 0],
        ['0', s.pass_0 || 0],
        ['Rec', s.receives || 0],
      ];
  }
}

// ─── Persistence ───────────────────────────────────────────────────────────
// A missing table means the migration has not been run. Detect it precisely so
// the UI can say so rather than showing a blank screen.
export function isMissingTableError(error) {
  if (!error) return false;
  const msg = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`;
  return error.code === '42P01'
    || msg.includes('practice_sessions')
    || msg.includes('practice_stats')
    || msg.includes('schema cache');
}

export async function fetchPracticeSessions(teamId) {
  if (!teamId) return { data: [], error: null };
  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .select('*')
    .eq('team_id', teamId)
    .order('session_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) console.error('[practice] sessions fetch failed:', error.message,
    '(run scripts/practicepal_migration.sql)');
  return { data: data || [], error };
}

// All stat rows for a team's sessions, fetched in one round trip.
export async function fetchPracticeStats(sessionIds) {
  if (!sessionIds || sessionIds.length === 0) return { data: [], error: null };
  const { data, error } = await supabase
    .from(STATS_TABLE)
    .select('*')
    .in('practice_session_id', sessionIds);
  if (error) console.error('[practice] stats fetch failed:', error.message);
  return { data: data || [], error };
}

export async function createPracticeSession({
  teamId, drillType, name, customLabel, sessionDate, createdBy, scoreA, scoreB, setScores,
}) {
  const isScrimmage = drillType === 'scrimmage';
  const payload = {
    team_id: teamId,
    drill_type: drillType,
    name: name?.trim() || null,
    custom_label: drillType === 'custom' ? (customLabel?.trim() || 'Custom Drill') : null,
    session_date: sessionDate || new Date().toISOString().slice(0, 10),
    created_by: createdBy || null,
    // Only a scrimmage has a score; every other drill leaves these null rather
    // than storing a meaningless 0–0. With sets in play these hold SETS WON —
    // the points for each set are in set_scores.
    score_a: isScrimmage ? (scoreA ?? 0) : null,
    score_b: isScrimmage ? (scoreB ?? 0) : null,
    set_scores: isScrimmage ? (setScores || []) : [],
  };
  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .insert(payload)
    .select()
    .single();
  if (error) console.error('[practice] session insert failed:', error.message);
  return { data, error };
}

// Write one row per player who actually recorded something.
//
// Upsert on (practice_session_id, player_id) — the unique index the migration
// creates — so saving the same session twice corrects the existing rows rather
// than duplicating them. That matters because the live screen saves on demand
// and a coach may well hit Save twice.
//
// `opts.sides` maps playerId -> 'team_a' | 'team_b' for a scrimmage; it is the
// only thing written outside the counter set, and cleanPracticeRow still
// strips everything else.
//
// `opts.keepEmpty` saves a picked player even when they recorded nothing. A
// scrimmage needs it: the two team sheets are reconstructed from these rows,
// so a benched player who never touched the ball must still be on record as
// having been on Team B. The focused drills leave it off, where an all-zero
// row would be noise.
export async function savePracticeStats(sessionId, statsByPlayer, opts = {}) {
  const { sides = null, keepEmpty = false, setNumber = 1 } = opts;
  return savePracticeSetStats(sessionId, { [setNumber]: statsByPlayer }, { sides, keepEmpty });
}

// The per-set save. `statsBySet` is { [setNumber]: { [playerId]: row } }, so a
// whole multi-set scrimmage goes up in ONE round trip rather than one per set.
export async function savePracticeSetStats(sessionId, statsBySet, opts = {}) {
  const { sides = null, keepEmpty = false } = opts;

  const rows = [];
  for (const [setNo, byPlayer] of Object.entries(statsBySet || {})) {
    for (const [playerId, raw] of Object.entries(byPlayer || {})) {
      const row = {
        practice_session_id: sessionId,
        player_id: playerId,
        set_number: Number(setNo) || 1,
        ...cleanPracticeRow(raw),
      };
      if (sides && sides[playerId]) row.side = sides[playerId];
      if (keepEmpty || hasPracticeStats(row)) rows.push(row);
    }
  }

  if (rows.length === 0) return { data: [], error: null, saved: 0 };

  const res = await upsertPracticeRows(rows);
  if (res.error) console.error('[practice] stats upsert failed:', res.error.message);
  return { data: res.data || [], error: res.error, saved: rows.length };
}

// Upsert on the three-column key the sets migration creates.
//
// If that migration has not been run yet, PostgREST rejects the whole write
// because there is no unique index matching the conflict target — which would
// silently lose a session's stats. So on that specific failure we merge each
// player's sets back into one row and retry on the old two-column key: the
// save succeeds and only the per-set split is lost. Same shape of fallback
// insertPlayerStats already uses for the graded-passing columns.
async function upsertPracticeRows(rows) {
  const res = await supabase
    .from(STATS_TABLE)
    .upsert(rows, { onConflict: 'practice_session_id,player_id,set_number' })
    .select();
  if (!res.error) return res;

  const msg = `${res.error.message || ''} ${res.error.details || ''} ${res.error.hint || ''}`;
  const looksLikeMissingKey = res.error.code === '42P10'
    || msg.includes('set_number')
    || /no unique|exclusion constraint|on conflict/i.test(msg);
  if (!looksLikeMissingKey) return res;

  console.warn('[practice] per-set key missing — merging sets and retrying on the old key. '
    + 'Run scripts/practicepal_sets_migration.sql to keep set-by-set detail.');

  const merged = {};
  for (const r of rows) {
    const cur = merged[r.player_id];
    if (!cur) {
      const copy = { ...r };
      delete copy.set_number;
      merged[r.player_id] = copy;
      continue;
    }
    for (const f of PRACTICE_FIELDS) cur[f] = (cur[f] || 0) + (r[f] || 0);
    if (r.side) cur.side = r.side;
  }
  return supabase
    .from(STATS_TABLE)
    .upsert(Object.values(merged), { onConflict: 'practice_session_id,player_id' })
    .select();
}

// Deleting a session cascades to its stat rows via the FK.
export async function deletePracticeSession(sessionId) {
  const { error } = await supabase.from(SESSIONS_TABLE).delete().eq('id', sessionId);
  if (error) console.error('[practice] session delete failed:', error.message);
  return { error };
}

// ─── Performance shading (presentation only) ───────────────────────────────
// A CONTINUOUS colour scale for the trend chart: the hue says good / ok / bad,
// and the shade says by how much. A 2.9 passing average is a deep rich green
// while a 2.1 is a pale one; a 1.0 is a deep red while a 1.45 has warmed
// almost to orange. This is a READING aid layered on top of the numbers — it
// changes nothing about how any stat is computed or stored.
//
// StatsPal's own pcol()/hcol() ramps stay untouched and keep colouring the
// game-facing views. This scale exists because a chart can carry magnitude in
// its shading, where a table cell cannot.

// Anchor colours. Every shade the chart draws is an interpolation between two
// neighbouring anchors, so the whole ramp reads as one family. Each is bright
// enough to hold up as a small mark on the near-black card background.
export const PERF_RAMP = {
  redDeep:   '#cf2b20',   // the worst end
  orange:    '#f0832f',   // top of the "needs work" zone
  yellow:    '#ecc44a',   // top of the "ok" zone
  greenLite: '#8fe3a0',   // just over the "good" line
  greenDeep: '#12a05a',   // the best end — darkest, most saturated
};

// `ok` and `good` are inclusive lower bounds and are where the hue changes.
// `floor` and `ceil` are where the SHADING saturates: at or below floor the
// red is as deep as it gets, at or above ceil the green is as rich as it gets.
// They are set to realistic extremes rather than the scale's ends, so the
// gradient spends its range on values a player actually posts.
export const PERF_BANDS = {
  // Fixed 0–3 passer scale. 2.00 is the usual "in system" bar; nobody averages
  // below 1.00 for a whole session without something being badly wrong.
  serve_receive: { good: 2.0,   ok: 1.5,   floor: 1.0,    ceil: 3.0,   fmt: pfmt,   scale: '0–3 passer scale' },
  // Standard volleyball reading of hitting %: .200 good, .100 acceptable.
  hitting:       { good: 0.200, ok: 0.100, floor: -0.100, ceil: 0.400, fmt: n3,     scale: '(K − E) ÷ TA' },
  // Serve-in rate: missing more than one serve in five is a problem.
  serving:       { good: 0.90,  ok: 0.80,  floor: 0.55,   ceil: 1.0,   fmt: pctFmt, scale: 'share of serves in' },
  // A generic made/missed drill: two thirds is solid, half is borderline.
  custom:        { good: 0.70,  ok: 0.50,  floor: 0.20,   ceil: 1.0,   fmt: pctFmt, scale: 'made ÷ reps' },
  // A scrimmage is judged on hitting %, so it shares hitting's bands exactly —
  // a .250 in a scrimmage should read the same green as a .250 in a match.
  scrimmage:     { good: 0.200, ok: 0.100, floor: -0.100, ceil: 0.400, fmt: n3,     scale: '(K − E) ÷ TA' },
};

export function perfBands(drillType) {
  return PERF_BANDS[drillType] || PERF_BANDS.serve_receive;
}

const clamp01 = t => (t < 0 ? 0 : t > 1 ? 1 : t);

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

// Straight sRGB interpolation. Every pair of anchors sits within one hue
// family (red→orange, orange→yellow, pale green→deep green), so there is no
// desaturated grey midpoint to design around.
function mixHex(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * clamp01(t)));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}

// The chart's colour for one value: hue by band, shade by how far into it.
export function perfShade(drillType, v) {
  if (v == null) return '#484f58';
  const b = perfBands(drillType);
  if (v >= b.good) {
    // Above the good line: pale green at the line, deepening all the way up.
    return mixHex(PERF_RAMP.greenLite, PERF_RAMP.greenDeep, (v - b.good) / (b.ceil - b.good));
  }
  if (v >= b.ok) {
    // The middle band warms from orange up to yellow.
    return mixHex(PERF_RAMP.orange, PERF_RAMP.yellow, (v - b.ok) / (b.good - b.ok));
  }
  // Below the ok line: deep red at the bottom, lightening toward orange as it
  // climbs back toward the middle band.
  return mixHex(PERF_RAMP.redDeep, PERF_RAMP.orange, (v - b.floor) / (b.ok - b.floor));
}

// Evenly sampled stops spanning floor → ceil, for the legend's gradient bar.
// Sampling perfShade() itself — rather than restating the anchors — keeps the
// legend honest: it cannot drift from what the chart actually draws.
export function perfRampStops(drillType, steps = 24) {
  const b = perfBands(drillType);
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    out.push({ pct: t * 100, color: perfShade(drillType, b.floor + t * (b.ceil - b.floor)) });
  }
  return out;
}

// Where the two band thresholds sit along that bar, as percentages, so the
// legend can mark them.
export function perfRampTicks(drillType) {
  const b = perfBands(drillType);
  const span = (b.ceil - b.floor) || 1;
  return [
    { key: 'ok',   pct: clamp01((b.ok - b.floor) / span) * 100,   label: b.fmt(b.ok) },
    { key: 'good', pct: clamp01((b.good - b.floor) / span) * 100, label: b.fmt(b.good) },
  ];
}

// Sets won by each side, derived from the per-set point scores. A tied set
// counts for neither — a scrimmage set can be stopped level.
export function setsWon(setScores) {
  let a = 0;
  let b = 0;
  for (const s of setScores || []) {
    const pa = s?.a ?? 0;
    const pb = s?.b ?? 0;
    if (pa > pb) a++;
    else if (pb > pa) b++;
  }
  return { a, b };
}

// "25–21 · 18–25" — the per-set line shown under a scrimmage's headline.
export function setScoreLine(setScores) {
  return (setScores || []).map(s => `${s?.a ?? 0}–${s?.b ?? 0}`).join(' · ');
}
