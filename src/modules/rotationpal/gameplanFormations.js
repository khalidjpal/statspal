// ============================================================
// Per-rotation formation defaults for gameplans / live court.
//
// Each rotation has TWO position sets:
//   serve   — where players stand when *we* are serving (rotation pattern)
//   receive — where players stand when *receiving* serve (W formation)
//
// All coordinates are 0–100 within our half of the court. The net is at y=0,
// the back endline at y=100.
// ============================================================

export const SLOTS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']

// "Pretty" rotation positions used by the sandbox + live court when serving.
// These match the standard 6-zone arrangement that the rest of the module
// already uses.
export const SERVE_ROT_COORDS = {
  P4: { x: 18, y: 28 }, P3: { x: 50, y: 28 }, P2: { x: 82, y: 28 },
  P5: { x: 18, y: 74 }, P6: { x: 50, y: 74 }, P1: { x: 82, y: 74 },
}

// Setter slot per rotation in a 5-1 (matches serveReceive.js).
const SETTER_SLOT_PER_ROTATION = {
  1: 'P1', 2: 'P6', 3: 'P5', 4: 'P4', 5: 'P3', 6: 'P2',
}

// Default 3-passer W serve-receive formation per rotation.
//
// Three passers spread across the back row in a W shape, the setter tucked
// near the right side of the net ready to set, and the two non-setter front-
// row players hide tight to the net for offense. The exact slot identity that
// holds each role rotates from rotation to rotation.
//
// Strategy:
//   1. Start from the standard rotation positions (so overlap is legal).
//   2. Move the setter to a release point near the right side of the net.
//   3. Spread the three back-row players into a W (deep middle, shallow wings).
//   4. Tuck the front-row non-setters at the net (shallow x, y near the net).
function makeReceiveDefault(rotation) {
  const setterSlot = SETTER_SLOT_PER_ROTATION[rotation]
  const out = {}

  // Wing/centre passing zones in the back court. We set these on whichever
  // back-row slots are NOT the setter (when setter is in the back row).
  // Three-passer W coords (deep middle, two shallow corners).
  const W = {
    leftWing:  { x: 18, y: 60 },
    middle:    { x: 50, y: 70 },
    rightWing: { x: 82, y: 60 },
  }

  // Front-row hide zones tight to the net for offense.
  const HIDE = {
    left:   { x: 14, y: 16 },
    middle: { x: 50, y: 12 },
    right:  { x: 82, y: 16 },
  }

  // Setter release point — right of centre, just back from the net.
  const SETTER_FRONT = { x: 72, y: 14 }
  const SETTER_BACK  = { x: 78, y: 32 }   // setter tucked back-right when behind the 10ft line

  // Map slot → role on this rotation. We only need to know:
  //   - which slot is the setter (so we tuck them)
  //   - whether the slot is front row (hide) or back row (pass)
  // Front: P4 P3 P2.  Back: P5 P6 P1.
  for (const slot of SLOTS) {
    const isFront = ['P2', 'P3', 'P4'].includes(slot)
    if (slot === setterSlot) {
      out[slot] = isFront ? SETTER_FRONT : SETTER_BACK
      continue
    }
    if (isFront) {
      // Two non-setter front row players hide.
      // Use slot left/right/middle based on slot identity.
      out[slot] = slot === 'P4' ? HIDE.left : slot === 'P3' ? HIDE.middle : HIDE.right
    } else {
      // Back row passers in W shape. Map P5→leftWing, P6→middle, P1→rightWing.
      out[slot] = slot === 'P5' ? W.leftWing : slot === 'P6' ? W.middle : W.rightWing
    }
  }
  return out
}

// All-rotation defaults: { 1: { serve, receive }, ..., 6: { serve, receive } }.
export function makeDefaultFormations() {
  const out = {}
  for (let r = 1; r <= 6; r++) {
    out[r] = {
      serve: cloneCoords(SERVE_ROT_COORDS),
      receive: makeReceiveDefault(r),
    }
  }
  return out
}

// Default for a single rotation/mode.
export function defaultFormationFor(rotation, mode) {
  if (mode === 'serve') return cloneCoords(SERVE_ROT_COORDS)
  return makeReceiveDefault(rotation)
}

// Backfill any missing rotations / modes / slots in an existing formations
// object. Keeps user customisations, fills in defaults where blank. Never
// mutates the input.
export function ensureFormations(formations) {
  const out = {}
  for (let r = 1; r <= 6; r++) {
    const incoming = (formations && formations[r]) || {}
    out[r] = {
      serve:   fillSlots(incoming.serve, SERVE_ROT_COORDS),
      receive: fillSlots(incoming.receive, makeReceiveDefault(r)),
    }
  }
  return out
}

function fillSlots(incoming, defaults) {
  const out = {}
  for (const s of SLOTS) {
    const v = incoming && incoming[s]
    out[s] = (v && typeof v.x === 'number' && typeof v.y === 'number') ? v : defaults[s]
  }
  return out
}

function cloneCoords(map) {
  const out = {}
  for (const s of SLOTS) out[s] = { ...map[s] }
  return out
}
