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
// (or non-front-row member) is the "sub" that comes IN when their partner
// rotates to back row. A player can be in MULTIPLE pairs (1:N) — a libero
// typically pairs with both middle blockers so they auto-cover whichever MB
// is in the back row at any rotation.
// `confirmed_subs` is a map of rotation → list of pair indices that are
// confirmed-as-subbed-in for that rotation (badge on the rotation tab).

function findPairsForPlayer(plan, pid) {
  const subs = plan?.subs || [];
  return subs.filter(p => p.a === pid || p.b === pid);
}
function pairOpponent(pair, pid) {
  return pair.a === pid ? pair.b : pair.a;
}
// "Starter" of a pair = the front-row member. Liberos always come off the
// court in front-row rotations, and DSs typically replace a hitter when that
// hitter rotates to back row — so both are treated as the "sub" side. If
// both members are conventional starters (or both subs) we fall back to
// pair.a for determinism.
function isSubRole(player) {
  const r = (player?.position || '').toUpperCase().trim();
  return r === 'L' || r === 'DS';
}
function pairStarter(pair, playerById) {
  const pa = playerById[pair.a];
  const pb = playerById[pair.b];
  const aSub = isSubRole(pa), bSub = isSubRole(pb);
  if (aSub && !bSub) return pair.b;
  if (bSub && !aSub) return pair.a;
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
  // Libero ↔ MB pairs are handled exclusively by the auto-swap path in
  // effectiveLineupAt (and the dedicated libero panel manages them). They
  // must NOT show up here — otherwise rotation transitions would fire the
  // generic SubPopup on top of the silent auto-swap.
  const subs = (plan.subs || []).filter(
    p => !isLibero(playerById[p.a]) && !isLibero(playerById[p.b]),
  );
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

// ─── Effective lineup (regular subs + libero auto-swap) ──
//
// Returns the array of 6 player IDs that are CURRENTLY on the court at the
// given rotation. Computed deterministically from the plan state so any
// component that needs the live lineup gets the same answer.
//
//   1. Start from plan.assigned_players (the R1 starters of this set).
//   2. Replay plan.sub_log in order — last write per array-index wins. This
//      handles regular substitutions (out / re-entry / etc.) and persists
//      them across rotations until reversed.
//   3. Apply libero auto-swap: for each libero pair, if the paired MB is in
//      the BACK ROW at this rotation, the libero takes the MB's array-index.
//      A single libero can only be on the court once, so we stop after the
//      first matching MB. This step is recomputed every rotation and never
//      writes to sub_log.
//
// FIVB invariant: a libero is never placed in the front row. The function
// enforces this by skipping front-row slots in the auto-swap step.
function effectiveLineupAt(plan, rotation) {
  if (!plan) return [null, null, null, null, null, null];
  const arr = (plan.assigned_players || [null,null,null,null,null,null]).slice();

  // (2) Replay regular subs.
  for (const e of plan.sub_log || []) {
    if (!e || typeof e.atIdx !== 'number') continue;
    if (e.atIdx < 0 || e.atIdx > 5) continue;
    arr[e.atIdx] = e.toPid;
  }

  // (3) Libero auto-swap. Only fires when libero_auto is on.
  if (plan.libero_auto !== false) {
    const lps = plan.libero_pairs || {};
    const usedLiberos = new Set();
    for (const liberoPid of Object.keys(lps)) {
      if (usedLiberos.has(liberoPid)) continue;
      const mbs = (lps[liberoPid] || []).filter(Boolean);
      for (const mbPid of mbs) {
        const mbIdx = (plan.assigned_players || []).indexOf(mbPid);
        if (mbIdx < 0) continue;
        const slot = slotInRotation(`P${mbIdx + 1}`, rotation);
        if (FRONT_SLOTS.has(slot)) continue; // MB still in front — libero stays off
        // MB in back row → libero on court at MB's idx.
        arr[mbIdx] = liberoPid;
        usedLiberos.add(liberoPid);
        break;
      }
    }
  }

  return arr;
}

// FIVB sub counter: a TEAM gets 6 regular substitutions per set. Each unique
// starting array-index that has been mutated by a regular sub counts once,
// regardless of how many times its starter/substitute swap back and forth
// (FIVB allows multiple swaps within the same pair-slot).
function regularSubCount(plan) {
  const used = new Set();
  for (const e of plan?.sub_log || []) used.add(e.atIdx);
  return used.size;
}

// Given an array-index and a candidate substitute pid, return true if a
// regular sub at this idx with this substitute would be legal under FIVB:
//   • idx is currently occupied (starter exists)
//   • either this idx has never been subbed (consumes a new pair-slot, if
//     we still have one of the 6 left), or the candidate has already been
//     part of this idx's pair history (re-entry).
function canRegularSub(plan, atIdx, candidatePid) {
  if (!plan || atIdx < 0 || atIdx > 5) return false;
  if (!candidatePid) return false;
  const starter = (plan.assigned_players || [])[atIdx];
  if (!starter) return false;
  if (candidatePid === starter) {
    // Re-entering the starter — only valid if the idx has been subbed.
    return (plan.sub_log || []).some(e => e.atIdx === atIdx);
  }
  // Have we seen this candidate at this idx before? (Re-entry of the same
  // substitute is allowed even if pair-slot is "used".)
  const seenHere = (plan.sub_log || []).some(
    e => e.atIdx === atIdx && (e.fromPid === candidatePid || e.toPid === candidatePid),
  );
  if (seenHere) return true;
  // Brand-new pair-slot: blocked if all 6 are already used.
  if (regularSubCount(plan) >= 6) return false;
  // A substitute is locked to a single pair-slot. Block if they're already
  // part of a different idx's history.
  const elsewhere = (plan.sub_log || []).some(
    e => e.atIdx !== atIdx && (e.fromPid === candidatePid || e.toPid === candidatePid),
  );
  if (elsewhere) return false;
  return true;
}

// ─── Auto-detect pairs ──
//
// Given the players currently placed on the court (plan.assigned_players),
// infer reasonable sub pairs from their roster positions:
//   • Libero ↔ every Middle Blocker that's also placed.
//     The libero auto-subs in for whichever MB is in the back row at the
//     current rotation, so pairing the libero with BOTH MBs gives full
//     back-row coverage out of the box.
//   • DS ↔ a front-row hitter (OH or RS) in the same R1 column. If no
//     in-column hitter exists, falls back to the first unpaired hitter.
//
// Returns an array of { a, b } pairs ready to drop into plan.subs.
// Players already in a pair (after the libero pass) are skipped by the DS
// pass so we never duplicate.
function autoDetectPairs(plan, playerById) {
  if (!plan) return [];
  const assigned = plan.assigned_players || [];
  const placedIds = assigned.filter(Boolean);
  if (placedIds.length === 0) return [];

  const normRole = (p) => (p?.position || '').toUpperCase().trim();
  const isDS  = (p) => normRole(p) === 'DS';
  const isFrontHitter = (p) => ['OH', 'OPP', 'RS', 'O', 'WS'].includes(normRole(p));

  // R1 starting column for an assigned-array index. The 3 columns are:
  //   left = idx 3 (P4) ↔ idx 4 (P5)
  //   mid  = idx 2 (P3) ↔ idx 5 (P6)
  //   right= idx 1 (P2) ↔ idx 0 (P1)
  const COL_BY_IDX = ['R', 'R', 'M', 'L', 'L', 'M'];
  const columnOfPid = (pid) => {
    const idx = assigned.indexOf(pid);
    return idx < 0 ? null : COL_BY_IDX[idx];
  };

  const placed = placedIds.map(pid => playerById[pid]).filter(Boolean);
  const dss     = placed.filter(isDS);
  const hitters = placed.filter(isFrontHitter);

  // Libero pairs are managed in a dedicated panel (plan.libero_pairs), not
  // in this generic list — so we skip them here.
  const pairs = [];
  const partnersOf = new Map(); // pid → Set(partnerPid)
  const link = (aPid, bPid) => {
    if (!aPid || !bPid || aPid === bPid) return;
    if (!partnersOf.has(aPid)) partnersOf.set(aPid, new Set());
    if (!partnersOf.has(bPid)) partnersOf.set(bPid, new Set());
    if (partnersOf.get(aPid).has(bPid)) return;
    partnersOf.get(aPid).add(bPid);
    partnersOf.get(bPid).add(aPid);
    pairs.push({ a: aPid, b: bPid });
  };

  // DS pass: each DS pairs with a front-row hitter — same R1 column when
  // possible, otherwise the first unpaired hitter.
  for (const ds of dss) {
    if (partnersOf.has(ds.id) && partnersOf.get(ds.id).size > 0) continue;
    const col = columnOfPid(ds.id);
    const inCol = col ? hitters.find(h => columnOfPid(h.id) === col && !partnersOf.has(h.id)) : null;
    const partner = inCol || hitters.find(h => !partnersOf.has(h.id));
    if (partner) link(ds.id, partner.id);
  }

  return pairs;
}

// Auto-detect libero ↔ MB pairings for the dedicated libero panel.
// Returns { [liberoId]: [mbId1, mbId2] } with up to 2 MBs per libero (FIVB
// allows a libero to replace any back-row player but coaches pin them to
// specific MBs so the auto-swap is predictable). Only on-court players are
// considered.
function autoDetectLiberoPairs(plan, playerById) {
  if (!plan) return {};
  const placedIds = (plan.assigned_players || []).filter(Boolean);
  const placed = placedIds.map(pid => playerById[pid]).filter(Boolean);
  const normRole = (p) => (p?.position || '').toUpperCase().trim();
  const isLib = (p) => normRole(p) === 'L';
  const isMid = (p) => ['MB', 'MH', 'M'].includes(normRole(p));
  const liberos = placed.filter(isLib);
  const mbs = placed.filter(isMid);
  if (liberos.length === 0 || mbs.length === 0) return {};
  const out = {};
  // First libero gets all MBs (up to 2). Additional liberos stay unpaired
  // until the coach assigns them manually — two-libero squads vary too much
  // for a sensible auto-pairing.
  out[liberos[0].id] = mbs.slice(0, 2).map(p => p.id);
  return out;
}

// ─── Persistence ────────────────────────────────────────────────────────────
//
// Supabase is the single source of truth for gameplans — there is no local
// fallback. If the request errors (typically a schema/migration issue) the
// caller is expected to surface it as a hard error so the coach knows the
// data isn't being saved, instead of silently dropping writes into
// localStorage.

// Tells whether an error from PostgREST is the kind that only the SQL
// migration can fix (missing table or missing column). Used by the load
// path to show a targeted "run migration" call to action.
function isSchemaError(err) {
  if (!err) return false;
  const code = err.code || '';
  if (code === 'PGRST205' || code === '42P01' || code === '42703') return true;
  const msg = err.message || '';
  return /relation .* does not exist|column .* does not exist|schema cache/i.test(msg);
}

async function fetchPlans(scheduleGameId) {
  const { data, error } = await supabase
    .from('game_plans')
    .select('*')
    .eq('schedule_game_id', scheduleGameId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  return { data: data || [], error };
}
async function upsertPlan(plan) {
  const { data, error } = await supabase
    .from('game_plans')
    .upsert(plan, { onConflict: 'id' })
    .select()
    .single();
  return { data, error };
}
async function deletePlanRemote(planId) {
  const { error } = await supabase.from('game_plans').delete().eq('id', planId);
  return { error };
}

// — Playground-session persistence —
// A playground session is ONE row in playground_sessions with the full plan
// shape stored inline in the `plans` jsonb. We adapt to the modal's
// "array of plan rows" shape by wrapping the single blob.
async function fetchPlaygroundSession(sessionId) {
  const { data, error } = await supabase
    .from('playground_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();
  if (error) return { data: [], error };
  const blob = (data && data.plans && typeof data.plans === 'object') ? data.plans : {};
  const wrapped = normalizePlan({
    id: data.id,
    team_id: data.team_id,
    schedule_game_id: null,
    name: data.name || 'Untitled Session',
    notes: blob.notes || '',
    ...blob,
    position: 0,
  });
  return { data: [wrapped], error: null, sessionRow: data };
}
// — Formation presets persistence —
async function fetchPresets(teamId) {
  const { data, error } = await supabase
    .from('formation_presets')
    .select('*')
    .eq('team_id', teamId)
    .order('updated_at', { ascending: false });
  return { data: data || [], error };
}
async function upsertPreset(preset) {
  const { data, error } = await supabase
    .from('formation_presets')
    .upsert(preset, { onConflict: 'id' })
    .select()
    .single();
  return { data, error };
}
async function deletePreset(id) {
  const { error } = await supabase.from('formation_presets').delete().eq('id', id);
  return { error };
}

async function upsertPlaygroundSession(plan, sessionId) {
  // Persist everything that isn't a column on playground_sessions inside `plans`.
  const { id: _planId, team_id: _tid, schedule_game_id: _sid, name, position: _pos, created_at: _ca, updated_at: _ua, ...blob } = plan;
  void _planId; void _tid; void _sid; void _pos; void _ca; void _ua;
  const payload = {
    name: name || 'Untitled Session',
    plans: blob,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('playground_sessions')
    .update(payload)
    .eq('id', sessionId)
    .select()
    .single();
  return { data, error };
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
    // — Live-set fields (1 gameplan = 1 set) —
    // libero_pairs: { [liberoPid]: [mbPid1, mbPid2] } — each libero may cover up
    // to two MBs. Used by effectiveLineupAt to auto-swap.
    libero_pairs: {},
    // When true, paired liberos automatically take over their MB's slot in
    // every rotation where that MB is in the back row. The coach can flip it
    // off if they want to make every libero swap manual.
    libero_auto: true,
    // sub_log is the chronological history of regular (non-libero) swaps in
    // this set. Each entry: { id, atRot, atIdx, fromPid, toPid, ts }. Last
    // write per atIdx wins; libero auto-swaps are NOT logged here (they're
    // computed each rotation).
    sub_log: [],
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
  if (!plan.libero_pairs || typeof plan.libero_pairs !== 'object') plan.libero_pairs = {};
  if (typeof plan.libero_auto !== 'boolean') plan.libero_auto = true;
  if (!Array.isArray(plan.sub_log)) plan.sub_log = [];
  return plan;
}

// ─── Scheme (formation-preset) ↔ synthetic-plan mapping ─────────────────────
// A scheme is one formation_presets row keyed by six player-agnostic role
// markers (S, OH1, OH2, MB1, MB2, OPP). The builder edits a player-centric
// "plan", so scheme mode maps the preset onto the roster's role-representative
// players on open, and back to markers on Save — the same bucket logic
// applyPreset uses, so schemes stay reusable across any roster.
const SCHEME_MARKERS = ['S', 'OH1', 'OH2', 'MB1', 'MB2', 'OPP'];
const SCHEME_ROLE_FROM_POS = {
  S:   ['S', 'SET', 'SETTER'],
  OH:  ['OH', 'WS', 'OUTSIDE', 'OUTSIDE HITTER'],
  MB:  ['MB', 'MH', 'M', 'MIDDLE', 'MIDDLE BLOCKER'],
  OPP: ['OPP', 'RS', 'OPPOSITE', 'RIGHT SIDE'],
};
function bucketRosterForScheme(roster) {
  const buckets = { S: [], OH: [], MB: [], OPP: [] };
  for (const p of roster || []) {
    const r = (p?.position || '').toUpperCase().trim();
    if (!r) continue;
    for (const role of Object.keys(SCHEME_ROLE_FROM_POS)) {
      if (SCHEME_ROLE_FROM_POS[role].includes(r)) { buckets[role].push(p); break; }
    }
  }
  for (const k of Object.keys(buckets)) {
    buckets[k].sort((a, b) => {
      const an = parseInt(a.jersey_number, 10), bn = parseInt(b.jersey_number, 10);
      if (Number.isNaN(an) && Number.isNaN(bn)) return 0;
      if (Number.isNaN(an)) return 1;
      if (Number.isNaN(bn)) return -1;
      return an - bn;
    });
  }
  return buckets;
}
function schemeMarkerToPid(roster) {
  const b = bucketRosterForScheme(roster);
  const m = {};
  if (b.S[0])   m.S   = b.S[0].id;
  if (b.OH[0])  m.OH1 = b.OH[0].id;
  if (b.OH[1])  m.OH2 = b.OH[1].id;
  if (b.MB[0])  m.MB1 = b.MB[0].id;
  if (b.MB[1])  m.MB2 = b.MB[1].id;
  if (b.OPP[0]) m.OPP = b.OPP[0].id;
  return m;
}
// preset.rotations (role markers) → a synthetic plan the builder can edit.
function presetToSchemePlan(preset, roster, teamId) {
  const rotations = preset?.rotations || {};
  const markerToPid = schemeMarkerToPid(roster);
  const r1serve = (rotations[1] && rotations[1].serve) || {};

  // Place each marker's player into the R1 slot its serve position falls in
  // (same zone mapping applyPreset uses); fall back to first empty slot.
  const assigned = [null, null, null, null, null, null];
  for (const marker of SCHEME_MARKERS) {
    const pid = markerToPid[marker];
    if (!pid) continue;
    let slotIdx = -1;
    const pos = r1serve[marker];
    if (pos) slotIdx = slotToArrayIdx(zoneFor(pos.x, pos.y), 1);
    if (slotIdx < 0 || assigned[slotIdx]) slotIdx = assigned.findIndex(x => !x);
    if (slotIdx >= 0) assigned[slotIdx] = pid;
  }

  const formations = {
    1: { serve: {}, receive: {} }, 2: { serve: {}, receive: {} },
    3: { serve: {}, receive: {} }, 4: { serve: {}, receive: {} },
    5: { serve: {}, receive: {} }, 6: { serve: {}, receive: {} },
  };
  for (let r = 1; r <= 6; r++) {
    const rot = rotations[r] || {};
    for (const mode of ['serve', 'receive']) {
      const src = rot[mode] || {};
      for (const marker of Object.keys(src)) {
        const pid = markerToPid[marker];
        if (!pid) continue;
        formations[r][mode][pid] = { ...src[marker] };
      }
    }
  }

  return {
    id: cryptoRandomId(),
    team_id: teamId,
    schedule_game_id: null,
    name: preset?.name || 'New Scheme',
    lineup: {}, positions: {},
    assigned_players: assigned,
    formations,
    colors: {},
    subs: [], sub_log: [],
    confirmed_subs: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] },
    libero_pairs: {},      // schemes are the 6 role positions — no libero swap
    libero_auto: false,
    notes: '',
    position: 0,
  };
}
// Edited plan → preset.rotations (role markers). Captures the EFFECTIVE
// position of each on-court role player per rotation/mode (stored, else the
// rotation default) so the saved scheme is complete for all six markers.
function schemePlanToRotations(plan, roster) {
  const markerToPid = schemeMarkerToPid(roster);
  const pidToMarker = {};
  for (const marker of Object.keys(markerToPid)) pidToMarker[markerToPid[marker]] = marker;
  const assigned = plan.assigned_players || [];
  const rotations = {};
  for (let r = 1; r <= 6; r++) {
    const serve = {}, receive = {};
    assigned.forEach((pid, idx) => {
      if (!pid) return;
      const marker = pidToMarker[pid];
      if (!marker) return;
      const def = defaultPositionFor(idx, r);
      serve[marker]   = { ...(plan.formations?.[r]?.serve?.[pid]   || def) };
      receive[marker] = { ...(plan.formations?.[r]?.receive?.[pid] || def) };
    });
    rotations[r] = { serve, receive };
  }
  return rotations;
}

// ─── Main component ─────────────────────────────────────────────────────────
//
// playgroundSession (optional): when set, the modal is in playground mode —
// no game, no opponent/date header, single editable plan stored as one row
// in playground_sessions. Shape: { id, name }.
//
// schemePreset (optional): when set, the modal is in scheme mode — edits a
// formation_presets row (or a template/new draft) using the real player
// bubbles + rotation validation, and Save writes back to formation_presets.
export default function GameplanBuilderModal({ team, game: gameProp, players, onClose, playgroundSession = null, schemePreset = null, onSchemeSaved = null }) {
  const isPlayground = !!playgroundSession;
  const isScheme = !!schemePreset;
  // Synthesise a "game" stub in playground/scheme mode so the rest of the
  // component can read game.id / game.opponent without branching every line.
  const game = isPlayground
    ? { id: playgroundSession.id, opponent: playgroundSession.name || 'Playground', game_date: null, location: 'Home' }
    : isScheme
    ? { id: 'scheme:' + (schemePreset.id || 'new'), opponent: schemePreset.name || 'Scheme', game_date: null, location: 'Home' }
    : gameProp;
  const { addToast } = useToast();
  const [plans, setPlans] = useState([]);
  const [activePlanId, setActivePlanId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  // Hard error from Supabase load. When set, the modal renders a single
  // error screen with the SQL-editor link instead of the planner. Save
  // failures during normal use surface as toasts (no silent fallback).
  const [loadError, setLoadError] = useState(null);
  const saveErrorWarnedRef = useRef(false);

  // ── Toolbar / layout state ──
  // Roster aside collapses out of view; the centre court fills the freed
  // space. Persisted to localStorage so the coach's preference survives
  // re-opens.
  const [rosterCollapsed, setRosterCollapsed] = useState(() => {
    try { return localStorage.getItem('gpb-roster-collapsed') === '1'; }
    catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('gpb-roster-collapsed', rosterCollapsed ? '1' : '0'); }
    catch { /* ignore */ }
  }, [rosterCollapsed]);

  // ── Preset state ──
  // presets: list pulled from formation_presets. presetError surfaces the
  // missing-table state into a small inline message. applyPickerOpen
  // controls the Apply Preset dropdown; presetMgrOpen opens the manager;
  // presetEditing holds the preset row being edited (or a fresh stub).
  const [presets, setPresets] = useState([]);
  const [presetError, setPresetError] = useState(null);
  const [presetTick, setPresetTick] = useState(0);
  const [applyPickerOpen, setApplyPickerOpen] = useState(false);
  const [presetMgrOpen, setPresetMgrOpen] = useState(false);
  const [presetEditing, setPresetEditing] = useState(null);

  const [activeRotation, setActiveRotation] = useState(1);
  const [activeMode, setActiveMode] = useState('serve');

  // Click-to-place: roster row is "armed".
  const [selectedRosterId, setSelectedRosterId] = useState(null);

  // Sub-pair UI:
  //  - One-tap "Pair Subs" button → opens the PairSubsPopup with pairs that
  //    were auto-detected from roster positions. Coach taps any name to swap
  //    a player in a pair, hits Confirm to write back to plan.subs.
  //  - `pairPopup` is null when closed, an array of { a, b } drafts otherwise.
  const [pairPopup, setPairPopup] = useState(null);

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
    // Scheme mode has no remote row to load — build the editable plan straight
    // from the preset/template in memory.
    if (isScheme) {
      const plan = presetToSchemePlan(schemePreset, roster, team.id);
      setPlans([plan]);
      setActivePlanId(plan.id);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    const loader = isPlayground
      ? fetchPlaygroundSession(playgroundSession.id)
      : fetchPlans(game.id);

    Promise.resolve(loader).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setLoadError({
          schema: isSchemaError(error),
          message: error.message || String(error),
        });
        setLoading(false);
        return;
      }
      const normalized = data.map(normalizePlan);
      if (normalized.length === 0) {
        if (isPlayground) {
          // The dashboard pre-creates the session row before opening the
          // modal — if we still got zero rows back something deleted it
          // mid-flight. Surface that instead of silently re-seeding.
          setLoadError({ schema: false, message: 'Playground session no longer exists.' });
          setLoading(false);
          return;
        }
        const seed = makeNewPlan(team.id, game.id, 'Plan A', 0);
        upsertPlan(seed).then(({ error: seedErr }) => {
          if (cancelled) return;
          if (seedErr) {
            setLoadError({ schema: isSchemaError(seedErr), message: seedErr.message || String(seedErr) });
            setLoading(false);
            return;
          }
          setPlans([seed]);
          setActivePlanId(seed.id);
          setLoading(false);
        });
      } else {
        setPlans(normalized);
        setActivePlanId(normalized[0].id);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.id, isPlayground]);

  const activePlan = plans.find(p => p.id === activePlanId) || null;

  // ── Debounced autosave ──
  const saveTimerRef = useRef(null);
  const queuedSaveRef = useRef(null);
  const handleSaveError = useCallback((err) => {
    if (!err) return;
    if (isSchemaError(err)) {
      setLoadError({ schema: true, message: err.message || String(err) });
      return;
    }
    // Transient (network, RLS, etc.) — toast once per session so we don't
    // spam the coach every 250 ms.
    if (!saveErrorWarnedRef.current) {
      saveErrorWarnedRef.current = true;
      addToast(`Save failed: ${err.message || 'Supabase error'}`, 'error');
    }
  }, [addToast]);
  const scheduleSave = useCallback((plan) => {
    if (isScheme) return; // schemes persist only via explicit Save
    queuedSaveRef.current = plan;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const p = queuedSaveRef.current;
      queuedSaveRef.current = null;
      if (!p) return;
      const result = isPlayground
        ? await upsertPlaygroundSession(p, playgroundSession.id)
        : await upsertPlan(p);
      if (result.error) handleSaveError(result.error);
    }, 250);
  }, [handleSaveError, isPlayground, playgroundSession, isScheme]);
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const p = queuedSaveRef.current;
      if (!p) return;
      if (isPlayground) upsertPlaygroundSession(p, playgroundSession.id).catch(() => {});
      else if (!isScheme) upsertPlan(p).catch(() => {});
    };
  }, [isPlayground, playgroundSession, isScheme]);

  const patchActivePlan = useCallback((patch) => {
    if (!activePlan) return;
    const next = { ...activePlan, ...patch, updated_at: new Date().toISOString() };
    setPlans(curr => curr.map(p => p.id === next.id ? next : p));
    scheduleSave(next);
  }, [activePlan, scheduleSave]);

  // Explicit playground save — flush any queued autosave and write now so the
  // coach gets an unambiguous "it's saved" confirmation.
  const [playgroundSaving, setPlaygroundSaving] = useState(false);
  const savePlaygroundNow = useCallback(async () => {
    if (!isPlayground || !activePlan || !playgroundSession) return;
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    queuedSaveRef.current = null;
    setPlaygroundSaving(true);
    const { error } = await upsertPlaygroundSession(activePlan, playgroundSession.id);
    setPlaygroundSaving(false);
    if (error) handleSaveError(error);
    else addToast('Playground saved', 'success');
  }, [isPlayground, activePlan, playgroundSession, handleSaveError, addToast]);

  // Scheme save gate: a scheme can't be saved while ANY rotation's serve
  // alignment breaks the overlap rules (validation is at the moment of serve).
  // Returns the list of offending rotation numbers.
  const [schemeSaving, setSchemeSaving] = useState(false);
  const schemeServeIssues = useMemo(() => {
    if (!isScheme || !activePlan) return [];
    const out = [];
    for (let r = 1; r <= 6; r++) {
      const lineup = effectiveLineupAt(activePlan, r);
      const positions = {};
      lineup.forEach((pid, idx) => {
        if (!pid) return;
        positions[pid] = activePlan.formations?.[r]?.serve?.[pid] || defaultPositionFor(idx, r);
      });
      if (validateFormation(positions, lineup, r, playerById).length) out.push(r);
    }
    return out;
  }, [isScheme, activePlan, playerById]);
  const saveSchemeNow = useCallback(async () => {
    if (!isScheme || !activePlan) return;
    if (schemeServeIssues.length) {
      addToast(`Fix illegal overlap in R${schemeServeIssues.join(', R')} before saving`, 'error');
      return;
    }
    const rotations = schemePlanToRotations(activePlan, roster);
    const payload = {
      ...(schemePreset?.id ? { id: schemePreset.id } : {}),
      team_id: team.id,
      name: (activePlan.name || 'New Scheme').trim() || 'New Scheme',
      rotations,
      updated_at: new Date().toISOString(),
    };
    setSchemeSaving(true);
    const { error } = await upsertPreset(payload);
    setSchemeSaving(false);
    if (error) { handleSaveError(error); return; }
    addToast(schemePreset?.id ? 'Scheme updated' : 'Scheme saved', 'success');
    onSchemeSaved?.();
  }, [isScheme, activePlan, schemeServeIssues, roster, schemePreset, team, addToast, handleSaveError, onSchemeSaved]);

  // ── Transient warning banner ──
  // (`playerId` is accepted for call-site compatibility but no longer
  // produces a per-bubble red flash — the live drag pipeline owns
  // bubble-level visual feedback now.)
  const flashWarning = useCallback((message /* , playerId */) => {
    setWarning(message);
    setTimeout(() => setWarning(curr => curr === message ? null : curr), 2000);
  }, []);

  // ── Effective lineup: who is physically on the court right now. ──
  // Mixes the R1 starters with any logged regular subs and the rotation-
  // driven libero auto-swap. CourtSurface, the validator, and onCourtIds
  // all flow from this so the court state is one source of truth.
  const effectiveLineup = useMemo(
    () => effectiveLineupAt(activePlan, activeRotation),
    [activePlan, activeRotation],
  );

  // ── Derived: positions of bubbles in the current view ──
  // Defensive clamp guarantees every rendered bubble is visible inside the
  // court — even if a historical stored position is out of bounds.
  // A libero who auto-subs into an MB's slot inherits the MB's drawn
  // position so the bubble lands exactly where the MB was.
  const currentPositions = useMemo(() => {
    if (!activePlan) return {};
    const stored = activePlan.formations?.[activeRotation]?.[activeMode] || {};
    const baseAssigned = activePlan.assigned_players || [];
    const out = {};
    effectiveLineup.forEach((pid, idx) => {
      if (!pid) return;
      const original = baseAssigned[idx];
      const raw = stored[pid]
        || (original && stored[original])
        || defaultPositionFor(idx, activeRotation);
      out[pid] = clampToSafe(raw);
    });
    return out;
  }, [activePlan, effectiveLineup, activeRotation, activeMode]);

  // ── Validation against the *committed* positions only (not mid-drag) ──
  const violations = useMemo(() => {
    if (!activePlan) return [];
    return validateFormation(currentPositions, effectiveLineup, activeRotation, playerById);
  }, [activePlan, currentPositions, effectiveLineup, activeRotation, playerById]);
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
    upsertPlan(np).then(({ error }) => { if (error) handleSaveError(error); });
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
    const { error } = await deletePlanRemote(id);
    if (error) handleSaveError(error);
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
    // FIVB hard block: a libero is NEVER a starter. They enter the court
    // only via the auto-swap defined in the Libero Pairing panel, which
    // guarantees they only occupy back-row slots. Placing them in
    // assigned_players would let them rotate into the front row in some
    // rotations — strictly illegal.
    if (isLibero(newPlayer)) {
      flashWarning(
        `${lastNameOf(newPlayer.name) || 'Libero'} (Libero) cannot start — use the Libero Pairing panel instead`,
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
    // Use the EFFECTIVE lineup (starters + replayed regular subs + libero
    // auto-swap), not the raw starters array — a subbed-in player owns the
    // bubble at that idx, so looking them up in assigned_players would miss
    // and abort the drag.
    const assigned = effectiveLineup;
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
  }, [activePlan, effectiveLineup, currentPositions, activeRotation, playerById]);

  // Cleanup on unmount.
  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    Object.values(settleTimeoutsRef.current).forEach(t => clearTimeout(t));
  }, []);

  // ── Sub-pair operations ──
  // One-tap "Pair Subs": open the popup pre-loaded with auto-detected pairs
  // (if the plan has no manual pairs yet) or with the coach's existing pairs
  // (if they've already wired some up — so opening the popup never wipes
  // their work).
  function openPairSubsPopup() {
    if (!activePlan) return;
    setSelectedRosterId(null);
    const existing = activePlan.subs || [];
    const seed = existing.length > 0 ? existing : autoDetectPairs(activePlan, playerById);
    // Strip any pairs that reference players who are no longer in the roster.
    const valid = seed.filter(p => playerById[p.a] && playerById[p.b]);
    setPairPopup(valid.map(p => ({ a: p.a, b: p.b })));
  }
  function regenerateAutoPairs() {
    if (!activePlan) return;
    setPairPopup(autoDetectPairs(activePlan, playerById).map(p => ({ a: p.a, b: p.b })));
  }
  function confirmPairPopup() {
    if (!activePlan || !pairPopup) return;
    // Drop empties (slots not filled in by the coach) and dedupe order-
    // independent pairs.
    const seen = new Set();
    const subs = [];
    for (const p of pairPopup) {
      if (!p.a || !p.b || p.a === p.b) continue;
      const key = [p.a, p.b].sort().join('::');
      if (seen.has(key)) continue;
      seen.add(key);
      subs.push({ a: p.a, b: p.b });
    }
    // Reset confirmed_subs because pair indices may have shifted.
    patchActivePlan({
      subs,
      confirmed_subs: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] },
    });
    setPairPopup(null);
  }
  function unpairAt(idx) {
    if (!activePlan) return;
    const subs = [...(activePlan.subs || [])];
    if (idx < 0 || idx >= subs.length) return;
    subs.splice(idx, 1);
    patchActivePlan({ subs });
  }

  // ── Libero pairing operations ──
  function setLiberoPair(liberoId, slot, mbId) {
    if (!activePlan) return;
    const lps = { ...(activePlan.libero_pairs || {}) };
    const pair = (lps[liberoId] || [null, null]).slice();
    while (pair.length < 2) pair.push(null);
    pair[slot] = mbId || null;
    // Cleanly drop an entry if both slots are empty so the panel stays tidy.
    if (!pair[0] && !pair[1]) delete lps[liberoId];
    else lps[liberoId] = pair;
    patchActivePlan({ libero_pairs: lps });
  }
  function toggleLiberoAuto() {
    if (!activePlan) return;
    patchActivePlan({ libero_auto: !(activePlan.libero_auto !== false) });
  }
  // ── Preset operations ──
  useEffect(() => {
    if (!team?.id) return;
    let cancelled = false;
    fetchPresets(team.id).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setPresetError({
          schema: isSchemaError(error),
          message: error.message || String(error),
        });
        setPresets([]);
        return;
      }
      setPresetError(null);
      setPresets(data);
    });
    return () => { cancelled = true; };
  }, [team?.id, presetTick]);

  function refreshPresets() { setPresetTick(t => t + 1); }

  async function savePreset(preset) {
    const payload = {
      ...preset,
      team_id: team.id,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await upsertPreset(payload);
    if (error) {
      addToast(`Save failed: ${error.message || 'Supabase error'}`, 'error');
      return null;
    }
    refreshPresets();
    return data;
  }
  async function removePreset(id) {
    if (!confirm('Delete this preset?')) return;
    const { error } = await deletePreset(id);
    if (error) {
      addToast(`Delete failed: ${error.message || 'Supabase error'}`, 'error');
      return;
    }
    refreshPresets();
  }

  // Apply a preset to the active plan: copy the preset's role-keyed
  // positions into plan.formations, after substituting role markers with
  // actual roster players matched by their position tag.
  //
  // Matching rule: a player's position string (case-insensitive) maps to
  // one or more roles via ROLE_FROM_POS. Multiple players for the same
  // role (e.g. two OH) get assigned in jersey-number order to OH1 / OH2.
  function applyPreset(preset) {
    if (!activePlan || !preset) return;
    const rotations = preset.rotations || {};

    // Group roster players by their canonical role.
    const ROLE_FROM_POS = {
      S:  ['S', 'SET', 'SETTER'],
      OH: ['OH', 'WS', 'OUTSIDE', 'OUTSIDE HITTER'],
      MB: ['MB', 'MH', 'M', 'MIDDLE', 'MIDDLE BLOCKER'],
      OPP:['OPP', 'RS', 'OPPOSITE', 'RIGHT SIDE'],
      L:  ['L', 'LIBERO', 'DS', 'DEFENSIVE SPECIALIST'],
    };
    const norm = (p) => (p?.position || '').toUpperCase().trim();
    const buckets = { S: [], OH: [], MB: [], OPP: [], L: [] };
    for (const p of roster) {
      const r = norm(p);
      if (!r) continue;
      let matched = null;
      for (const role of Object.keys(ROLE_FROM_POS)) {
        if (ROLE_FROM_POS[role].includes(r)) { matched = role; break; }
      }
      if (matched) buckets[matched].push(p);
    }
    // Sort each bucket by jersey number (ascending) so OH1 < OH2 deterministically.
    for (const k of Object.keys(buckets)) {
      buckets[k].sort((a, b) => {
        const an = parseInt(a.jersey_number, 10), bn = parseInt(b.jersey_number, 10);
        if (Number.isNaN(an) && Number.isNaN(bn)) return 0;
        if (Number.isNaN(an)) return 1;
        if (Number.isNaN(bn)) return -1;
        return an - bn;
      });
    }

    // marker → player id
    const ROLE_MARKERS = ['S', 'OH1', 'OH2', 'MB1', 'MB2', 'OPP'];
    const markerToPid = {};
    if (buckets.S[0])   markerToPid.S   = buckets.S[0].id;
    if (buckets.OH[0])  markerToPid.OH1 = buckets.OH[0].id;
    if (buckets.OH[1])  markerToPid.OH2 = buckets.OH[1].id;
    if (buckets.MB[0])  markerToPid.MB1 = buckets.MB[0].id;
    if (buckets.MB[1])  markerToPid.MB2 = buckets.MB[1].id;
    if (buckets.OPP[0]) markerToPid.OPP = buckets.OPP[0].id;

    // assigned_players in R1-slot order (P1..P6 = idx 0..5). The preset
    // doesn't dictate which marker sits where in R1 — we read the
    // marker's R1 serve position and assign it to the closest slot by
    // x/y zone. If no R1 serve position exists, fall back to a sensible
    // default ordering by role.
    const r1 = rotations[1] || {};
    const r1serve = r1.serve || {};
    const assigned = [null, null, null, null, null, null];

    for (const marker of ROLE_MARKERS) {
      const pid = markerToPid[marker];
      if (!pid) continue;
      const pos = r1serve[marker];
      let slotIdx = -1;
      if (pos) {
        const slot = zoneFor(pos.x, pos.y);
        slotIdx = slotToArrayIdx(slot, 1);
      }
      if (slotIdx < 0 || assigned[slotIdx]) {
        // Find first empty slot.
        slotIdx = assigned.findIndex(x => !x);
      }
      if (slotIdx >= 0) assigned[slotIdx] = pid;
    }

    // Build formations from the preset, swapping marker keys for player ids.
    const formations = {
      1: { serve: {}, receive: {} }, 2: { serve: {}, receive: {} },
      3: { serve: {}, receive: {} }, 4: { serve: {}, receive: {} },
      5: { serve: {}, receive: {} }, 6: { serve: {}, receive: {} },
    };
    for (let r = 1; r <= 6; r++) {
      const rot = rotations[r] || {};
      for (const mode of ['serve', 'receive']) {
        const src = rot[mode] || {};
        for (const marker of Object.keys(src)) {
          const pid = markerToPid[marker];
          if (!pid) continue;
          formations[r][mode][pid] = { ...src[marker] };
        }
      }
    }

    // Libero placement: if a libero exists in the roster, set up the
    // libero pair with the FIRST middle-blocker so auto-swap kicks in.
    const lib = buckets.L[0];
    const libero_pairs = {};
    if (lib && buckets.MB[0]) {
      const mbs = buckets.MB.slice(0, 2).map(p => p.id);
      libero_pairs[lib.id] = [mbs[0], mbs[1] || null];
    }

    patchActivePlan({
      assigned_players: assigned,
      formations,
      libero_pairs,
      // Subs + log reset because the players (and therefore pair indices) just changed.
      subs: [],
      sub_log: [],
      confirmed_subs: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] },
    });
    setApplyPickerOpen(false);
    addToast(`Applied "${preset.name}"`, 'success');
  }

  function autoDetectLibero() {
    if (!activePlan) return;
    const detected = autoDetectLiberoPairs(activePlan, playerById);
    patchActivePlan({ libero_pairs: detected });
  }

  // ── Physical regular sub: swap an on-court starter for a bench partner. ──
  // The new pid is written into the sub_log at the starter's assigned-array
  // index. effectiveLineupAt re-derives the on-court state, the CourtBubble
  // re-mounts at that slot, and the gpb-bubble-sub-in animation fires.
  function applyRegularSub(atIdx, toPid) {
    if (!activePlan) return false;
    const base = activePlan.assigned_players || [];
    const original = base[atIdx];
    if (!original) return false;
    // FIVB-strict legality check (pair-slot uniqueness, sub limit, etc.)
    if (!canRegularSub(activePlan, atIdx, toPid)) return false;
    // Current effective player at this idx (might already be a substitute).
    const fromPid = effectiveLineup[atIdx] || original;
    if (fromPid === toPid) return false;
    const entry = {
      id: cryptoRandomId(),
      kind: 'regular',
      atIdx,
      atRot: activeRotation,
      fromPid,
      toPid,
      ts: Date.now(),
    };
    patchActivePlan({ sub_log: [...(activePlan.sub_log || []), entry] });
    return true;
  }
  function undoLastSub() {
    if (!activePlan) return;
    const log = activePlan.sub_log || [];
    if (log.length === 0) return;
    patchActivePlan({ sub_log: log.slice(0, -1) });
  }

  // ── Roster click ──
  function onRosterClick(player) {
    if (!activePlan) return;
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
  // Visually on the court = effective lineup (so the dimmed/un-dimmed roster
  // state flips the moment a sub fires or a libero auto-swap kicks in).
  const onCourtIds = useMemo(
    () => new Set(effectiveLineup.filter(Boolean)),
    [effectiveLineup],
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

  // ── Keyboard shortcuts ──
  //   Esc      → close popups / armed states / modal
  //   1..6     → switch rotation (R1..R6)
  //   S / R    → switch serve / receive mode
  // We ignore keys when the user is typing in an input/textarea so the
  // session-name / notes fields work normally.
  useEffect(() => {
    function isTypingTarget(t) {
      if (!t) return false;
      const tag = (t.tagName || '').toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable;
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        if (applyPickerOpen) { setApplyPickerOpen(false); return; }
        if (presetMgrOpen) { setPresetMgrOpen(false); return; }
        if (presetEditing) { setPresetEditing(null); return; }
        if (subPopup) { setSubPopup(null); return; }
        if (pairPopup) { setPairPopup(null); return; }
        if (selectedRosterId) { setSelectedRosterId(null); return; }
        if (benchDrag) return;
        onClose?.();
        return;
      }
      // Don't fire shortcut keys while typing.
      if (isTypingTarget(e.target)) return;
      // Don't fire while a modal popup is open.
      if (subPopup || pairPopup || applyPickerOpen || presetMgrOpen || presetEditing) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key >= '1' && e.key <= '6') {
        e.preventDefault();
        handleRotationClick(parseInt(e.key, 10));
        return;
      }
      const k = e.key.toLowerCase();
      if (k === 's') { e.preventDefault(); setActiveMode('serve'); return; }
      if (k === 'r') { e.preventDefault(); setActiveMode('receive'); return; }
    }
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose, benchDrag, selectedRosterId, pairPopup, subPopup, applyPickerOpen, presetMgrOpen, presetEditing, handleRotationClick]);

  return (
    <div className="gpb-overlay" onClick={onClose}>
      <div className="gpb-modal" onClick={e => e.stopPropagation()}>

        {/* HEADER */}
        <header className="gpb-header">
          <div className="gpb-head-main">
            <div className={`gpb-head-eyebrow${isPlayground ? ' is-playground' : ''}${isScheme ? ' is-scheme' : ''}`}>
              {isPlayground ? '⌒ PLAYGROUND' : isScheme ? '◈ SCHEME' : 'GAMEPLAN'}
            </div>
            {isPlayground || isScheme ? (
              <PlaygroundHeaderEditor
                name={(activePlan && activePlan.name)
                  || (isScheme ? (schemePreset.name || 'New Scheme') : playgroundSession.name)
                  || 'Untitled Session'}
                onCommit={(name) => patchActivePlan({ name })}
              />
            ) : (
              <>
                <div className="gpb-head-title">vs {game.opponent}</div>
                <div className="gpb-head-meta">
                  <span>{fmtDate(game.game_date)}</span>
                  <span className="gpb-head-dot">·</span>
                  <span className={`gpb-loc gpb-loc-${(game.location || 'Home').toLowerCase()}`}>
                    {game.location || 'Home'}
                  </span>
                </div>
              </>
            )}
          </div>
          <button type="button" className="gpb-close" onClick={onClose} aria-label="Close">×</button>
        </header>

        {/* Playground / Scheme toolbar. */}
        {(isPlayground || isScheme) && activePlan && (
          <div className="gpb-playground-toolbar">
            {isScheme ? (
              <>
                <button
                  type="button"
                  className="gpb-pg-tool gpb-pg-save"
                  onClick={saveSchemeNow}
                  disabled={schemeSaving || schemeServeIssues.length > 0}
                  title={schemeServeIssues.length > 0
                    ? `Illegal overlap in R${schemeServeIssues.join(', R')} — fix before saving`
                    : 'Save this scheme as a reusable preset'}
                >
                  {schemeSaving ? 'Saving…' : (schemePreset?.id ? '↓ Save Scheme' : '↓ Save As Scheme')}
                </button>
                {schemeServeIssues.length > 0 && (
                  <span className="gpb-pg-savehint" role="status">
                    Illegal overlap in R{schemeServeIssues.join(', R')}
                  </span>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="gpb-pg-tool gpb-pg-save"
                  onClick={savePlaygroundNow}
                  disabled={playgroundSaving}
                  title="Save this arrangement to your playground sessions"
                >
                  {playgroundSaving ? 'Saving…' : '↓ Save'}
                </button>
                <button
                  type="button"
                  className="gpb-pg-tool"
                  onClick={() => {
                    if (!confirm('Clear all bubbles, libero pairings, and subs from this session?')) return;
                    patchActivePlan({
                      assigned_players: [null,null,null,null,null,null],
                      formations: {
                        1: { serve: {}, receive: {} }, 2: { serve: {}, receive: {} },
                        3: { serve: {}, receive: {} }, 4: { serve: {}, receive: {} },
                        5: { serve: {}, receive: {} }, 6: { serve: {}, receive: {} },
                      },
                      colors: {},
                      subs: [],
                      confirmed_subs: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] },
                      libero_pairs: {},
                      sub_log: [],
                    });
                  }}
                  title="Clear the court and start over"
                >
                  ↺ Reset Court
                </button>
                <input
                  type="text"
                  className="gpb-pg-notes"
                  placeholder="Notes about this look — e.g. why it works, who serves first…"
                  value={activePlan.notes || ''}
                  onChange={e => patchActivePlan({ notes: e.target.value })}
                  maxLength={280}
                />
              </>
            )}
          </div>
        )}

        {/* PLAN TABS — hidden in playground/scheme mode (one plan). */}
        {!isPlayground && !isScheme && (
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
        )}

        {/* CONSOLIDATED TOOLBAR — sticky, single row at the top of the
            planner. Houses rotation pills, serve/receive toggle, preset
            actions, reset and the LEGAL pill. */}
        <div className="gpb-toolbar">
          <div className="gpb-toolbar-group gpb-toolbar-rots">
            {[1,2,3,4,5,6].map(r => {
              const subCount = (activePlan?.confirmed_subs?.[r] || []).length;
              const f = activePlan?.formations?.[r];
              const isConfigured = !!f && (
                Object.keys(f.serve || {}).length > 0 ||
                Object.keys(f.receive || {}).length > 0
              );
              return (
                <button
                  key={r}
                  type="button"
                  className={[
                    'gpb-rot-btn',
                    r === activeRotation ? 'active' : '',
                    isConfigured ? 'configured' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => handleRotationClick(r)}
                  title={`Rotation ${r}${isConfigured ? ' · set up' : ' · empty'} (press ${r})`}
                >
                  <span className="gpb-rot-btn-label">R{r}</span>
                  {subCount > 0 && (
                    <span className="gpb-rot-sub-badge" title={`${subCount} confirmed sub${subCount > 1 ? 's' : ''}`}>
                      ⇄{subCount}
                    </span>
                  )}
                  {isConfigured && <span className="gpb-rot-btn-dot" aria-hidden="true" />}
                </button>
              );
            })}
          </div>

          <div className="gpb-toolbar-sep" aria-hidden="true" />

          <div className="gpb-toolbar-group gpb-toolbar-mode">
            <button
              type="button"
              className={`gpb-mode-btn${activeMode === 'serve' ? ' active' : ''}`}
              onClick={() => setActiveMode('serve')}
              title="Serve (press S)"
            >Serve</button>
            <button
              type="button"
              className={`gpb-mode-btn${activeMode === 'receive' ? ' active' : ''}`}
              onClick={() => setActiveMode('receive')}
              title="Serve Receive (press R)"
            >Serve Receive</button>
          </div>

          {/* Preset apply/manage — gameplan mode only; in scheme mode you ARE
              editing the preset. */}
          {!isScheme && (
            <>
              <div className="gpb-toolbar-sep" aria-hidden="true" />
              <div className="gpb-toolbar-group gpb-toolbar-presets">
                <button
                  type="button"
                  className="gpb-toolbar-btn"
                  onClick={() => setApplyPickerOpen(true)}
                  disabled={!!presetError?.schema}
                  title={presetError?.schema ? 'Run formation_presets migration to enable' : 'Apply a saved preset to this gameplan'}
                >
                  ↓ Apply Preset
                </button>
                <button
                  type="button"
                  className="gpb-toolbar-btn"
                  onClick={() => setPresetMgrOpen(true)}
                  title="Manage saved presets"
                >
                  ◊ Presets
                </button>
              </div>
            </>
          )}

          <div className="gpb-toolbar-spacer" />

          <button
            type="button"
            className="gpb-toolbar-btn ghost"
            onClick={resetCurrentFormation}
            title={`Reset bubbles in R${activeRotation} ${activeMode === 'serve' ? 'Serve' : 'Serve Receive'}`}
          >
            ↺ Reset
          </button>
          <span className={`gpb-status-pill ${allValid ? 'ok' : 'bad'}`}>
            {allValid ? '✓ LEGAL' : '✗ ILLEGAL'}
          </span>
          <button
            type="button"
            className="gpb-toolbar-btn ghost"
            onClick={() => setRosterCollapsed(c => !c)}
            title={rosterCollapsed ? 'Show roster' : 'Hide roster'}
          >
            {rosterCollapsed ? '▶ Roster' : '◀ Hide'}
          </button>
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
          <div className={`gpb-body${rosterCollapsed ? ' roster-collapsed' : ''}`}>
            {loading ? (
              <div className="gpb-loading">Loading plans…</div>
            ) : loadError ? (
              <GameplanLoadError error={loadError} onRetry={() => {
                setLoadError(null);
                setLoading(true);
                fetchPlans(game.id).then(({ data, error }) => {
                  if (error) {
                    setLoadError({ schema: isSchemaError(error), message: error.message || String(error) });
                    setLoading(false);
                    return;
                  }
                  const normalized = data.map(normalizePlan);
                  if (normalized.length === 0) {
                    const seed = makeNewPlan(team.id, game.id, 'Plan A', 0);
                    upsertPlan(seed).then(({ error: seedErr }) => {
                      if (seedErr) {
                        setLoadError({ schema: isSchemaError(seedErr), message: seedErr.message || String(seedErr) });
                      } else {
                        setPlans([seed]);
                        setActivePlanId(seed.id);
                      }
                      setLoading(false);
                    });
                  } else {
                    setPlans(normalized);
                    setActivePlanId(normalized[0].id);
                    setLoading(false);
                  }
                });
              }} />
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
                    assignedPlayers={effectiveLineup}
                    courtWidth={courtSize.width}
                    courtHeight={courtSize.height}
                    tooltipRef={tooltipRef}
                    tooltipTextRef={tooltipTextRef}
                  />
                </div>

                {!rosterCollapsed && (
                <aside className="gpb-roster">
                  <div className="gpb-roster-head">
                    <span>ROSTER</span>
                    <span className="gpb-roster-count">{onCourtIds.size}/6 in plan</span>
                  </div>

                  {/* Sub / libero chrome — gameplan & playground only. A scheme
                      is just the six role positions, so no subs/libero here. */}
                  {!isScheme && (<>
                  {/* FIVB sub counter + undo. Only regular subs count; libero
                      auto-swaps are unlimited and free. */}
                  <div className="gpb-sub-counter-bar">
                    <span className={`gpb-sub-counter${regularSubCount(activePlan) >= 6 ? ' is-full' : ''}`}>
                      Subs: <strong>{regularSubCount(activePlan)}</strong>/6
                    </span>
                    <button
                      type="button"
                      className="gpb-sub-undo"
                      onClick={undoLastSub}
                      disabled={(activePlan.sub_log || []).length === 0}
                      title="Undo last substitution"
                    >
                      ↶ Undo
                    </button>
                  </div>

                  {/* Dedicated Libero pairing panel — only shows when a
                      libero is on the roster. */}
                  <LiberoPairingPanel
                    roster={roster}
                    liberoPairs={activePlan.libero_pairs || {}}
                    liberoAuto={activePlan.libero_auto !== false}
                    playerById={playerById}
                    onSetPair={setLiberoPair}
                    onToggleAuto={toggleLiberoAuto}
                    onAutoDetect={autoDetectLibero}
                  />

                  {/* One-tap Pair Subs button — opens a popup with auto-detected
                      pairs and lets the coach swap any player. Existing pair
                      chips below give a quick at-a-glance view and a one-click
                      remove without re-opening the popup. */}
                  <div className="gpb-pair-bar">
                    <button
                      type="button"
                      className="gpb-pair-toggle"
                      onClick={openPairSubsPopup}
                      title="Auto-detect substitution pairs from positions"
                    >
                      ↔ Pair Subs
                    </button>
                    {(activePlan.subs || []).length > 0 && (
                      <div className="gpb-pair-chips">
                        {(activePlan.subs || []).map((pair, i) => {
                          const a = playerById[pair.a];
                          const b = playerById[pair.b];
                          if (!a || !b) return null;
                          return (
                            <span key={`${pair.a}::${pair.b}::${i}`} className="gpb-pair-chip">
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
                  </>)}

                  <div className="gpb-roster-hint">
                    {selectedRosterId
                      ? 'Click an empty or filled bubble on the court'
                      : isScheme
                      ? 'Click a name to arm placement · drag a row onto the court to change who fills a role'
                      : 'Click a name to arm placement · drag a row onto the court'}
                  </div>
                  <div className="gpb-roster-list">
                    {roster.length === 0 && (
                      <div className="gpb-roster-empty">No players on the roster yet.</div>
                    )}
                    {roster.map(p => {
                      const onCourt = onCourtIds.has(p.id);
                      const idx = (activePlan.assigned_players || []).indexOf(p.id);
                      const isSelected = selectedRosterId === p.id;
                      const pairs = findPairsForPlayer(activePlan, p.id);
                      // Find a generic pair partner who is currently on court
                      // so this bench player has a one-tap "SUB IN" target.
                      // Liberos are excluded — they auto-swap through libero_pairs
                      // and don't use the regular sub counter.
                      let subInIdx = -1;
                      const playerIsLibero = isLibero(p);
                      if (!onCourt && !playerIsLibero) {
                        for (const pair of pairs) {
                          const partnerPid = pairOpponent(pair, p.id);
                          if (!partnerPid) continue;
                          if (isLibero(playerById[partnerPid])) continue;
                          const partnerIdx = effectiveLineup.indexOf(partnerPid);
                          if (partnerIdx >= 0) { subInIdx = partnerIdx; break; }
                        }
                      }
                      const canSubIn = subInIdx >= 0 && canRegularSub(activePlan, subInIdx, p.id);
                      return (
                        <BenchRow
                          key={p.id}
                          player={p}
                          isOnCourt={onCourt}
                          isSelected={isSelected}
                          pairs={pairs}
                          playerById={playerById}
                          arrayIdx={idx}
                          plan={activePlan}
                          canSubIn={canSubIn}
                          subInIdx={subInIdx}
                          onSubIn={() => applyRegularSub(subInIdx, p.id)}
                          onClick={() => onRosterClick(p)}
                        />
                      );
                    })}
                  </div>
                </aside>
                )}
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

        {/* Apply Preset picker */}
        {applyPickerOpen && (
          <PresetApplyPicker
            presets={presets}
            error={presetError}
            onPick={applyPreset}
            onCancel={() => setApplyPickerOpen(false)}
            onCreate={() => { setApplyPickerOpen(false); setPresetEditing({}); }}
          />
        )}

        {/* Preset Manager */}
        {presetMgrOpen && (
          <PresetManager
            presets={presets}
            error={presetError}
            onClose={() => setPresetMgrOpen(false)}
            onCreate={() => { setPresetMgrOpen(false); setPresetEditing({}); }}
            onEdit={(p) => { setPresetMgrOpen(false); setPresetEditing(p); }}
            onDelete={(id) => removePreset(id)}
          />
        )}

        {/* Preset Editor — full-screen court with 6 role markers */}
        {presetEditing && (
          <PresetEditor
            initial={presetEditing}
            onCancel={() => setPresetEditing(null)}
            onSave={async (draft) => {
              const saved = await savePreset(draft);
              if (saved) setPresetEditing(null);
            }}
          />
        )}

        {/* One-tap Pair Subs popup */}
        {pairPopup && (
          <PairSubsPopup
            draft={pairPopup}
            setDraft={setPairPopup}
            roster={roster}
            playerById={playerById}
            onAutoDetect={regenerateAutoPairs}
            onCancel={() => setPairPopup(null)}
            onConfirm={confirmPairPopup}
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
  onRemovePlayer, onBubbleDragStart, assignedPlayers,
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

  // Effective on-court lineup (passed from parent — already includes regular
  // subs from the log and the current rotation's libero auto-swap).
  const assigned = assignedPlayers || activePlan?.assigned_players || [];

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

        {/* Subtle SVG connecting lines between paired players' bubble
            centers. Pointer-events disabled so the lines never intercept a
            drag or click. */}
        <PairLines
          subs={activePlan?.subs}
          positions={currentPositions}
          playerById={playerById}
          courtWidth={courtWidth}
          courtHeight={courtHeight}
        />

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

// ─── PairLines ───────────────────────────────────────────────────────────
// Renders a thin dashed line between each paired players' bubble center,
// in px so it follows live drag movement (positions prop is the same one
// CourtBubble uses).
//
// pointer-events: none on the <svg> so the lines never intercept clicks
// or drag handles on the bubbles below them.
function PairLines({ subs, positions, playerById, courtWidth, courtHeight }) {
  if (!subs?.length || !courtWidth || !courtHeight) return null;
  const lines = [];
  for (const pair of subs) {
    const a = positions[pair.a];
    const b = positions[pair.b];
    if (!a || !b) continue;
    const ax = (a.x / 100) * courtWidth;
    const ay = (a.y / 100) * courtHeight;
    const bx = (b.x / 100) * courtWidth;
    const by = (b.y / 100) * courtHeight;
    // Use the starter's array index (R1 column) to pick a palette match so
    // each pair gets a colour consistent with the bubble pair tint.
    const starter = pairStarter(pair, playerById);
    const idx = -1; // index isn't needed here — we just want a consistent shade
    void idx;
    lines.push(
      <line
        key={`${pair.a}::${pair.b}`}
        x1={ax} y1={ay} x2={bx} y2={by}
        stroke="rgba(255,255,255,0.32)"
        strokeWidth="1.5"
        strokeDasharray="4 6"
        strokeLinecap="round"
        data-starter={starter}
      />,
    );
  }
  if (lines.length === 0) return null;
  return (
    <svg
      className="gpb-pair-lines"
      width={courtWidth}
      height={courtHeight}
      style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}
      aria-hidden="true"
    >
      {lines}
    </svg>
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
  player, isOnCourt, isSelected, pairs, playerById,
  arrayIdx, plan, canSubIn, subInIdx, onSubIn, onClick,
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `bench-${player.id}`,
    data: { kind: 'bench', playerId: player.id, player },
    disabled: isOnCourt,
  });
  const libero = isLibero(player);
  const colorVars = colorVarsFor(player, arrayIdx, plan);
  // 1:N pair model — collect every partner of this player so we can render a
  // compact summary in the row meta line.
  const partners = (pairs || [])
    .map(p => playerById[pairOpponent(p, player.id)])
    .filter(Boolean);

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
      tabIndex={isOnCourt ? -1 : 0}
      aria-pressed={isSelected}
      className={[
        'gpb-bench-row',
        isOnCourt ? 'on-court' : '',
        isSelected ? 'selected' : '',
        libero ? 'libero' : '',
        isDragging ? 'is-dragging-row' : '',
      ].filter(Boolean).join(' ')}
      style={colorVars}
      onClick={onClick}
      onKeyDown={onKeyDown}
      {...listeners}
      {...attributes}
    >
      <span className="gpb-bench-dot" aria-hidden="true" />
      <div className="gpb-bench-num">{player.jersey_number || '?'}</div>
      <div className="gpb-bench-mid">
        <div className="gpb-bench-name">{player.name}</div>
        <div className="gpb-bench-meta">
          {[player.position, player.grade].filter(Boolean).join(' · ') || 'Player'}
          {partners.length === 1 && (
            <span className="gpb-bench-pair">↔ {lastNameOf(partners[0].name) || partners[0].name}</span>
          )}
          {partners.length > 1 && (
            <span className="gpb-bench-pair" title={partners.map(p => p.name).join(', ')}>
              ↔ {partners.length} subs
            </span>
          )}
        </div>
      </div>
      {libero && <div className="gpb-bench-libero" title="Libero">L</div>}
      {isOnCourt && <div className="gpb-bench-check" title="On court">✓</div>}
      {!isOnCourt && canSubIn && (
        <button
          type="button"
          className="gpb-bench-sub-in"
          onClick={(e) => {
            e.stopPropagation();
            onSubIn?.();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          title={`Sub in for player at slot ${subInIdx + 1}`}
        >
          SUB IN
        </button>
      )}
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

// ─── PairSubsPopup ─────────────────────────────────────────────────────────
//
// One-tap pair editor. The popup opens pre-loaded with either:
//   • the coach's existing pairs (so opening never wipes work), or
//   • auto-detected pairs from roster positions (if no pairs exist yet).
//
// Each pair card shows the FRONT-ROW starter on the left and the BACK-ROW
// sub on the right. Tapping either name opens a player picker — the coach
// can swap any side without exiting the popup. "↺ Auto" regenerates the
// list from positions; "+ Add Pair" appends a blank pair to fill in manually.
function PairSubsPopup({ draft, setDraft, roster, playerById, onAutoDetect, onCancel, onConfirm }) {
  const [picker, setPicker] = useState(null); // { pairIdx, side: 'a'|'b' }

  function frontBack(pair) {
    const starter = pairStarter(pair, playerById);
    if (pair.a === starter) return { frontSide: 'a', backSide: 'b' };
    return { frontSide: 'b', backSide: 'a' };
  }
  function setPlayer(pairIdx, side, pid) {
    setDraft(prev => prev.map((p, i) => i === pairIdx ? { ...p, [side]: pid } : p));
    setPicker(null);
  }
  function removePair(pairIdx) {
    setDraft(prev => prev.filter((_, i) => i !== pairIdx));
  }
  function addPair() {
    setDraft(prev => [...prev, { a: null, b: null }]);
  }

  return (
    <div className="gpb-sub-overlay" onClick={onCancel}>
      <div className="gpb-pair-popup" onClick={e => e.stopPropagation()}>
        <div className="gpb-sub-head">
          <div className="gpb-sub-eyebrow">SUBSTITUTION PAIRS</div>
          <div className="gpb-sub-title">
            Tap any name to swap · <span className="gpb-pair-popup-sub">auto-detected from positions</span>
          </div>
        </div>

        <div className="gpb-pair-popup-body">
          {draft.length === 0 && (
            <div className="gpb-pair-popup-empty">
              No pairs yet. Place players on the court, then tap <strong>↺ Auto-detect</strong>
              {' '}— or use <strong>+ Add Pair</strong> to build one manually.
            </div>
          )}
          {draft.map((pair, i) => {
            const { frontSide, backSide } = frontBack(pair);
            const frontPid = pair[frontSide];
            const backPid  = pair[backSide];
            const front = frontPid ? playerById[frontPid] : null;
            const back  = backPid  ? playerById[backPid]  : null;
            return (
              <div key={i} className="gpb-pair-card">
                <div className="gpb-pair-card-side gpb-pair-card-front">
                  <div className="gpb-pair-card-label">FRONT ROW</div>
                  <button
                    type="button"
                    className={`gpb-pair-card-player${!front ? ' is-empty' : ''}`}
                    onClick={() => setPicker({ pairIdx: i, side: frontSide })}
                  >
                    {front ? (
                      <>
                        <span className="gpb-pair-card-num">#{front.jersey_number || '?'}</span>
                        <span className="gpb-pair-card-name">{front.name}</span>
                        <span className="gpb-pair-card-pos">{front.position || 'Player'}</span>
                      </>
                    ) : (
                      <span className="gpb-pair-card-pick">Pick a player</span>
                    )}
                  </button>
                </div>
                <div className="gpb-pair-card-arrow">↔</div>
                <div className="gpb-pair-card-side gpb-pair-card-back">
                  <div className="gpb-pair-card-label">BACK ROW</div>
                  <button
                    type="button"
                    className={`gpb-pair-card-player${!back ? ' is-empty' : ''}`}
                    onClick={() => setPicker({ pairIdx: i, side: backSide })}
                  >
                    {back ? (
                      <>
                        <span className="gpb-pair-card-num">#{back.jersey_number || '?'}</span>
                        <span className="gpb-pair-card-name">{back.name}</span>
                        <span className="gpb-pair-card-pos">{back.position || 'Player'}</span>
                      </>
                    ) : (
                      <span className="gpb-pair-card-pick">Pick a player</span>
                    )}
                  </button>
                </div>
                <button
                  type="button"
                  className="gpb-pair-card-remove"
                  onClick={() => removePair(i)}
                  aria-label="Remove pair"
                  title="Remove pair"
                >×</button>
              </div>
            );
          })}
        </div>

        <div className="gpb-pair-popup-tools">
          <button type="button" className="gpb-pair-popup-btn ghost" onClick={onAutoDetect}>
            ↺ Auto-detect
          </button>
          <button type="button" className="gpb-pair-popup-btn ghost" onClick={addPair}>
            + Add Pair
          </button>
        </div>

        <div className="gpb-sub-actions">
          <button type="button" className="gpb-sub-btn gpb-sub-cancel" onClick={onCancel}>Cancel</button>
          <button type="button" className="gpb-sub-btn gpb-sub-confirm" onClick={onConfirm}>Confirm Pairs</button>
        </div>

        {picker && (
          <PairPlayerPicker
            roster={roster}
            currentPid={draft[picker.pairIdx]?.[picker.side]}
            onPick={(pid) => setPlayer(picker.pairIdx, picker.side, pid)}
            onClose={() => setPicker(null)}
          />
        )}
      </div>
    </div>
  );
}

function PairPlayerPicker({ roster, currentPid, onPick, onClose }) {
  return (
    <div className="gpb-pair-picker-overlay" onClick={onClose}>
      <div className="gpb-pair-picker" onClick={e => e.stopPropagation()}>
        <div className="gpb-pair-picker-head">Pick a player</div>
        <div className="gpb-pair-picker-list">
          {roster.map(p => (
            <button
              key={p.id}
              type="button"
              className={`gpb-pair-picker-item${p.id === currentPid ? ' selected' : ''}`}
              onClick={() => onPick(p.id)}
            >
              <span className="gpb-pair-picker-num">#{p.jersey_number || '?'}</span>
              <span className="gpb-pair-picker-name">{p.name}</span>
              <span className="gpb-pair-picker-pos">{p.position || ''}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── PlaygroundHeaderEditor ─────────────────────────────────────────────────
// Inline-editable session name in playground mode. Click to edit, Enter or
// blur to commit, Escape to revert.
function PlaygroundHeaderEditor({ name, onCommit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  function startEdit() {
    setDraft(name);
    setEditing(true);
  }
  function commit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) onCommit(trimmed);
    setEditing(false);
  }
  if (editing) {
    return (
      <input
        autoFocus
        className="gpb-head-title-input"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') { setEditing(false); }
        }}
        maxLength={80}
      />
    );
  }
  return (
    <button
      type="button"
      className="gpb-head-title gpb-head-title-btn"
      onClick={startEdit}
      title="Click to rename this session"
    >
      {name}
      <span className="gpb-head-title-edit">✎</span>
    </button>
  );
}

// ─── GameplanLoadError ─────────────────────────────────────────────────────
//
// Replaces the prior "saving locally" silent fallback. Tells the coach what
// failed and — for the common case of a missing column/table — gives them a
// one-click path to the Supabase SQL editor where the migration lives.
function GameplanLoadError({ error, onRetry }) {
  const SQL_EDITOR_URL = 'https://supabase.com/dashboard/project/eelsooiqhzwyzdoccefe/sql/new';
  return (
    <div className="gpb-load-error">
      <div className="gpb-load-error-card">
        <div className="gpb-load-error-eyebrow">CAN'T SAVE TO SUPABASE</div>
        <h2 className="gpb-load-error-title">
          {error.schema
            ? 'Gameplan table needs migration'
            : 'Could not reach the gameplan database'}
        </h2>
        <p className="gpb-load-error-body">
          {error.schema ? (
            <>
              The <code>game_plans</code> table is missing one or more columns
              the app writes. Run <code>scripts/game_plans_migration.sql</code>
              {' '}once in the Supabase SQL editor — the script is idempotent so
              re-running is safe.
            </>
          ) : (
            <>Supabase returned an error before any data could be saved. We are
            <strong> not </strong>silently falling back to local storage —
            retry below once the connection is restored.</>
          )}
        </p>
        {error.message && (
          <pre className="gpb-load-error-msg">{error.message}</pre>
        )}
        <div className="gpb-load-error-actions">
          {error.schema && (
            <a
              className="gpb-load-error-btn primary"
              href={SQL_EDITOR_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Supabase SQL editor →
            </a>
          )}
          <button type="button" className="gpb-load-error-btn" onClick={onRetry}>
            Retry connection
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── LiberoPairingPanel ─────────────────────────────────────────────────────
//
// Dedicated UI for the libero ↔ middle-blocker coverage. Shown only when at
// least one libero is on the roster.
//
// Each libero gets two slots: "MB Pair 1" and "MB Pair 2". An empty slot is
// a tap target that opens a picker filtered to middle blockers. Filled slots
// show #jersey · last-name with an "×" to clear.
//
// The header carries:
//   • "↺ Auto" — fill the slots from on-court MBs (autoDetectLiberoPairs)
//   • A toggle switch "Auto-swap" — when ON, effectiveLineupAt puts the
//     libero on the court in any rotation where a paired MB is in the back
//     row. When OFF, the libero stays off until the coach turns it back on.
function LiberoPairingPanel({ roster, liberoPairs, liberoAuto, playerById, onSetPair, onToggleAuto, onAutoDetect }) {
  const [picker, setPicker] = useState(null); // { liberoId, slot }
  const liberos = roster.filter(isLibero);
  const mbsOnly = roster.filter(p => ['MB', 'MH', 'M'].includes((p.position || '').toUpperCase().trim()));
  if (liberos.length === 0) return null;
  return (
    <div className="gpb-libero-panel">
      <div className="gpb-libero-head">
        <div className="gpb-libero-eyebrow">LIBERO PAIRING</div>
        <div className="gpb-libero-tools">
          <button
            type="button"
            className="gpb-libero-tool"
            onClick={onAutoDetect}
            title="Auto-pair libero with the on-court middle blockers"
          >
            ↺ Auto
          </button>
          <label className="gpb-libero-toggle" title={liberoAuto ? 'Auto-swap on — libero enters/exits as MB rotates' : 'Auto-swap off — libero stays off the court'}>
            <input type="checkbox" checked={liberoAuto} onChange={onToggleAuto} />
            <span className="gpb-libero-toggle-track"><span className="gpb-libero-toggle-thumb" /></span>
            <span className="gpb-libero-toggle-label">Auto-swap</span>
          </label>
        </div>
      </div>

      {liberos.map(lib => {
        const slots = (liberoPairs[lib.id] || [null, null]).slice(0, 2);
        while (slots.length < 2) slots.push(null);
        return (
          <div key={lib.id} className="gpb-libero-row">
            <div className="gpb-libero-name">
              <span className="gpb-libero-num">#{lib.jersey_number || '?'}</span>
              <span className="gpb-libero-fullname">{lib.name}</span>
            </div>
            <div className="gpb-libero-slots">
              {[0, 1].map(slot => {
                const mbPid = slots[slot];
                const mb = mbPid ? playerById[mbPid] : null;
                return (
                  <div key={slot} className={`gpb-libero-slot${mb ? ' filled' : ''}`}>
                    <div className="gpb-libero-slot-label">MB Pair {slot + 1}</div>
                    <button
                      type="button"
                      className="gpb-libero-slot-btn"
                      onClick={() => setPicker({ liberoId: lib.id, slot })}
                    >
                      {mb ? (
                        <>
                          <span className="gpb-libero-slot-num">#{mb.jersey_number || '?'}</span>
                          <span className="gpb-libero-slot-name">{lastNameOf(mb.name) || mb.name}</span>
                        </>
                      ) : (
                        <span className="gpb-libero-slot-pick">+ Pick MB</span>
                      )}
                    </button>
                    {mb && (
                      <button
                        type="button"
                        className="gpb-libero-slot-x"
                        onClick={() => onSetPair(lib.id, slot, null)}
                        title="Clear"
                        aria-label="Clear MB pair"
                      >×</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {picker && (
        <PairPlayerPicker
          roster={mbsOnly.length > 0 ? mbsOnly : roster}
          currentPid={(liberoPairs[picker.liberoId] || [])[picker.slot]}
          onPick={(pid) => {
            onSetPair(picker.liberoId, picker.slot, pid);
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

// ─── Preset components ──────────────────────────────────────────────────────

// Apply picker — pick a saved preset to slot into the active gameplan.
function PresetApplyPicker({ presets, error, onPick, onCancel, onCreate }) {
  const SQL_URL = 'https://supabase.com/dashboard/project/eelsooiqhzwyzdoccefe/sql/new';
  return (
    <div className="gpb-sub-overlay" onClick={onCancel}>
      <div className="gpb-preset-popup" onClick={e => e.stopPropagation()}>
        <div className="gpb-sub-head">
          <div className="gpb-sub-eyebrow">APPLY PRESET</div>
          <div className="gpb-sub-title">Pick a formation template</div>
        </div>
        <div className="gpb-preset-body">
          {error?.schema ? (
            <div className="gpb-preset-error">
              The <code>formation_presets</code> table doesn't exist yet. Run{' '}
              <code>scripts/formation_presets_migration.sql</code> in the{' '}
              <a href={SQL_URL} target="_blank" rel="noopener noreferrer">Supabase SQL editor</a>.
            </div>
          ) : presets.length === 0 ? (
            <div className="gpb-preset-empty">
              No presets yet. <button type="button" className="gpb-preset-link" onClick={onCreate}>Build your first one</button>
            </div>
          ) : (
            <div className="gpb-preset-list">
              {presets.map(p => (
                <button key={p.id} type="button" className="gpb-preset-item" onClick={() => onPick(p)}>
                  <span className="gpb-preset-item-name">{p.name}</span>
                  <span className="gpb-preset-item-arrow">Apply →</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="gpb-sub-actions">
          <button type="button" className="gpb-sub-btn gpb-sub-cancel" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// Manager — list/create/edit/delete presets.
function PresetManager({ presets, error, onClose, onCreate, onEdit, onDelete, templates = [], onUseTemplate }) {
  const SQL_URL = 'https://supabase.com/dashboard/project/eelsooiqhzwyzdoccefe/sql/new';
  return (
    <div className="gpb-sub-overlay" onClick={onClose}>
      <div className="gpb-preset-popup" onClick={e => e.stopPropagation()}>
        <div className="gpb-sub-head">
          <div className="gpb-sub-eyebrow">FORMATION PRESETS</div>
          <div className="gpb-sub-title">Reusable formation templates</div>
        </div>
        <div className="gpb-preset-body">
          {templates.length > 0 && (
            <div className="gpb-preset-section">
              <div className="gpb-preset-group-label">
                Templates
                <span className="gpb-preset-group-hint">Start from a system</span>
              </div>
              <div className="gpb-preset-templates">
                {templates.map(t => (
                  <button
                    key={t.key}
                    type="button"
                    className="gpb-preset-template"
                    onClick={() => onUseTemplate && onUseTemplate(t)}
                    title={`Open the ${t.name} system in the editor, then Save As your own scheme`}
                  >
                    <span className="gpb-preset-template-badge">{t.name}</span>
                    <span className="gpb-preset-template-text">
                      <span className="gpb-preset-template-sub">{t.subtitle}</span>
                      <span className="gpb-preset-template-desc">{t.description}</span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="gpb-preset-group-label gpb-preset-group-label-saved">Your schemes</div>
            </div>
          )}
          {error?.schema ? (
            <div className="gpb-preset-error">
              The <code>formation_presets</code> table doesn't exist yet. Run{' '}
              <code>scripts/formation_presets_migration.sql</code> in the{' '}
              <a href={SQL_URL} target="_blank" rel="noopener noreferrer">Supabase SQL editor</a>.
            </div>
          ) : presets.length === 0 ? (
            <div className="gpb-preset-empty">
              No presets yet. Click <strong>+ New Preset</strong> below to draw up your first template.
            </div>
          ) : (
            <div className="gpb-preset-list">
              {presets.map(p => (
                <div key={p.id} className="gpb-preset-row">
                  <button type="button" className="gpb-preset-row-main" onClick={() => onEdit(p)}>
                    <span className="gpb-preset-item-name">{p.name}</span>
                    <span className="gpb-preset-item-meta">
                      {p.updated_at ? `Updated ${new Date(p.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Just created'}
                    </span>
                  </button>
                  <button type="button" className="gpb-preset-row-action danger" title="Delete preset" onClick={() => onDelete(p.id)}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="gpb-sub-actions">
          <button type="button" className="gpb-sub-btn gpb-sub-cancel" onClick={onClose}>Close</button>
          <button type="button" className="gpb-sub-btn gpb-sub-confirm" onClick={onCreate} disabled={!!error?.schema}>+ New Preset</button>
        </div>
      </div>
    </div>
  );
}

// Editor — 6 role markers on the court, drag to define each rotation × mode.
const PRESET_ROLES = ['S', 'OH1', 'OH2', 'MB1', 'MB2', 'OPP'];
const PRESET_ROLE_LABELS = {
  S: 'Setter', OH1: 'Outside 1', OH2: 'Outside 2',
  MB1: 'Middle 1', MB2: 'Middle 2', OPP: 'Opposite',
};
// Role marker colors — solid distinct hues so the coach can tell them apart.
const PRESET_ROLE_COLORS = {
  S:   '#fbbf24',
  OH1: '#38bdf8',
  OH2: '#0ea5e9',
  MB1: '#34d399',
  MB2: '#10b981',
  OPP: '#c084fc',
};

function PresetEditor({ initial, onCancel, onSave }) {
  const isNew = !initial?.id;
  const [name, setName] = useState(initial?.name || 'New Preset');
  const [rot, setRot] = useState(1);
  const [mode, setMode] = useState('serve');
  // rotations: { 1: { serve: { S: {x,y}, ... }, receive: {...} }, ... }
  const [rotations, setRotations] = useState(() => {
    const seed = initial?.rotations || {};
    const out = {};
    for (let r = 1; r <= 6; r++) {
      const stored = seed[r] || {};
      const serve = { ...stored.serve };
      const receive = { ...stored.receive };
      PRESET_ROLES.forEach((m, idx) => {
        if (!serve[m]) serve[m] = defaultPositionFor(idx, r);
        if (!receive[m]) receive[m] = defaultPositionFor(idx, r);
      });
      out[r] = { serve, receive };
    }
    return out;
  });

  const courtRef = useRef(null);
  const dragRef = useRef(null); // { marker, offsetX, offsetY, courtRect, halfW, halfH }

  function setMarkerPosition(marker, x, y) {
    setRotations(prev => ({
      ...prev,
      [rot]: {
        ...prev[rot],
        [mode]: { ...prev[rot][mode], [marker]: { x, y } },
      },
    }));
  }

  function onPointerDown(e, marker) {
    const el = e.currentTarget;
    const courtEl = courtRef.current;
    if (!courtEl) return;
    e.preventDefault();
    const courtRect = courtEl.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    dragRef.current = {
      marker,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      halfW: rect.width / 2,
      halfH: rect.height / 2,
      courtRect,
    };
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }
  function onPointerMove(e) {
    const d = dragRef.current;
    if (!d) return;
    const { courtRect, offsetX, offsetY, halfW, halfH, marker } = d;
    const visualLeft = e.clientX - courtRect.left - offsetX;
    const visualTop  = e.clientY - courtRect.top  - offsetY;
    const cx = visualLeft + halfW;
    const cy = visualTop  + halfH;
    const xPct = Math.max(6, Math.min(94, (cx / courtRect.width)  * 100));
    const yPct = Math.max(8, Math.min(92, (cy / courtRect.height) * 100));
    setMarkerPosition(marker, xPct, yPct);
  }
  function onPointerUp() { dragRef.current = null; }

  function canSave() { return name.trim().length > 0; }
  function handleSave() {
    onSave({
      id: initial?.id,
      name: name.trim() || 'New Preset',
      rotations,
      is_default: !!initial?.is_default,
    });
  }

  const positions = rotations[rot][mode];

  return (
    <div className="gpb-sub-overlay" onClick={onCancel}>
      <div className="gpb-preset-editor" onClick={e => e.stopPropagation()}>
        <div className="gpb-sub-head">
          <div className="gpb-sub-eyebrow">{isNew ? 'NEW PRESET' : 'EDIT PRESET'}</div>
          <input
            className="gpb-preset-name-input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Preset name (e.g. 5-1 Base)"
            maxLength={64}
            autoFocus={isNew}
          />
        </div>

        <div className="gpb-preset-editor-toolbar">
          <div className="gpb-toolbar-group gpb-toolbar-rots">
            {[1,2,3,4,5,6].map(r => (
              <button
                key={r}
                type="button"
                className={`gpb-rot-btn${r === rot ? ' active' : ''}`}
                onClick={() => setRot(r)}
              >R{r}</button>
            ))}
          </div>
          <div className="gpb-toolbar-sep" aria-hidden="true" />
          <div className="gpb-toolbar-group gpb-toolbar-mode">
            <button
              type="button"
              className={`gpb-mode-btn${mode === 'serve' ? ' active' : ''}`}
              onClick={() => setMode('serve')}
            >Serve</button>
            <button
              type="button"
              className={`gpb-mode-btn${mode === 'receive' ? ' active' : ''}`}
              onClick={() => setMode('receive')}
            >Serve Receive</button>
          </div>
        </div>

        <div
          ref={courtRef}
          className="gpb-preset-court"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="gpb-court-net" />
          <div className="gpb-court-row-label gpb-court-row-front">FRONT ROW · NET</div>
          <div className="gpb-court-row-label gpb-court-row-back">BACK ROW</div>
          {PRESET_ROLES.map(marker => {
            const p = positions[marker];
            return (
              <div
                key={marker}
                className="gpb-preset-marker"
                style={{
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  background: PRESET_ROLE_COLORS[marker],
                }}
                onPointerDown={(e) => onPointerDown(e, marker)}
                title={`${PRESET_ROLE_LABELS[marker]} — drag to set R${rot} ${mode === 'serve' ? 'serve' : 'receive'} position`}
              >
                {marker}
              </div>
            );
          })}
        </div>

        <div className="gpb-sub-actions">
          <button type="button" className="gpb-sub-btn gpb-sub-cancel" onClick={onCancel}>Cancel</button>
          <button type="button" className="gpb-sub-btn gpb-sub-confirm" onClick={handleSave} disabled={!canSave()}>
            {isNew ? 'Save Preset' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Named exports so the RotationPal dashboard can drive the preset library
// (SCHEMES card) with the exact same UI + persistence the modal uses.
export { PresetManager, PresetEditor, fetchPresets, upsertPreset, deletePreset };
