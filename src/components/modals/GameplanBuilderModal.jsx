import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  DndContext, DragOverlay, useDraggable, useDroppable,
  PointerSensor, KeyboardSensor, useSensors, useSensor,
} from '@dnd-kit/core';
import { supabase } from '../../supabase';
import { useToast } from '../../contexts/ToastContext';

// ─── Constants ──────────────────────────────────────────────────────────────
//
// Standard volleyball court (top-down, our side at the bottom):
//   Front row (near net): P4(left)  P3(mid)  P2(right)
//   Back row:             P5(left)  P6(mid)  P1(right)
const SLOTS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
const FRONT_SLOTS = new Set(['P2', 'P3', 'P4']);

// Default % position of each rotational slot.
const SLOT_POS = {
  P4: { x: 22, y: 28 }, P3: { x: 50, y: 24 }, P2: { x: 78, y: 28 },
  P5: { x: 22, y: 72 }, P6: { x: 50, y: 76 }, P1: { x: 78, y: 72 },
};

// Cyclic rotation order (P1 → P6 → P5 → P4 → P3 → P2 → P1).
const ROT_CYCLE = ['P1', 'P6', 'P5', 'P4', 'P3', 'P2'];

// Court-edge clamp for drag drops (% of the court box).
const COURT_BOUNDS = { minX: 7, maxX: 93, minY: 9, maxY: 91 };

// Half the bubble width/height in px — stays in sync with .gpb-bubble's CSS.
const BUBBLE_RADIUS = 44;
// Inner padding (matches .gpb-court::before { inset: 14px } + 2px guard).
const COURT_INNER_PAD = 16;
// Defensive % clamp applied at render time so any historically-stored
// out-of-bounds position (e.g. from before the bubble-size clamp landed)
// can't put a bubble off-screen. Slightly tighter than COURT_BOUNDS so the
// bubble's center sits clearly inside the inner rectangle on any screen.
const SAFE_BOUNDS = { minX: 9, maxX: 91, minY: 11, maxY: 89 };
function clampToSafe(p) {
  if (!p) return null;
  return {
    x: Math.max(SAFE_BOUNDS.minX, Math.min(SAFE_BOUNDS.maxX, p.x)),
    y: Math.max(SAFE_BOUNDS.minY, Math.min(SAFE_BOUNDS.maxY, p.y)),
  };
}

// ─── Pair-based colors ──
// Each pair of opposite slots (idx 0↔3, 1↔4, 2↔5) shares one palette entry.
// Liberos take the darker variant of the player they're paired with (set up
// via the sub-pair UI). Unpaired liberos default to gold.
const PAIR_PALETTE = [
  { bg: 'linear-gradient(135deg, #38bdf8 0%, #0369a1 100%)', glow: 'rgba(56,189,248,0.55)',  edge: 'rgba(186,230,253,0.55)', label: 'Pair 1' },
  { bg: 'linear-gradient(135deg, #34d399 0%, #047857 100%)', glow: 'rgba(52,211,153,0.55)',  edge: 'rgba(167,243,208,0.55)', label: 'Pair 2' },
  { bg: 'linear-gradient(135deg, #c084fc 0%, #7e22ce 100%)', glow: 'rgba(192,132,252,0.55)', edge: 'rgba(233,213,255,0.55)', label: 'Pair 3' },
];
const PAIR_PALETTE_DARK = [
  { bg: 'linear-gradient(135deg, #075985 0%, #082f49 100%)', glow: 'rgba(7,89,133,0.65)',   edge: 'rgba(56,189,248,0.45)' },
  { bg: 'linear-gradient(135deg, #064e3b 0%, #022c22 100%)', glow: 'rgba(6,78,59,0.65)',    edge: 'rgba(52,211,153,0.45)' },
  { bg: 'linear-gradient(135deg, #581c87 0%, #2e1065 100%)', glow: 'rgba(88,28,135,0.65)',  edge: 'rgba(192,132,252,0.45)' },
];
const LIBERO_DEFAULT = {
  bg: 'linear-gradient(135deg, #fbbf24 0%, #b45309 100%)',
  glow: 'rgba(251,191,36,0.65)',
  edge: 'rgba(254,240,138,0.65)',
};

function isLibero(player) {
  return (player?.position || '').toUpperCase() === 'L';
}

function getColorFor(player, arrayIdx, plan) {
  if (!player) return PAIR_PALETTE[0];
  if (isLibero(player)) {
    // Find sub pair, if any
    const subs = plan?.subs || [];
    const pair = subs.find(p => p.a === player.id || p.b === player.id);
    if (pair) {
      const otherPid = pair.a === player.id ? pair.b : pair.a;
      const otherIdx = (plan?.assigned_players || []).indexOf(otherPid);
      if (otherIdx >= 0) {
        return PAIR_PALETTE_DARK[otherIdx % 3];
      }
    }
    return LIBERO_DEFAULT;
  }
  if (arrayIdx < 0) return PAIR_PALETTE[0];
  return PAIR_PALETTE[arrayIdx % 3];
}

function colorVarsFor(player, arrayIdx, plan) {
  const c = getColorFor(player, arrayIdx, plan);
  return {
    '--bubble-bg':   c.bg,
    '--bubble-glow': c.glow,
    '--bubble-edge': c.edge,
  };
}

// ─── Geometry helpers ──
function lastNameOf(name) {
  const parts = (name || '').trim().split(/\s+/);
  return parts.length === 1 ? parts[0] : parts.slice(1).join(' ');
}
function fmtDate(s) {
  if (!s) return '';
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}
function slotInRotation(r1Slot, rotationN) {
  const idx = ROT_CYCLE.indexOf(r1Slot);
  if (idx === -1) return r1Slot;
  return ROT_CYCLE[(idx + rotationN - 1) % 6];
}
function defaultPositionFor(arrayIdx, rotationN) {
  const r1Slot = `P${arrayIdx + 1}`;
  return { ...SLOT_POS[slotInRotation(r1Slot, rotationN)] };
}
function slotToArrayIdx(slot, rotationN) {
  for (let idx = 0; idx < 6; idx++) {
    if (slotInRotation(`P${idx + 1}`, rotationN) === slot) return idx;
  }
  return -1;
}
function zoneFor(x, y) {
  const isFront = y < 50;
  if (x < 33) return isFront ? 'P4' : 'P5';
  if (x < 67) return isFront ? 'P3' : 'P6';
  return isFront ? 'P2' : 'P1';
}
function clampToCourt(x, y) {
  return {
    x: Math.max(COURT_BOUNDS.minX, Math.min(COURT_BOUNDS.maxX, x)),
    y: Math.max(COURT_BOUNDS.minY, Math.min(COURT_BOUNDS.maxY, y)),
  };
}

// FIVB overlap rules + libero rule. Returns { playerId, reason } violations.
function validateFormation(positions, assignedPlayers, rotationN, playerById) {
  if (!assignedPlayers?.length) return [];
  const slotToPid = {};
  assignedPlayers.forEach((pid, idx) => {
    if (!pid) return;
    slotToPid[slotInRotation(`P${idx + 1}`, rotationN)] = pid;
  });
  const posOf = (slot) => {
    const pid = slotToPid[slot];
    return pid ? (positions[pid] || null) : null;
  };
  const violations = [];
  const add = (pid, reason) => {
    if (pid && !violations.find(v => v.playerId === pid && v.reason === reason)) {
      violations.push({ playerId: pid, reason });
    }
  };
  for (const [front, back] of [['P4','P5'], ['P3','P6'], ['P2','P1']]) {
    const fp = posOf(front), bp = posOf(back);
    if (fp && bp && fp.y >= bp.y) {
      add(slotToPid[front], `${front} must stay closer to net than ${back}`);
      add(slotToPid[back],  `${back} must stay behind ${front}`);
    }
  }
  if (posOf('P4') && posOf('P3') && posOf('P4').x >= posOf('P3').x) {
    add(slotToPid['P4'], 'P4 must stay left of P3');
    add(slotToPid['P3'], 'P3 must stay right of P4');
  }
  if (posOf('P3') && posOf('P2') && posOf('P3').x >= posOf('P2').x) {
    add(slotToPid['P3'], 'P3 must stay left of P2');
    add(slotToPid['P2'], 'P2 must stay right of P3');
  }
  if (posOf('P5') && posOf('P6') && posOf('P5').x >= posOf('P6').x) {
    add(slotToPid['P5'], 'P5 must stay left of P6');
    add(slotToPid['P6'], 'P6 must stay right of P5');
  }
  if (posOf('P6') && posOf('P1') && posOf('P6').x >= posOf('P1').x) {
    add(slotToPid['P6'], 'P6 must stay left of P1');
    add(slotToPid['P1'], 'P1 must stay right of P6');
  }
  for (const slot of ['P2','P3','P4']) {
    const pid = slotToPid[slot];
    if (!pid) continue;
    const player = playerById[pid];
    if (player && isLibero(player)) {
      const last = lastNameOf(player.name) || 'Libero';
      add(pid, `${last} (Libero) must stay in back row`);
    }
  }
  return violations;
}

// ─── Snap-to-legal + overlap separation ──
//
// Given a player's dropped (x, y) % position, compute the closest position
// that:
//   1. satisfies the rotation overlap rules in the active formation
//      (P4 < P3 < P2 left-to-right, P5 < P6 < P1 left-to-right, P4 < P5,
//      P3 < P6, P2 < P1 closer-to-net), and
//   2. is at least BUBBLE_SEPARATION % from every other bubble.
//
// We do this by clamping x and y into the valid axis-aligned interval
// derived from the *other* bubbles, then iteratively pushing the dropped
// point away from any bubble it's still within the separation radius of.
// A few iterations is enough to settle.

const BUBBLE_SEPARATION = 11; // % min distance between bubble centers

// Kept for the bench-drop path / future post-drag snap if it's ever
// re-enabled; the bubble drag itself enforces no-overlap inline now.
// eslint-disable-next-line no-unused-vars
function snapToLegalAndSeparate(playerId, droppedPos, plan, rotation, mode, playerById) {
  if (!plan || !droppedPos) return clampToSafe(droppedPos || { x: 50, y: 50 });
  const assigned = plan.assigned_players || [];
  const idx = assigned.indexOf(playerId);
  if (idx < 0) return clampToSafe(droppedPos);

  const slot = slotInRotation(`P${idx + 1}`, rotation);
  const positions = plan.formations?.[rotation]?.[mode] || {};

  // Map of OTHER players' current rotation slots → positions.
  const otherBySlot = {};
  const others = [];
  assigned.forEach((pid, i) => {
    if (!pid || pid === playerId) return;
    const oSlot = slotInRotation(`P${i + 1}`, rotation);
    const p = positions[pid] || defaultPositionFor(i, rotation);
    otherBySlot[oSlot] = p;
    others.push(p);
  });

  // Derive the axis-aligned legal box for this slot from the others'
  // current positions. Small epsilon keeps strict inequalities.
  const E = 0.6;
  let minX = SAFE_BOUNDS.minX, maxX = SAFE_BOUNDS.maxX;
  let minY = SAFE_BOUNDS.minY, maxY = SAFE_BOUNDS.maxY;
  const X_LEFT_OF  = { P3: 'P4', P2: 'P3', P6: 'P5', P1: 'P6' };  // slot -> who must be left of me
  const X_RIGHT_OF = { P4: 'P3', P3: 'P2', P5: 'P6', P6: 'P1' };  // slot -> who must be right of me
  const Y_FRONT_OF = { P5: 'P4', P6: 'P3', P1: 'P2' };            // slot -> who must be in front of me
  const Y_BACK_OF  = { P4: 'P5', P3: 'P6', P2: 'P1' };            // slot -> who must be behind me
  if (X_LEFT_OF[slot]  && otherBySlot[X_LEFT_OF[slot]])  minX = Math.max(minX, otherBySlot[X_LEFT_OF[slot]].x  + E);
  if (X_RIGHT_OF[slot] && otherBySlot[X_RIGHT_OF[slot]]) maxX = Math.min(maxX, otherBySlot[X_RIGHT_OF[slot]].x - E);
  if (Y_FRONT_OF[slot] && otherBySlot[Y_FRONT_OF[slot]]) minY = Math.max(minY, otherBySlot[Y_FRONT_OF[slot]].y + E);
  if (Y_BACK_OF[slot]  && otherBySlot[Y_BACK_OF[slot]])  maxY = Math.min(maxY, otherBySlot[Y_BACK_OF[slot]].y  - E);

  // Libero may not enter the front row.
  const player = playerById[playerId];
  if (player && isLibero(player)) {
    if (FRONT_SLOTS.has(slot)) {
      // Slot itself isn't valid for a libero; bail to the safe-clamped point.
      return clampToSafe(droppedPos);
    }
  }

  // Degenerate ranges (would mean the *others'* configuration is itself
  // invalid). Collapse to a single point so we still produce something.
  if (minX > maxX) { const m = (minX + maxX) / 2; minX = maxX = m; }
  if (minY > maxY) { const m = (minY + maxY) / 2; minY = maxY = m; }

  let x = Math.max(minX, Math.min(maxX, droppedPos.x));
  let y = Math.max(minY, Math.min(maxY, droppedPos.y));

  // Push away from any other bubble we're still too close to. Re-clamp into
  // the legal box after each push so we never escape the overlap rules.
  for (let iter = 0; iter < 12; iter++) {
    let ok = true;
    for (const o of others) {
      const dx = x - o.x;
      const dy = y - o.y;
      const dist = Math.hypot(dx, dy);
      if (dist < BUBBLE_SEPARATION) {
        ok = false;
        const push = (BUBBLE_SEPARATION - dist) + 0.4;
        const angle = dist > 0.001 ? Math.atan2(dy, dx) : Math.random() * 2 * Math.PI;
        x += Math.cos(angle) * push;
        y += Math.sin(angle) * push;
        x = Math.max(minX, Math.min(maxX, x));
        y = Math.max(minY, Math.min(maxY, y));
      }
    }
    if (ok) break;
  }

  return { x, y };
}

// ─── Sub pairing helpers ──
//
// `subs` is an array of { a: pid, b: pid }. Order doesn't matter — the libero
// (if any) is the "sub" that comes IN when their partner rotates to back row.
// `confirmed_subs` is a map of rotation → list of pair indices that are
// confirmed-as-subbed-in for that rotation (badge on the rotation tab).

function findPairForPlayer(plan, pid) {
  const subs = plan?.subs || [];
  return subs.find(p => p.a === pid || p.b === pid) || null;
}
function pairOpponent(pair, pid) {
  return pair.a === pid ? pair.b : pair.a;
}
// "Starter" of a pair = the non-libero member. If both are non-libero, returns
// pair.a as the conventional starter.
function pairStarter(pair, playerById) {
  const pa = playerById[pair.a];
  const pb = playerById[pair.b];
  if (isLibero(pa) && !isLibero(pb)) return pair.b;
  if (isLibero(pb) && !isLibero(pa)) return pair.a;
  return pair.a;
}
function pairSub(pair, playerById) {
  const starter = pairStarter(pair, playerById);
  return pairOpponent(pair, starter);
}

// Detect pending subs when we move from rotation `from` to rotation `to`.
// Returns array of { pairIdx, pair, starter, sub, fromSlot, toSlot, action }
// where action is 'sub-in' (libero comes on) or 'sub-out' (starter comes back).
function detectPendingSubs(plan, fromRot, toRot, playerById) {
  if (!plan || fromRot === toRot) return [];
  const subs = plan.subs || [];
  const assigned = plan.assigned_players || [];
  const pending = [];
  subs.forEach((pair, pairIdx) => {
    const starterPid = pairStarter(pair, playerById);
    const subPid = pairSub(pair, playerById);
    const idx = assigned.indexOf(starterPid);
    if (idx < 0) return;
    const fromSlot = slotInRotation(`P${idx + 1}`, fromRot);
    const toSlot = slotInRotation(`P${idx + 1}`, toRot);
    const wasFront = FRONT_SLOTS.has(fromSlot);
    const willFront = FRONT_SLOTS.has(toSlot);
    if (wasFront && !willFront) {
      // Starter moves to back row → libero subs in.
      pending.push({ pairIdx, pair, starter: starterPid, sub: subPid, fromSlot, toSlot, action: 'sub-in' });
    } else if (!wasFront && willFront) {
      // Starter moves to front row → libero comes off, starter back in.
      pending.push({ pairIdx, pair, starter: starterPid, sub: subPid, fromSlot, toSlot, action: 'sub-out' });
    }
  });
  return pending;
}

// ─── Persistence ────────────────────────────────────────────────────────────
const LS_KEY = 'volleyballpal-gameplans-v1';
function loadLocal(scheduleGameId) {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return (JSON.parse(raw)[scheduleGameId] || []).slice();
  } catch { return []; }
}
function saveLocal(scheduleGameId, plans) {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[scheduleGameId] = plans;
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch { /* unavailable */ }
}
async function fetchPlans(scheduleGameId) {
  const { data, error } = await supabase
    .from('game_plans')
    .select('*')
    .eq('schedule_game_id', scheduleGameId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return { data: loadLocal(scheduleGameId), error, fallback: true };
  return { data: data || [], error: null, fallback: false };
}
async function upsertPlan(plan, useFallback) {
  if (useFallback) {
    const list = loadLocal(plan.schedule_game_id);
    const idx = list.findIndex(p => p.id === plan.id);
    if (idx >= 0) list[idx] = plan; else list.push(plan);
    saveLocal(plan.schedule_game_id, list);
    return { data: plan, error: null };
  }
  const { data, error } = await supabase
    .from('game_plans')
    .upsert(plan, { onConflict: 'id' })
    .select()
    .single();
  return { data, error };
}
async function deletePlanRemote(planId, scheduleGameId, useFallback) {
  if (useFallback) {
    const list = loadLocal(scheduleGameId).filter(p => p.id !== planId);
    saveLocal(scheduleGameId, list);
    return { error: null };
  }
  const { error } = await supabase.from('game_plans').delete().eq('id', planId);
  return { error };
}
function cryptoRandomId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'gp-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
function makeNewPlan(teamId, scheduleGameId, name, position) {
  return {
    id: cryptoRandomId(),
    team_id: teamId,
    schedule_game_id: scheduleGameId,
    name,
    lineup: {}, positions: {},
    assigned_players: [null, null, null, null, null, null],
    formations: {
      1: { serve: {}, receive: {} }, 2: { serve: {}, receive: {} },
      3: { serve: {}, receive: {} }, 4: { serve: {}, receive: {} },
      5: { serve: {}, receive: {} }, 6: { serve: {}, receive: {} },
    },
    colors: {},
    subs: [],
    confirmed_subs: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] },
    rotation_index: 1,
    position,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
function normalizePlan(p) {
  const plan = { ...p };
  if (!plan.formations || typeof plan.formations !== 'object') plan.formations = {};
  for (let r = 1; r <= 6; r++) {
    if (!plan.formations[r] || typeof plan.formations[r] !== 'object') plan.formations[r] = {};
    if (!plan.formations[r].serve)   plan.formations[r].serve   = {};
    if (!plan.formations[r].receive) plan.formations[r].receive = {};
  }
  if (!Array.isArray(plan.assigned_players)) {
    if (plan.lineup && typeof plan.lineup === 'object') {
      plan.assigned_players = SLOTS.map(s => plan.lineup[s] || null);
    } else {
      plan.assigned_players = [null, null, null, null, null, null];
    }
  }
  while (plan.assigned_players.length < 6) plan.assigned_players.push(null);
  if (plan.assigned_players.length > 6) plan.assigned_players = plan.assigned_players.slice(0, 6);
  if (!plan.colors || typeof plan.colors !== 'object') plan.colors = {};
  if (!Array.isArray(plan.subs)) plan.subs = [];
  if (!plan.confirmed_subs || typeof plan.confirmed_subs !== 'object') {
    plan.confirmed_subs = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  } else {
    for (let r = 1; r <= 6; r++) {
      if (!Array.isArray(plan.confirmed_subs[r])) plan.confirmed_subs[r] = [];
    }
  }
  return plan;
}

// ─── Main component ─────────────────────────────────────────────────────────
export default function GameplanBuilderModal({ team, game, players, onClose }) {
  const { addToast } = useToast();
  const [plans, setPlans] = useState([]);
  const [activePlanId, setActivePlanId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [usingFallback, setUsingFallback] = useState(false);
  const fallbackWarnedRef = useRef(false);

  const [activeRotation, setActiveRotation] = useState(1);
  const [activeMode, setActiveMode] = useState('serve');

  // Click-to-place: roster row is "armed".
  const [selectedRosterId, setSelectedRosterId] = useState(null);

  // Sub-pair UI:
  //  - `pairingMode` true → the roster is in "select two players to link"
  //    mode (toggled by the dedicated Pair Subs button above the roster).
  //  - `pairingSourceId` is the first player picked while in pairing mode;
  //    the next click in the roster locks in the pair.
  const [pairingMode, setPairingMode] = useState(false);
  const [pairingSourceId, setPairingSourceId] = useState(null);

  // Sub popup: { fromRot, toRot, pendingList: [...] }
  const [subPopup, setSubPopup] = useState(null);

  // Transient warning banner — the persistent red ring on offending
  // bubbles is driven by `violationByPid`, which is recomputed every
  // render from committed positions.
  const [warning, setWarning] = useState(null);

  // Bench drag state (court bubble drag is hand-rolled inside CourtBubble).
  const [benchDrag, setBenchDrag] = useState(null);
  const [benchDropPos, setBenchDropPos] = useState(null);

  const courtRef = useRef(null);

  // Court size in pixels. Bubbles render at translate3d(px, py, 0) where
  // px/py = (position% × courtSize), so we need the court rect in JS.
  // useLayoutEffect runs after DOM commit but before paint, so the first
  // paint already shows bubbles at the correct pixel position (no flash).
  const [courtSize, setCourtSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    if (loading) return;
    const el = courtRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setCourtSize(prev =>
        prev.width === r.width && prev.height === r.height
          ? prev
          : { width: r.width, height: r.height },
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);

  // ── Roster ──
  const roster = useMemo(() => {
    return (players || [])
      .filter(p => p.team_id === team?.id)
      .slice()
      .sort((a, b) => {
        const an = parseInt(a.jersey_number, 10), bn = parseInt(b.jersey_number, 10);
        if (Number.isNaN(an) && Number.isNaN(bn)) return (a.name || '').localeCompare(b.name || '');
        if (Number.isNaN(an)) return 1;
        if (Number.isNaN(bn)) return -1;
        return an - bn;
      });
  }, [players, team?.id]);
  const playerById = useMemo(() => {
    const m = {};
    for (const p of roster) m[p.id] = p;
    return m;
  }, [roster]);

  // ── Load plans ──
  useEffect(() => {
    if (!game?.id) return;
    let cancelled = false;
    setLoading(true);
    fetchPlans(game.id).then(({ data, error, fallback }) => {
      if (cancelled) return;
      if (error && !fallbackWarnedRef.current) {
        fallbackWarnedRef.current = true;
        const code = error.code || '';
        if (/(PGRST205|42P01)/.test(code) || /relation .* does not exist/i.test(error.message || '') || /column .* does not exist/i.test(error.message || '')) {
          addToast('Gameplan table needs migration — saving locally. Run scripts/game_plans_migration.sql.', 'error');
        } else {
          addToast('Gameplan storage offline — saving locally', 'error');
        }
      }
      setUsingFallback(!!fallback);
      const normalized = data.map(normalizePlan);
      if (normalized.length === 0) {
        const seed = makeNewPlan(team.id, game.id, 'Plan A', 0);
        setPlans([seed]);
        setActivePlanId(seed.id);
        upsertPlan(seed, !!fallback);
      } else {
        setPlans(normalized);
        setActivePlanId(normalized[0].id);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.id]);

  const activePlan = plans.find(p => p.id === activePlanId) || null;

  // ── Debounced autosave ──
  const saveTimerRef = useRef(null);
  const queuedSaveRef = useRef(null);
  const scheduleSave = useCallback((plan) => {
    queuedSaveRef.current = plan;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const p = queuedSaveRef.current;
      queuedSaveRef.current = null;
      if (!p) return;
      const { error } = await upsertPlan(p, usingFallback);
      if (error && !usingFallback) { setUsingFallback(true); await upsertPlan(p, true); }
    }, 250);
  }, [usingFallback]);
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const p = queuedSaveRef.current;
      if (p) upsertPlan(p, usingFallback);
    };
  }, [usingFallback]);

  const patchActivePlan = useCallback((patch) => {
    if (!activePlan) return;
    const next = { ...activePlan, ...patch, updated_at: new Date().toISOString() };
    setPlans(curr => curr.map(p => p.id === next.id ? next : p));
    scheduleSave(next);
  }, [activePlan, scheduleSave]);

  // ── Transient warning banner ──
  // (`playerId` is accepted for call-site compatibility but no longer
  // produces a per-bubble red flash — the live drag pipeline owns
  // bubble-level visual feedback now.)
  const flashWarning = useCallback((message /* , playerId */) => {
    setWarning(message);
    setTimeout(() => setWarning(curr => curr === message ? null : curr), 2000);
  }, []);

  // ── Derived: positions of bubbles in the current view ──
  // Defensive clamp guarantees every rendered bubble is visible inside the
  // court — even if a historical stored position is out of bounds.
  const currentPositions = useMemo(() => {
    if (!activePlan) return {};
    const stored = activePlan.formations?.[activeRotation]?.[activeMode] || {};
    const out = {};
    (activePlan.assigned_players || []).forEach((pid, idx) => {
      if (!pid) return;
      const raw = stored[pid] || defaultPositionFor(idx, activeRotation);
      out[pid] = clampToSafe(raw);
    });
    return out;
  }, [activePlan, activeRotation, activeMode]);

  // ── Validation against the *committed* positions only (not mid-drag) ──
  const violations = useMemo(() => {
    if (!activePlan) return [];
    return validateFormation(currentPositions, activePlan.assigned_players || [], activeRotation, playerById);
  }, [activePlan, currentPositions, activeRotation, playerById]);
  const violationByPid = useMemo(() => {
    const m = {};
    for (const v of violations) if (!m[v.playerId]) m[v.playerId] = v.reason;
    return m;
  }, [violations]);

  // ── Plan tab ops ──
  function addPlan() {
    const used = new Set(plans.map(p => p.name));
    let name = '';
    for (let i = 0; i < 26; i++) {
      const c = `Plan ${String.fromCharCode(65 + i)}`;
      if (!used.has(c)) { name = c; break; }
    }
    if (!name) name = `Plan ${plans.length + 1}`;
    const np = makeNewPlan(team.id, game.id, name, plans.length);
    setPlans([...plans, np]);
    setActivePlanId(np.id);
    upsertPlan(np, usingFallback);
  }
  async function removePlan(id) {
    if (plans.length === 1) {
      addToast('Keep at least one plan. Rename instead of deleting.', 'error');
      return;
    }
    if (!confirm('Delete this plan?')) return;
    const next = plans.filter(p => p.id !== id);
    setPlans(next);
    if (activePlanId === id) setActivePlanId(next[0]?.id || null);
    await deletePlanRemote(id, game.id, usingFallback);
  }
  function startRename(plan) { setRenamingId(plan.id); setRenameDraft(plan.name); }
  function commitRename() {
    if (!renamingId) return;
    const trimmed = renameDraft.trim();
    if (trimmed && plans.some(p => p.id === renamingId)) {
      const next = plans.map(p => p.id === renamingId
        ? { ...p, name: trimmed, updated_at: new Date().toISOString() }
        : p);
      setPlans(next);
      const target = next.find(p => p.id === renamingId);
      if (target) scheduleSave(target);
    }
    setRenamingId(null); setRenameDraft('');
  }

  // ── Slot replace / remove ──
  const replacePlayerAtIdx = useCallback((idx, newPlayer, customCurrentPos = null) => {
    if (!activePlan || !newPlayer || idx < 0 || idx >= 6) return false;
    const targetSlot = slotInRotation(`P${idx + 1}`, activeRotation);
    if (isLibero(newPlayer) && FRONT_SLOTS.has(targetSlot)) {
      flashWarning(
        `${lastNameOf(newPlayer.name) || 'Libero'} (Libero) cannot play front row`,
        newPlayer.id,
      );
      return false;
    }
    const oldAssigned = activePlan.assigned_players || [];
    const oldPid = oldAssigned[idx] || null;
    const newAssigned = [...oldAssigned];
    const existingIdx = newAssigned.indexOf(newPlayer.id);
    if (existingIdx >= 0 && existingIdx !== idx) newAssigned[existingIdx] = null;
    newAssigned[idx] = newPlayer.id;

    // Move positions across
    const formations = { ...(activePlan.formations || {}) };
    for (let r = 1; r <= 6; r++) {
      const rd = { ...(formations[r] || { serve: {}, receive: {} }) };
      for (const mode of ['serve', 'receive']) {
        const md = { ...(rd[mode] || {}) };
        const inheritedPos = oldPid ? md[oldPid] : null;
        if (oldPid) delete md[oldPid];
        if (customCurrentPos && r === activeRotation && mode === activeMode) {
          md[newPlayer.id] = { ...customCurrentPos };
        } else if (md[newPlayer.id]) {
          // already has a position from a previous slot — keep it
        } else {
          md[newPlayer.id] = inheritedPos
            ? { ...inheritedPos }
            : defaultPositionFor(idx, r);
        }
        rd[mode] = md;
      }
      formations[r] = rd;
    }

    // If the displaced player was in a sub pair, drop the pair (no longer valid).
    let subs = activePlan.subs || [];
    if (oldPid) subs = subs.filter(p => p.a !== oldPid && p.b !== oldPid);

    patchActivePlan({ assigned_players: newAssigned, formations, subs });
    return true;
  }, [activePlan, activeRotation, activeMode, patchActivePlan, flashWarning]);

  const removePlayerFromPlan = useCallback((playerId) => {
    if (!activePlan) return;
    const idx = (activePlan.assigned_players || []).indexOf(playerId);
    if (idx < 0) return;
    const newAssigned = [...activePlan.assigned_players];
    newAssigned[idx] = null;
    const formations = { ...(activePlan.formations || {}) };
    for (let r = 1; r <= 6; r++) {
      const rd = { ...(formations[r] || { serve: {}, receive: {} }) };
      for (const mode of ['serve','receive']) {
        const md = { ...(rd[mode] || {}) }; delete md[playerId];
        rd[mode] = md;
      }
      formations[r] = rd;
    }
    const subs = (activePlan.subs || []).filter(p => p.a !== playerId && p.b !== playerId);
    patchActivePlan({ assigned_players: newAssigned, formations, subs });
  }, [activePlan, patchActivePlan]);

  // ── Reset every bubble's position in the *current* formation back to its
  //    default rotational zone center. Useful when a bubble has drifted off
  //    the visible rectangle and the coach wants a clean slate. Other 11
  //    formations are untouched. ──
  const resetCurrentFormation = useCallback(() => {
    if (!activePlan) return;
    const formations = { ...(activePlan.formations || {}) };
    const rd = { ...(formations[activeRotation] || { serve: {}, receive: {} }) };
    const md = {};
    (activePlan.assigned_players || []).forEach((pid, idx) => {
      if (pid) md[pid] = defaultPositionFor(idx, activeRotation);
    });
    rd[activeMode] = md;
    formations[activeRotation] = rd;
    patchActivePlan({ formations });
  }, [activePlan, activeRotation, activeMode, patchActivePlan]);

  // ── Drag commit (called from CourtBubble's hand-rolled drag) ──
  // The bubble has been moved to (newX, newY) %. Validate, clamp, persist.
  // Court-bubble drag commit. The drag pipeline already enforces no overlap
  // and gives the coach real-time rotation-rule feedback, but we DON'T snap
  // out of an illegal position (per spec) — we save what they released.
  // A persistent red ring on the bubble (driven by `violationByPid`) keeps
  // the warning visible until they fix it.
  const commitBubbleDrag = useCallback((playerId, newX, newY) => {
    if (!activePlan) return;
    const pos = clampToSafe({ x: newX, y: newY })
      || clampToCourt(newX, newY);
    const formations = { ...(activePlan.formations || {}) };
    const rd = { ...(formations[activeRotation] || { serve: {}, receive: {} }) };
    const md = { ...(rd[activeMode] || {}) };
    md[playerId] = pos;
    rd[activeMode] = md;
    formations[activeRotation] = rd;
    patchActivePlan({ formations });
  }, [activePlan, activeRotation, activeMode, patchActivePlan]);

  // ─── Bubble drag pipeline ─────────────────────────────────────────────────
  // pointerdown on a bubble calls `onBubbleDragStart`. That function:
  //   1. caches drag offset + sibling-bubble centers + slot map,
  //   2. captures the pointer on the bubble (so a fast cursor can't escape),
  //   3. attaches per-drag pointermove/pointerup listeners to the COURT
  //      element with { passive: false } — they bubble up via pointer
  //      capture, and we own the entire lifecycle.
  // The listeners run cursor-offset math, push-back collision, FIVB rule
  // checks, and write `style.left`/`style.top` to the bubble's DOM node
  // inside requestAnimationFrame. NO setState during the drag — we commit
  // exactly once on pointerup.

  const tooltipRef = useRef(null);
  const tooltipTextRef = useRef(null);
  const dragStateRef = useRef({ active: false });
  const rafRef = useRef(null);
  const settleTimeoutsRef = useRef({});

  // Latest commit fn lives in a ref so the per-drag listener (created at
  // pointerdown time) can call the freshest implementation without forming
  // a stale closure.
  const commitBubbleDragRef = useRef(commitBubbleDrag);
  useEffect(() => { commitBubbleDragRef.current = commitBubbleDrag; });

  const onBubbleDragStart = useCallback((e, playerId) => {
    if (!courtRef.current || !activePlan) return;
    const bubble = e.currentTarget;
    const court = courtRef.current;
    const bubbleRect = bubble.getBoundingClientRect();
    const courtRect = court.getBoundingClientRect();

    // Snapshot the OTHER bubbles' centers (px in court coords) and the
    // slot each one occupies in the active rotation. They're stationary
    // for the duration of this drag, so we cache once.
    const otherCenters = {};   // pid → { x, y } (px in court coords)
    const otherSlots = {};     // pid → 'P1'..'P6'
    const assigned = activePlan.assigned_players || [];
    assigned.forEach((pid, i) => {
      if (!pid || pid === playerId) return;
      const pos = currentPositions[pid];
      if (!pos) return;
      otherCenters[pid] = {
        x: (pos.x / 100) * courtRect.width,
        y: (pos.y / 100) * courtRect.height,
      };
      otherSlots[pid] = slotInRotation(`P${i + 1}`, activeRotation);
    });

    const draggedIdx = assigned.indexOf(playerId);
    if (draggedIdx < 0) return;
    const draggedSlot = slotInRotation(`P${draggedIdx + 1}`, activeRotation);
    const draggedPlayer = playerById[playerId];

    // Cancel a pending settle for this bubble; clear inline transition so
    // the next move applies instantly (no smoothing during drag).
    if (settleTimeoutsRef.current[playerId]) {
      clearTimeout(settleTimeoutsRef.current[playerId]);
      delete settleTimeoutsRef.current[playerId];
    }
    bubble.style.transition = '';

    const drag = {
      active: true,
      pending: true,           // wait for movement before lifting
      bubble,
      bubbleId: playerId,
      pointerId: e.pointerId,
      startCursorX: e.clientX,
      startCursorY: e.clientY,
      offsetX: e.clientX - bubbleRect.left,
      offsetY: e.clientY - bubbleRect.top,
      otherCenters,
      otherSlots,
      draggedSlot,
      draggedIsLibero: isLibero(draggedPlayer),
      currentX: bubbleRect.left - courtRect.left,
      currentY: bubbleRect.top  - courtRect.top,
      violationMsg: null,
    };
    dragStateRef.current = drag;

    try { bubble.setPointerCapture(e.pointerId); } catch { /* old browsers */ }
    setSelectedRosterId(null);

    // Per-drag handlers (closure over `drag`). Defining them here means
    // removeEventListener inside `up` reliably matches.
    function move(ev) {
      const d = dragStateRef.current;
      if (!d.active || d !== drag) return;

      const dx = ev.clientX - d.startCursorX;
      const dy = ev.clientY - d.startCursorY;

      if (d.pending) {
        if (Math.hypot(dx, dy) < 3) return;
        d.pending = false;
        // Lift effect (instant, direct DOM, no transition, no shadow change).
        d.bubble.style.transition = 'none';
        d.bubble.style.zIndex = '999';
        d.bubble.style.scale = '1.12';
        d.bubble.style.filter = 'brightness(1.15)';
        d.bubble.style.cursor = 'grabbing';
      }

      ev.preventDefault();

      // Recalculate court rect every move — page scroll/resize during a drag
      // would otherwise drift the cursor offset.
      const cr = courtRef.current.getBoundingClientRect();

      // Cursor-offset → bubble top-left in court coords.
      let x = ev.clientX - cr.left - d.offsetX;
      let y = ev.clientY - cr.top  - d.offsetY;

      // Clamp the bubble's edges inside the inner court rectangle.
      const minLeft = COURT_INNER_PAD;
      const maxLeft = cr.width  - 2 * BUBBLE_RADIUS - COURT_INNER_PAD;
      const minTop  = COURT_INNER_PAD;
      const maxTop  = cr.height - 2 * BUBBLE_RADIUS - COURT_INNER_PAD;
      x = Math.max(minLeft, Math.min(maxLeft, x));
      y = Math.max(minTop,  Math.min(maxTop, y));

      let centerX = x + BUBBLE_RADIUS;
      let centerY = y + BUBBLE_RADIUS;

      // Push-back collision — bubbles never overlap. Iterate a few passes
      // so multi-bubble pile-ups resolve cleanly.
      const minDist = BUBBLE_RADIUS * 2;
      for (let pass = 0; pass < 4; pass++) {
        let collided = false;
        for (const pid in d.otherCenters) {
          const oc = d.otherCenters[pid];
          const ddx = centerX - oc.x;
          const ddy = centerY - oc.y;
          const dist = Math.hypot(ddx, ddy);
          if (dist < minDist) {
            collided = true;
            const angle = dist > 0.001
              ? Math.atan2(ddy, ddx)
              : Math.random() * Math.PI * 2;
            centerX = oc.x + Math.cos(angle) * minDist;
            centerY = oc.y + Math.sin(angle) * minDist;
            // Keep inside court bounds.
            centerX = Math.max(minLeft + BUBBLE_RADIUS, Math.min(maxLeft + BUBBLE_RADIUS, centerX));
            centerY = Math.max(minTop  + BUBBLE_RADIUS, Math.min(maxTop  + BUBBLE_RADIUS, centerY));
          }
        }
        if (!collided) break;
      }
      x = centerX - BUBBLE_RADIUS;
      y = centerY - BUBBLE_RADIUS;

      // ── FIVB overlap-rule check (warning only — no snap-back) ──
      let violationMsg = null;
      const slot = d.draggedSlot;
      const cBySlot = {};
      for (const pid in d.otherSlots) cBySlot[d.otherSlots[pid]] = d.otherCenters[pid];

      // Side-to-side
      if (slot === 'P2' && cBySlot.P3 && centerX <= cBySlot.P3.x) {
        violationMsg = 'P2 must stay right of P3';
      } else if (slot === 'P4' && cBySlot.P3 && centerX >= cBySlot.P3.x) {
        violationMsg = 'P4 must stay left of P3';
      } else if (slot === 'P3') {
        if (cBySlot.P4 && centerX <= cBySlot.P4.x) violationMsg = 'P3 must stay right of P4';
        else if (cBySlot.P2 && centerX >= cBySlot.P2.x) violationMsg = 'P3 must stay left of P2';
      } else if (slot === 'P1' && cBySlot.P6 && centerX <= cBySlot.P6.x) {
        violationMsg = 'P1 must stay right of P6';
      } else if (slot === 'P5' && cBySlot.P6 && centerX >= cBySlot.P6.x) {
        violationMsg = 'P5 must stay left of P6';
      } else if (slot === 'P6') {
        if (cBySlot.P5 && centerX <= cBySlot.P5.x) violationMsg = 'P6 must stay right of P5';
        else if (cBySlot.P1 && centerX >= cBySlot.P1.x) violationMsg = 'P6 must stay left of P1';
      }
      // Front-back
      if (!violationMsg) {
        if      (slot === 'P2' && cBySlot.P1 && centerY >= cBySlot.P1.y) violationMsg = 'P2 must stay closer to net than P1';
        else if (slot === 'P3' && cBySlot.P6 && centerY >= cBySlot.P6.y) violationMsg = 'P3 must stay closer to net than P6';
        else if (slot === 'P4' && cBySlot.P5 && centerY >= cBySlot.P5.y) violationMsg = 'P4 must stay closer to net than P5';
        else if (slot === 'P1' && cBySlot.P2 && centerY <= cBySlot.P2.y) violationMsg = 'P1 must stay behind P2';
        else if (slot === 'P6' && cBySlot.P3 && centerY <= cBySlot.P3.y) violationMsg = 'P6 must stay behind P3';
        else if (slot === 'P5' && cBySlot.P4 && centerY <= cBySlot.P4.y) violationMsg = 'P5 must stay behind P4';
      }
      // Libero (back row only)
      if (!violationMsg && d.draggedIsLibero && centerY < cr.height / 2) {
        violationMsg = 'Libero must stay in the back row';
      }

      d.currentX = x;
      d.currentY = y;
      d.violationMsg = violationMsg;

      // Single DOM write per display refresh.
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const dd = dragStateRef.current;
        if (!dd.active || dd !== drag) return;
        d.bubble.style.left = `${d.currentX}px`;
        d.bubble.style.top  = `${d.currentY}px`;
        if (d.violationMsg) {
          d.bubble.classList.add('is-violation');
          if (tooltipRef.current && tooltipTextRef.current) {
            tooltipTextRef.current.textContent = d.violationMsg;
            tooltipRef.current.style.left = `${d.currentX + BUBBLE_RADIUS}px`;
            tooltipRef.current.style.top  = `${d.currentY - 38}px`;
            tooltipRef.current.style.opacity = '1';
          }
        } else {
          d.bubble.classList.remove('is-violation');
          if (tooltipRef.current) tooltipRef.current.style.opacity = '0';
        }
      });
    }

    function up() {
      const d = dragStateRef.current;
      if (!d.active || d !== drag) return;
      d.active = false;

      court.removeEventListener('pointermove', move);
      court.removeEventListener('pointerup', up);
      court.removeEventListener('pointercancel', up);

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      try { d.bubble.releasePointerCapture(d.pointerId); } catch { /* noop */ }
      if (tooltipRef.current) tooltipRef.current.style.opacity = '0';

      // No movement → was a click. Let it propagate to the court click
      // handler (used by the click-to-place flow).
      if (d.pending) {
        d.bubble.style.transition = '';
        d.bubble.style.scale = '';
        d.bubble.style.filter = '';
        d.bubble.style.zIndex = '';
        d.bubble.style.cursor = '';
        return;
      }

      // Drop the lift instantly + arm a brief settle transition for the
      // upcoming React re-render that may snap to a slightly-different
      // committed position (e.g. clamped within COURT_BOUNDS).
      d.bubble.style.scale = '';
      d.bubble.style.filter = '';
      d.bubble.style.cursor = '';
      d.bubble.style.transition = 'left 120ms ease, top 120ms ease';

      // Convert px (top-left) back to center % and commit. Single setState
      // per drag.
      const cr2 = courtRef.current.getBoundingClientRect();
      const cx = d.currentX + BUBBLE_RADIUS;
      const cy = d.currentY + BUBBLE_RADIUS;
      const newX = (cx / cr2.width)  * 100;
      const newY = (cy / cr2.height) * 100;

      const bubbleEl = d.bubble;
      const bubbleId = d.bubbleId;
      settleTimeoutsRef.current[bubbleId] = setTimeout(() => {
        if (bubbleEl) {
          bubbleEl.style.transition = '';
          bubbleEl.style.zIndex = '';
        }
        delete settleTimeoutsRef.current[bubbleId];
      }, 140);

      commitBubbleDragRef.current(bubbleId, newX, newY);
    }

    court.addEventListener('pointermove', move, { passive: false });
    court.addEventListener('pointerup', up);
    court.addEventListener('pointercancel', up);
  }, [activePlan, currentPositions, activeRotation, playerById]);

  // Cleanup on unmount.
  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    Object.values(settleTimeoutsRef.current).forEach(t => clearTimeout(t));
  }, []);

  // ── Sub-pair operations ──
  function togglePairingMode() {
    setSelectedRosterId(null);
    setPairingMode(prev => !prev);
    setPairingSourceId(null);
  }
  function pickPairingPlayer(playerId) {
    if (!activePlan) return;
    if (!pairingSourceId) { setPairingSourceId(playerId); return; }
    if (pairingSourceId === playerId) { setPairingSourceId(null); return; }
    const subs = (activePlan.subs || []).slice();
    // Remove any existing pair involving either player.
    const filtered = subs.filter(
      p => p.a !== pairingSourceId && p.b !== pairingSourceId
        && p.a !== playerId && p.b !== playerId,
    );
    filtered.push({ a: pairingSourceId, b: playerId });
    patchActivePlan({ subs: filtered });
    setPairingSourceId(null);
    // Stay in pairing mode so the coach can link more pairs in a row;
    // they tap "Done" (the same button) to leave.
  }
  function unpairAt(idx) {
    if (!activePlan) return;
    const subs = [...(activePlan.subs || [])];
    if (idx < 0 || idx >= subs.length) return;
    subs.splice(idx, 1);
    patchActivePlan({ subs });
  }

  // ── Roster click ──
  function onRosterClick(player) {
    if (!activePlan) return;
    if (pairingMode) {
      pickPairingPlayer(player.id);
      return;
    }
    if ((activePlan.assigned_players || []).includes(player.id)) {
      setSelectedRosterId(null);
      return;
    }
    setSelectedRosterId(curr => curr === player.id ? null : player.id);
  }

  // ── Court click ──
  function onCourtClick(e) {
    if (!selectedRosterId || !activePlan || !courtRef.current) return;
    if (e.target.closest('.gpb-bubble-x')) return;

    const player = playerById[selectedRosterId];
    if (!player) { setSelectedRosterId(null); return; }

    let targetIdx = -1;
    let customPos = null;

    const bubbleEl = e.target.closest('.gpb-bubble');
    if (bubbleEl && bubbleEl.dataset.pid) {
      const pid = bubbleEl.dataset.pid;
      targetIdx = (activePlan.assigned_players || []).indexOf(pid);
      if (targetIdx >= 0) {
        customPos = activePlan.formations?.[activeRotation]?.[activeMode]?.[pid] || null;
      }
    }
    if (targetIdx < 0) {
      const rect = courtRef.current.getBoundingClientRect();
      const cx = ((e.clientX - rect.left) / rect.width)  * 100;
      const cy = ((e.clientY - rect.top)  / rect.height) * 100;
      const slot = zoneFor(cx, cy);
      targetIdx = slotToArrayIdx(slot, activeRotation);
    }
    if (targetIdx < 0) return;
    const ok = replacePlayerAtIdx(targetIdx, player, customPos);
    if (ok) setSelectedRosterId(null);
  }

  // ── dnd-kit drag handlers (covers BOTH bubble repositioning and
  //    bench → court placement, all via DragOverlay) ──
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(KeyboardSensor),
  );
  // dnd-kit only handles bench → court drops now. Court bubbles use native
  // pointer events inside CourtBubble — no React renders mid-drag.
  function handleDragStart(event) {
    const data = event.active.data.current || {};
    if (data.kind !== 'bench') return;
    const player = data.player || playerById[data.playerId];
    if (!player) return;
    const idx = (activePlan?.assigned_players || []).indexOf(player.id);
    setBenchDrag({
      kind: 'bench', playerId: player.id, player,
      colorVars: colorVarsFor(player, idx, activePlan),
      slotLabel: null,
    });
    setSelectedRosterId(null);
  }
  function handleDragEnd() {
    const drag = benchDrag;
    const dropPos = benchDropPos;
    setBenchDrag(null);
    setBenchDropPos(null);
    if (!drag || drag.kind !== 'bench' || !dropPos) return;
    const slot = zoneFor(dropPos.x, dropPos.y);
    const targetIdx = slotToArrayIdx(slot, activeRotation);
    if (targetIdx >= 0) {
      replacePlayerAtIdx(targetIdx, drag.player, clampToSafe(dropPos));
    }
  }
  function handleDragCancel() { setBenchDrag(null); setBenchDropPos(null); }

  // Track cursor as % of court while a bench drag is in progress so the
  // drop position can be reconstructed at release. Not used for court bubble
  // drags (those track via the bubble's own pointer handlers).
  const benchDragActive = !!benchDrag;
  useEffect(() => {
    if (!benchDragActive) { setBenchDropPos(null); return; }
    function onMove(e) {
      const rect = courtRef.current?.getBoundingClientRect();
      if (!rect) return;
      const inside =
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top  && e.clientY <= rect.bottom;
      if (!inside) return;
      const px = ((e.clientX - rect.left) / rect.width)  * 100;
      const py = ((e.clientY - rect.top)  / rect.height) * 100;
      setBenchDropPos(prev =>
        prev && prev.x === px && prev.y === py ? prev : { x: px, y: py },
      );
    }
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [benchDragActive]);

  // ── Rotation switch: detect pending subs and pop the dialog ──
  const handleRotationClick = useCallback((targetRotation) => {
    if (targetRotation === activeRotation) return;
    if (!activePlan) { setActiveRotation(targetRotation); return; }
    const pending = detectPendingSubs(activePlan, activeRotation, targetRotation, playerById);
    // Filter out pairs that are already confirmed for the target rotation
    const confirmedForTarget = new Set(activePlan.confirmed_subs?.[targetRotation] || []);
    const unconfirmed = pending.filter(p => !confirmedForTarget.has(p.pairIdx));
    if (unconfirmed.length === 0) {
      setActiveRotation(targetRotation);
      return;
    }
    // Show popup for the first pending sub of this transition. Stage the
    // rotation change — we apply it once the user finishes the popup queue.
    setSubPopup({
      fromRot: activeRotation,
      toRot: targetRotation,
      queue: unconfirmed,
      cursor: 0,
    });
  }, [activeRotation, activePlan, playerById]);

  function confirmCurrentSub() {
    if (!subPopup || !activePlan) return;
    const item = subPopup.queue[subPopup.cursor];
    const confirmed = { ...(activePlan.confirmed_subs || {}) };
    const list = new Set(confirmed[subPopup.toRot] || []);
    list.add(item.pairIdx);
    confirmed[subPopup.toRot] = [...list];
    patchActivePlan({ confirmed_subs: confirmed });
    advanceSubPopup();
  }
  function cancelCurrentSub() {
    advanceSubPopup();
  }
  function advanceSubPopup() {
    setSubPopup(curr => {
      if (!curr) return null;
      const nextCursor = curr.cursor + 1;
      if (nextCursor >= curr.queue.length) {
        // Done with all pending — apply the rotation change and dismiss.
        setActiveRotation(curr.toRot);
        return null;
      }
      return { ...curr, cursor: nextCursor };
    });
  }

  // ── Precomputed sets ──
  const onCourtIds = useMemo(
    () => new Set((activePlan?.assigned_players || []).filter(Boolean)),
    [activePlan],
  );
  const courtIsFull = onCourtIds.size === 6;
  const allValid = violations.length === 0;
  const tipTarget = useMemo(() => {
    if (!violations.length) return null;
    const v = violations[0];
    const pos = currentPositions[v.playerId];
    if (!pos) return null;
    return { reason: v.reason, position: pos };
  }, [violations, currentPositions]);

  // ── Esc ──
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return;
      if (subPopup) { setSubPopup(null); return; }
      if (pairingMode) {
        if (pairingSourceId) { setPairingSourceId(null); return; }
        setPairingMode(false);
        return;
      }
      if (selectedRosterId) { setSelectedRosterId(null); return; }
      if (benchDrag) return;
      onClose?.();
    }
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose, benchDrag, selectedRosterId, pairingMode, pairingSourceId, subPopup]);

  return (
    <div className="gpb-overlay" onClick={onClose}>
      <div className="gpb-modal" onClick={e => e.stopPropagation()}>

        {/* HEADER */}
        <header className="gpb-header">
          <div className="gpb-head-main">
            <div className="gpb-head-eyebrow">GAMEPLAN</div>
            <div className="gpb-head-title">vs {game.opponent}</div>
            <div className="gpb-head-meta">
              <span>{fmtDate(game.game_date)}</span>
              <span className="gpb-head-dot">·</span>
              <span className={`gpb-loc gpb-loc-${(game.location || 'Home').toLowerCase()}`}>
                {game.location || 'Home'}
              </span>
              {usingFallback && (
                <>
                  <span className="gpb-head-dot">·</span>
                  <span className="gpb-head-warn" title="Local-only. Run scripts/game_plans_migration.sql for cloud sync.">LOCAL</span>
                </>
              )}
            </div>
          </div>
          <button type="button" className="gpb-close" onClick={onClose} aria-label="Close">×</button>
        </header>

        {/* PLAN TABS */}
        <div className="gpb-tabs">
          {plans.map(plan => {
            const isActive = plan.id === activePlanId;
            const isRenaming = renamingId === plan.id;
            return (
              <div
                key={plan.id}
                className={`gpb-tab${isActive ? ' active' : ''}`}
                onClick={() => !isRenaming && setActivePlanId(plan.id)}
                onDoubleClick={() => startRename(plan)}
              >
                {isRenaming ? (
                  <input
                    autoFocus className="gpb-tab-rename"
                    value={renameDraft}
                    onChange={e => setRenameDraft(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitRename();
                      else if (e.key === 'Escape') { setRenamingId(null); setRenameDraft(''); }
                    }}
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <span className="gpb-tab-name">{plan.name}</span>
                    {isActive && plans.length > 1 && (
                      <button type="button" className="gpb-tab-x"
                        onClick={e => { e.stopPropagation(); removePlan(plan.id); }}
                        aria-label={`Delete ${plan.name}`}
                      >×</button>
                    )}
                  </>
                )}
              </div>
            );
          })}
          <button type="button" className="gpb-tab gpb-tab-add" onClick={addPlan}>+ New Plan</button>
        </div>

        {/* ROTATION + MODE TABS */}
        <div className="gpb-formation-tabs">
          <div className="gpb-rot-row">
            <span className="gpb-rot-label">ROTATION</span>
            {[1,2,3,4,5,6].map(r => {
              const subCount = (activePlan?.confirmed_subs?.[r] || []).length;
              return (
                <button
                  key={r}
                  type="button"
                  className={`gpb-rot-btn${r === activeRotation ? ' active' : ''}`}
                  onClick={() => handleRotationClick(r)}
                >
                  R{r}
                  {subCount > 0 && (
                    <span className="gpb-rot-sub-badge" title={`${subCount} confirmed sub${subCount > 1 ? 's' : ''}`}>
                      ⇄{subCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="gpb-mode-row">
            <button
              type="button"
              className={`gpb-mode-btn${activeMode === 'serve' ? ' active' : ''}`}
              onClick={() => setActiveMode('serve')}
            >Serve</button>
            <button
              type="button"
              className={`gpb-mode-btn${activeMode === 'receive' ? ' active' : ''}`}
              onClick={() => setActiveMode('receive')}
            >Serve Receive</button>
            <span className="gpb-mode-spacer" />
            <button
              type="button"
              className="gpb-reset-btn"
              onClick={resetCurrentFormation}
              title={`Reset every bubble in R${activeRotation} ${activeMode === 'serve' ? 'Serve' : 'Serve Receive'} to its default zone position`}
            >
              ↺ Reset positions
            </button>
            <span className={`gpb-status-pill ${allValid ? 'ok' : 'bad'}`}>
              {allValid ? '✓ LEGAL' : '✗ ILLEGAL'}
            </span>
          </div>
        </div>

        {/* WARNING BANNER */}
        {(warning || violations.length > 0) && (
          <div className="gpb-warning" role="alert">
            <span className="gpb-warning-dot" />
            {warning || violations[0].reason}
            {!warning && violations.length > 1 && (
              <span className="gpb-warning-count">+{violations.length - 1} more</span>
            )}
          </div>
        )}

        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
          autoScroll={false}
        >
          <div className="gpb-body">
            {loading ? (
              <div className="gpb-loading">Loading plans…</div>
            ) : !activePlan ? (
              <div className="gpb-loading">No plan selected</div>
            ) : (
              <>
                <div className="gpb-court-wrap">
                  <CourtSurface
                    courtRef={courtRef}
                    activePlan={activePlan}
                    activeRotation={activeRotation}
                    activeMode={activeMode}
                    currentPositions={currentPositions}
                    playerById={playerById}
                    violationByPid={violationByPid}
                    tipTarget={tipTarget}
                    onCourtClick={onCourtClick}
                    selectedRosterId={selectedRosterId}
                    benchDragActive={benchDragActive}
                    courtIsFull={courtIsFull}
                    onRemovePlayer={removePlayerFromPlan}
                    onBubbleDragStart={onBubbleDragStart}
                    assignedPlayers={activePlan.assigned_players || []}
                    courtWidth={courtSize.width}
                    courtHeight={courtSize.height}
                    tooltipRef={tooltipRef}
                    tooltipTextRef={tooltipTextRef}
                  />
                </div>

                <aside className="gpb-roster">
                  <div className="gpb-roster-head">
                    <span>ROSTER</span>
                    <span className="gpb-roster-count">{onCourtIds.size}/6 in plan</span>
                  </div>

                  {/* Dedicated Pair Subs button + chips for existing pairs.
                      Pairing is its own mode now — no per-row buttons. */}
                  <div className="gpb-pair-bar">
                    <button
                      type="button"
                      className={`gpb-pair-toggle${pairingMode ? ' active' : ''}`}
                      onClick={togglePairingMode}
                    >
                      ↔ {pairingMode ? 'Done' : 'Pair Subs'}
                    </button>
                    {(activePlan.subs || []).length > 0 && (
                      <div className="gpb-pair-chips">
                        {(activePlan.subs || []).map((pair, i) => {
                          const a = playerById[pair.a];
                          const b = playerById[pair.b];
                          if (!a || !b) return null;
                          return (
                            <span key={`${pair.a}::${pair.b}`} className="gpb-pair-chip">
                              <span className="gpb-pair-chip-name">
                                {lastNameOf(a.name) || a.name} ↔ {lastNameOf(b.name) || b.name}
                              </span>
                              <button
                                type="button"
                                className="gpb-pair-chip-x"
                                onClick={() => unpairAt(i)}
                                aria-label="Remove pair"
                                title="Remove pair"
                              >×</button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="gpb-roster-hint">
                    {pairingMode
                      ? (pairingSourceId
                          ? 'Click another name to link the pair · Esc to cancel'
                          : 'Click two roster names to pair them · Done when finished')
                      : selectedRosterId
                      ? 'Click an empty or filled bubble on the court'
                      : 'Click a name to arm placement · drag a row onto the court'}
                  </div>
                  <div className="gpb-roster-list">
                    {roster.length === 0 && (
                      <div className="gpb-roster-empty">No players on the roster yet.</div>
                    )}
                    {roster.map(p => {
                      const onCourt = onCourtIds.has(p.id);
                      const idx = (activePlan.assigned_players || []).indexOf(p.id);
                      const isSelected = !pairingMode && selectedRosterId === p.id;
                      const isPairingSource = pairingMode && pairingSourceId === p.id;
                      const pair = findPairForPlayer(activePlan, p.id);
                      return (
                        <BenchRow
                          key={p.id}
                          player={p}
                          isOnCourt={onCourt}
                          isSelected={isSelected}
                          isPairingSource={isPairingSource}
                          pair={pair}
                          playerById={playerById}
                          arrayIdx={idx}
                          plan={activePlan}
                          pairingMode={pairingMode}
                          onClick={() => onRosterClick(p)}
                        />
                      );
                    })}
                  </div>
                </aside>
              </>
            )}
          </div>

          {/* Bench → court drags use the DragOverlay so the user sees a
              floating bubble preview while dragging from the sidebar.
              Court-bubble drags do NOT use the overlay — the bubble itself
              follows the cursor via the inline transform composed in
              CourtBubble. (This is the model the user explicitly preferred.) */}
          <DragOverlay dropAnimation={null} zIndex={20000}>
            {benchDrag?.kind === 'bench' && benchDrag.player ? (
              <BubblePreview
                player={benchDrag.player}
                colorVars={benchDrag.colorVars}
                slotLabel={benchDrag.slotLabel}
              />
            ) : null}
          </DragOverlay>
        </DndContext>

        {/* Sub popup */}
        {subPopup && subPopup.queue[subPopup.cursor] && (
          <SubPopup
            item={subPopup.queue[subPopup.cursor]}
            playerById={playerById}
            fromRot={subPopup.fromRot}
            toRot={subPopup.toRot}
            queueIndex={subPopup.cursor + 1}
            queueTotal={subPopup.queue.length}
            onConfirm={confirmCurrentSub}
            onCancel={cancelCurrentSub}
          />
        )}
      </div>
    </div>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────────

function CourtSurface({
  courtRef, activePlan, activeRotation, activeMode,
  currentPositions, playerById, violationByPid,
  tipTarget, onCourtClick, selectedRosterId, benchDragActive, courtIsFull,
  onRemovePlayer, onBubbleDragStart,
  courtWidth, courtHeight, tooltipRef, tooltipTextRef,
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'court-surface',
    data: { kind: 'court' },
  });
  const armed = !!selectedRosterId;
  const armedPlayer = armed ? playerById[selectedRosterId] : null;
  const hint = benchDragActive
    ? 'Release to drop'
    : armedPlayer
      ? `Click any spot to place ${lastNameOf(armedPlayer.name) || armedPlayer.name} · Esc to cancel`
      : 'Click a roster name then click a court spot · drag bubbles to fine-tune';

  const assigned = activePlan?.assigned_players || [];

  return (
    <div className="gpb-court-toolbar-wrap">
      <div className="gpb-court-info">
        <span className="gpb-court-rot">
          R{activeRotation} · <span className="gpb-court-mode">{activeMode === 'serve' ? 'Serve' : 'Serve Receive'}</span>
        </span>
        <span className="gpb-court-hint">{hint}</span>
      </div>
      <div
        ref={(el) => { setNodeRef(el); courtRef.current = el; }}
        onClick={onCourtClick}
        className={[
          'gpb-court',
          benchDragActive ? 'is-dragging' : '',
          benchDragActive && isOver ? 'is-over' : '',
          armed ? 'arming' : '',
        ].filter(Boolean).join(' ')}
      >
        <div className="gpb-court-net" />
        <div className="gpb-court-3m" />
        <div className="gpb-court-row-label gpb-court-row-front">FRONT ROW · NET</div>
        <div className="gpb-court-row-label gpb-court-row-back">BACK ROW</div>

        {/* Slot guides — only when at least one slot is empty. Once 6 are
            placed, the court is "clean": just the 6 bubbles, nothing else. */}
        {!courtIsFull && SLOTS.map(slot => {
          const idx = slotToArrayIdx(slot, activeRotation);
          const filled = idx >= 0 && !!assigned[idx];
          if (filled) return null;
          const c = SLOT_POS[slot];
          return (
            <div
              key={`guide-${slot}`}
              className="gpb-slot-guide"
              style={{ left: `${c.x}%`, top: `${c.y}%` }}
            >
              <div className="gpb-slot-guide-num">{slot.slice(1)}</div>
              <div className="gpb-slot-guide-label">{slot}</div>
            </div>
          );
        })}

        {assigned.map((pid, idx) => {
          if (!pid) return null;
          const player = playerById[pid];
          if (!player) return null;
          const pos = currentPositions[pid];
          if (!pos) return null;
          const violation = violationByPid[pid];
          const slotLabel = slotInRotation(`P${idx + 1}`, activeRotation);
          return (
            <CourtBubble
              key={pid}
              player={player}
              playerId={pid}
              arrayIdx={idx}
              position={pos}
              plan={activePlan}
              violation={violation}
              slotLabel={slotLabel}
              courtWidth={courtWidth}
              courtHeight={courtHeight}
              onDragStart={onBubbleDragStart}
              onRemove={onRemovePlayer}
            />
          );
        })}

        {tipTarget && (
          <div
            className="gpb-violation-tip"
            style={{
              left: `${tipTarget.position.x}%`,
              top: `${Math.max(2, tipTarget.position.y - 14)}%`,
            }}
          >
            {tipTarget.reason}
          </div>
        )}

        {/* Live tooltip during a bubble drag — position + text mutated
            directly by the drag pipeline, never via React state. */}
        <div
          ref={tooltipRef}
          className="gpb-violation-tip gpb-live-tip"
          style={{ opacity: 0, left: 0, top: 0 }}
        >
          <span ref={tooltipTextRef} />
        </div>
      </div>
    </div>
  );
}

// ─── Court bubble — pure presentation, drag is owned by the parent.
//
// The bubble itself is a `position: absolute` div with `left`/`top` set in
// pixels (top-left corner of the bubble) by React from the committed % in
// plan state. On pointerdown we hand the event up to the parent which:
//   • caches drag offset, sets pointer capture on the bubble,
//   • attaches pointermove + pointerup listeners to the COURT element
//     (not the bubble), so a fast cursor never escapes,
//   • runs cursor-offset math, collision push-back, and FIVB rotation
//     rule checks inline,
//   • writes the new left/top to this DOM node via RAF — direct mutation,
//     no React renders during the drag,
//   • commits the final position to React state once on pointerup.
//
// React.memo + stable callback identities prevent any cascading re-render
// of sibling bubbles during a drag.
const CourtBubble = memo(function CourtBubble({
  player, playerId, arrayIdx, position, plan, violation, slotLabel,
  courtWidth, courtHeight, onDragStart, onRemove,
}) {
  const halfBubble = BUBBLE_RADIUS;
  // Bubble's TOP-LEFT in pixels from the court's top-left.
  const px = (position.x / 100) * courtWidth  - halfBubble;
  const py = (position.y / 100) * courtHeight - halfBubble;

  function pointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest('.gpb-bubble-x')) return;
    onDragStart?.(e, playerId);
  }

  return (
    <div
      data-pid={playerId}
      className={[
        'gpb-bubble',
        violation ? 'is-violation' : '',
      ].filter(Boolean).join(' ')}
      style={{
        left: `${px}px`,
        top:  `${py}px`,
        ...colorVarsFor(player, arrayIdx, plan),
      }}
      onPointerDown={pointerDown}
      title={violation || `${player.name}`}
    >
      {slotLabel && <div className="gpb-bubble-slot">{slotLabel}</div>}
      <div className="gpb-bubble-num">{player.jersey_number || '?'}</div>
      <div className="gpb-bubble-name">{lastNameOf(player.name) || player.name}</div>
      <button
        type="button"
        className="gpb-bubble-x"
        onClick={(e) => { e.stopPropagation(); onRemove?.(playerId); }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={`Remove ${player.name} from plan`}
        title="Remove from gameplan"
      >×</button>
    </div>
  );
});


function BubblePreview({ player, colorVars, slotLabel }) {
  return (
    <div className="gpb-bubble lifted" style={colorVars}>
      {slotLabel && <div className="gpb-bubble-slot">{slotLabel}</div>}
      <div className="gpb-bubble-num">{player.jersey_number || '?'}</div>
      <div className="gpb-bubble-name">{lastNameOf(player.name) || player.name}</div>
    </div>
  );
}

function BenchRow({
  player, isOnCourt, isSelected, isPairingSource, pair, playerById,
  arrayIdx, plan, pairingMode, onClick,
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `bench-${player.id}`,
    data: { kind: 'bench', playerId: player.id, player },
    // While in pairing mode, disable drag so the entire row is just a tap
    // target for picking the second member of the pair.
    disabled: isOnCourt || pairingMode,
  });
  const libero = isLibero(player);
  const colorVars = colorVarsFor(player, arrayIdx, plan);
  const partnerPid = pair ? pairOpponent(pair, player.id) : null;
  const partner = partnerPid ? playerById[partnerPid] : null;

  function onKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  }
  return (
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={isOnCourt && !pairingMode ? -1 : 0}
      aria-pressed={isSelected}
      className={[
        'gpb-bench-row',
        isOnCourt ? 'on-court' : '',
        isSelected ? 'selected' : '',
        isPairingSource ? 'pairing-source' : '',
        pairingMode ? 'pairing-mode' : '',
        libero ? 'libero' : '',
        isDragging ? 'is-dragging-row' : '',
      ].filter(Boolean).join(' ')}
      style={colorVars}
      onClick={onClick}
      onKeyDown={onKeyDown}
      {...listeners}
      {...attributes}
    >
      <div className="gpb-bench-num">{player.jersey_number || '?'}</div>
      <div className="gpb-bench-mid">
        <div className="gpb-bench-name">{player.name}</div>
        <div className="gpb-bench-meta">
          {[player.position, player.grade].filter(Boolean).join(' · ') || 'Player'}
          {partner && (
            <span className="gpb-bench-pair">↔ {lastNameOf(partner.name) || partner.name}</span>
          )}
        </div>
      </div>
      {libero && <div className="gpb-bench-libero" title="Libero">L</div>}
      {isOnCourt && <div className="gpb-bench-check" title="In gameplan">✓</div>}
    </div>
  );
}

function SubPopup({ item, playerById, fromRot, toRot, queueIndex, queueTotal, onConfirm, onCancel }) {
  if (!item) return null;
  const playerIn = playerById[item.action === 'sub-in' ? item.sub : item.starter];
  const playerOut = playerById[item.action === 'sub-in' ? item.starter : item.sub];
  if (!playerIn || !playerOut) return null;

  return (
    <div className="gpb-sub-overlay" onClick={onCancel}>
      <div className="gpb-sub-popup" onClick={e => e.stopPropagation()}>
        <div className="gpb-sub-head">
          <div className="gpb-sub-eyebrow">SUBSTITUTION</div>
          <div className="gpb-sub-title">
            R{fromRot} → R{toRot} · {item.fromSlot} → {item.toSlot}
          </div>
          {queueTotal > 1 && (
            <div className="gpb-sub-progress">{queueIndex} / {queueTotal}</div>
          )}
        </div>
        <div className="gpb-sub-body">
          <div className="gpb-sub-side gpb-sub-out">
            <div className="gpb-sub-side-label">OUT</div>
            <div className="gpb-sub-card">
              <div className="gpb-sub-num">{playerOut.jersey_number || '?'}</div>
              <div className="gpb-sub-name">{playerOut.name}</div>
              <div className="gpb-sub-pos">{playerOut.position || 'Player'}</div>
            </div>
          </div>
          <div className="gpb-sub-arrow">↔</div>
          <div className="gpb-sub-side gpb-sub-in">
            <div className="gpb-sub-side-label">IN</div>
            <div className="gpb-sub-card">
              <div className="gpb-sub-num">{playerIn.jersey_number || '?'}</div>
              <div className="gpb-sub-name">{playerIn.name}</div>
              <div className="gpb-sub-pos">{playerIn.position || 'Player'}</div>
            </div>
          </div>
        </div>
        <div className="gpb-sub-actions">
          <button type="button" className="gpb-sub-btn gpb-sub-cancel" onClick={onCancel}>Cancel</button>
          <button type="button" className="gpb-sub-btn gpb-sub-confirm" onClick={onConfirm}>Confirm Sub</button>
        </div>
      </div>
    </div>
  );
}
