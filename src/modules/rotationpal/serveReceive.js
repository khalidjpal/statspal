// ============================================================
// Serve receive plays — per-rotation options.
//
// Hard rule: the setter NEVER passes. In every option the setter
// starts tucked near their overlap-legal spot and an arrow shows
// them releasing to the target at the net.
//
// Coordinates are 0..100 within our half of the court.
// y = 0 is the net, y = 100 is the back endline.
// ============================================================

const SLOTS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']

// Standard 5-1 setter slot per rotation (setter starts at P1 in rotation 1
// and moves P1 → P6 → P5 → P4 → P3 → P2 as the team side-outs).
export const SETTER_SLOT_PER_ROTATION = {
  1: 'P1', 2: 'P6', 3: 'P5', 4: 'P4', 5: 'P3', 6: 'P2',
}

// Libero typically replaces whichever middle is currently in the back row.
// Based on the canonical 5-1 stack (MB1 starts P2, MB2 starts P5).
export const LIBERO_SLOT_PER_ROTATION = {
  1: 'P5', 2: 'P1', 3: 'P6', 4: 'P5', 5: 'P1', 6: 'P6',
}

// The setter always releases to this point at the net (right of center,
// slightly off the antenna — the traditional setter target).
export const SETTER_TARGET = { x: 72, y: 6 }

// ============================================================
// Authoring DSL
// kind codes:
//   p  = passer
//   l  = libero (primary passer, highlighted)
//   s  = setter (hidden, arrow to release)
//   mb = middle blocker hide (arrow to attack approach)
//   h  = other hider (OH / OPP hiding for offense, arrow to approach)
// Each spec is [x, y, kind, approachX?, approachY?]
// ============================================================
function slot([x, y, kind, ax, ay]) {
  const base = { x, y, kind }
  if (kind === 'p') base.passer = true
  else if (kind === 'l') { base.passer = true; base.libero = true }
  else if (kind === 's') base.setter = true
  else if (kind === 'mb') base.mbHide = true
  else if (kind === 'h') base.hide = true
  if (ax != null && ay != null) base.approach = { x: ax, y: ay }
  return base
}

function makePlay(id, rotation, label, description, spec) {
  const positions = {}
  for (const s of SLOTS) positions[s] = slot(spec[s])
  return {
    id, rotation, label, description, positions,
    setterSlot: SETTER_SLOT_PER_ROTATION[rotation],
    liberoSlot: LIBERO_SLOT_PER_ROTATION[rotation],
    builtin: true,
  }
}

// ============================================================
// ROTATION 1  —  Setter @ P1 (back right)
// Front: P4 (OPP), P3 (OH1), P2 (MB1)
// Back:  P5 (L, replacing MB2),  P6 (OH2),  P1 (S)
// ============================================================
const R1 = [
  makePlay('r1-4p-w', 1, '4-Passer W',
    'Libero, both OHs, and OPP pass a W shape. Setter hides back-right and releases; MB1 hides at the net for a quick attack.',
    {
      P1: [88, 26, 's', SETTER_TARGET.x, SETTER_TARGET.y],
      P2: [78, 10, 'mb', 80, 24],
      P3: [46, 42, 'p'],
      P4: [18, 44, 'p'],
      P5: [28, 68, 'l'],
      P6: [62, 72, 'p'],
    }
  ),
  makePlay('r1-3p-loh', 1, '3-Passer (L + 2 OH)',
    'Libero and both outside hitters take all serves. Setter, MB, and opposite hide for aggressive offense.',
    {
      P1: [88, 24, 's', SETTER_TARGET.x, SETTER_TARGET.y],
      P2: [78, 10, 'mb', 80, 24],
      P3: [42, 46, 'p'],
      P4: [18, 18, 'h', 20, 28],
      P5: [26, 66, 'l'],
      P6: [64, 72, 'p'],
    }
  ),
  makePlay('r1-2p', 1, '2-Passer (L + OH)',
    'Libero and back-row OH cover the entire court. Front-row OH, OPP, MB, and setter are all hidden to hit.',
    {
      P1: [88, 22, 's', SETTER_TARGET.x, SETTER_TARGET.y],
      P2: [78, 10, 'mb', 80, 24],
      P3: [42, 16, 'h', 44, 26],
      P4: [18, 16, 'h', 20, 28],
      P5: [22, 60, 'l'],
      P6: [58, 72, 'p'],
    }
  ),
]

// ============================================================
// ROTATION 2  —  Setter @ P6 (back middle)
// Front: P4 (MB2), P3 (OPP), P2 (OH1)
// Back:  P5 (OH2), P6 (S),   P1 (L, replacing MB1)
// ============================================================
const R2 = [
  makePlay('r2-4p-w', 2, '4-Passer W',
    'Libero, both OHs, and OPP pass. Setter sneaks out from middle-back; MB2 hides at net for a quick.',
    {
      P1: [82, 68, 'l'],
      P2: [76, 42, 'p'],
      P3: [48, 42, 'p'],
      P4: [22, 10, 'mb', 24, 24],
      P5: [26, 70, 'p'],
      P6: [54, 28, 's', SETTER_TARGET.x, SETTER_TARGET.y],
    }
  ),
  makePlay('r2-3p-loh', 2, '3-Passer (L + 2 OH)',
    'Libero and the two outsides pass. Setter releases from middle-back; MB and opposite hide.',
    {
      P1: [84, 66, 'l'],
      P2: [76, 42, 'p'],
      P3: [50, 14, 'h', 52, 26],
      P4: [22, 10, 'mb', 24, 24],
      P5: [28, 68, 'p'],
      P6: [52, 30, 's', SETTER_TARGET.x, SETTER_TARGET.y],
    }
  ),
  makePlay('r2-2p', 2, '2-Passer (L + OH)',
    'Libero and back-row OH cover the court. Setter runs from middle-back; everyone else hides.',
    {
      P1: [86, 62, 'l'],
      P2: [76, 16, 'h', 78, 26],
      P3: [50, 14, 'h', 52, 26],
      P4: [22, 10, 'mb', 24, 24],
      P5: [26, 64, 'p'],
      P6: [50, 34, 's', SETTER_TARGET.x, SETTER_TARGET.y],
    }
  ),
]

// ============================================================
// ROTATION 3  —  Setter @ P5 (back left)
// Front: P4 (OH2), P3 (MB2), P2 (OPP)
// Back:  P5 (S),   P6 (L, replacing MB1),  P1 (OH1)
// ============================================================
const R3 = [
  makePlay('r3-4p-w', 3, '4-Passer W',
    'Libero, OH1, OH2, and OPP pass. Setter releases from back-left (long run); MB2 hides at net.',
    {
      P1: [76, 66, 'p'],
      P2: [78, 42, 'p'],
      P3: [48, 10, 'mb', 50, 24],
      P4: [22, 44, 'p'],
      P5: [16, 30, 's', SETTER_TARGET.x, SETTER_TARGET.y],
      P6: [50, 70, 'l'],
    }
  ),
  makePlay('r3-3p-loh', 3, '3-Passer (L + 2 OH)',
    'Libero and both outsides cover. OPP and MB hide; setter runs from back-left.',
    {
      P1: [78, 68, 'p'],
      P2: [78, 16, 'h', 80, 26],
      P3: [48, 10, 'mb', 50, 24],
      P4: [22, 44, 'p'],
      P5: [16, 32, 's', SETTER_TARGET.x, SETTER_TARGET.y],
      P6: [50, 72, 'l'],
    }
  ),
  makePlay('r3-2p', 3, '2-Passer (L + OH)',
    'Libero and back-row OH handle the serve. Front row is free to attack.',
    {
      P1: [76, 62, 'p'],
      P2: [78, 16, 'h', 80, 26],
      P3: [48, 10, 'mb', 50, 24],
      P4: [22, 16, 'h', 24, 26],
      P5: [18, 36, 's', SETTER_TARGET.x, SETTER_TARGET.y],
      P6: [50, 68, 'l'],
    }
  ),
]

// ============================================================
// ROTATION 4  —  Setter @ P4 (front left)
// Front: P4 (S),   P3 (OH2), P2 (MB2)
// Back:  P5 (L, replacing MB1), P6 (OH1), P1 (OPP)
// Setter is already in the front row — just slide to the target.
// ============================================================
const R4 = [
  makePlay('r4-4p-w', 4, '4-Passer W',
    'Libero, both OHs, and back-row OPP pass. Setter slides along the net from P4 to the target; MB2 hides.',
    {
      P1: [78, 66, 'p'],
      P2: [80, 10, 'mb', 82, 24],
      P3: [46, 42, 'p'],
      P4: [22, 10, 's', SETTER_TARGET.x, SETTER_TARGET.y],
      P5: [28, 68, 'l'],
      P6: [60, 72, 'p'],
    }
  ),
  makePlay('r4-3p-loh', 4, '3-Passer (L + 2 OH)',
    'Libero and both outsides cover the court. Setter slides from front-left; OPP hides to hit.',
    {
      P1: [80, 16, 'h', 82, 26],
      P2: [80, 10, 'mb', 82, 24],
      P3: [46, 42, 'p'],
      P4: [22, 10, 's', SETTER_TARGET.x, SETTER_TARGET.y],
      P5: [26, 68, 'l'],
      P6: [60, 72, 'p'],
    }
  ),
  makePlay('r4-2p', 4, '2-Passer (L + OH)',
    'Libero and back-row OH take all serves. Setter, MBs, OH2, and OPP all free to hit.',
    {
      P1: [80, 16, 'h', 82, 26],
      P2: [80, 10, 'mb', 82, 24],
      P3: [46, 16, 'h', 48, 26],
      P4: [22, 10, 's', SETTER_TARGET.x, SETTER_TARGET.y],
      P5: [24, 62, 'l'],
      P6: [56, 72, 'p'],
    }
  ),
]

// ============================================================
// ROTATION 5  —  Setter @ P3 (front middle)
// Front: P4 (MB1), P3 (S),   P2 (OH2)
// Back:  P5 (OPP), P6 (OH1), P1 (L, replacing MB2)
// ============================================================
const R5 = [
  makePlay('r5-4p-w', 5, '4-Passer W',
    'Libero, both OHs, and OPP pass. Setter steps from middle front to the target; MB1 hides.',
    {
      P1: [80, 68, 'l'],
      P2: [78, 42, 'p'],
      P3: [48, 10, 's', SETTER_TARGET.x, SETTER_TARGET.y],
      P4: [22, 10, 'mb', 24, 24],
      P5: [26, 68, 'p'],
      P6: [56, 72, 'p'],
    }
  ),
  makePlay('r5-3p-loh', 5, '3-Passer (L + 2 OH)',
    'Libero and the two outsides cover the court. OPP hides; setter releases from P3.',
    {
      P1: [80, 68, 'l'],
      P2: [78, 42, 'p'],
      P3: [48, 10, 's', SETTER_TARGET.x, SETTER_TARGET.y],
      P4: [22, 10, 'mb', 24, 24],
      P5: [26, 16, 'h', 28, 26],
      P6: [56, 72, 'p'],
    }
  ),
  makePlay('r5-2p', 5, '2-Passer (L + OH)',
    'Libero and back-row OH take the serve. Everyone else is free.',
    {
      P1: [82, 64, 'l'],
      P2: [78, 16, 'h', 80, 26],
      P3: [48, 10, 's', SETTER_TARGET.x, SETTER_TARGET.y],
      P4: [22, 10, 'mb', 24, 24],
      P5: [26, 16, 'h', 28, 26],
      P6: [54, 70, 'p'],
    }
  ),
]

// ============================================================
// ROTATION 6  —  Setter @ P2 (front right, already at the target)
// Front: P4 (OH1), P3 (MB1), P2 (S)
// Back:  P5 (MB2, replaced by L? no — MB1 front, MB2 at P6 back → L@P6),
//        P6 (L, replacing MB2), P1 (OH2)
// OH1 in back-row at P1? let me re-check: in R6 we have OH1@P4, MB1@P3, S@P2, OH2@P1, L@P6, OPP@P5.
// Front: P4=OH1, P3=MB1, P2=S.  Back: P5=OPP, P6=L, P1=OH2.
// ============================================================
const R6 = [
  makePlay('r6-4p-w', 6, '4-Passer W',
    'Libero, both OHs, and OPP pass. Setter is already at the target and just stays out of the passing lanes; MB1 hides.',
    {
      P1: [78, 66, 'p'],
      P2: [76, 8,  's', SETTER_TARGET.x, SETTER_TARGET.y],
      P3: [48, 10, 'mb', 50, 24],
      P4: [22, 42, 'p'],
      P5: [26, 68, 'p'],
      P6: [54, 72, 'l'],
    }
  ),
  makePlay('r6-3p-loh', 6, '3-Passer (L + 2 OH)',
    'Libero and both outsides pass. OPP hides for the right-side attack.',
    {
      P1: [78, 68, 'p'],
      P2: [76, 8,  's', SETTER_TARGET.x, SETTER_TARGET.y],
      P3: [48, 10, 'mb', 50, 24],
      P4: [22, 42, 'p'],
      P5: [26, 16, 'h', 28, 26],
      P6: [54, 72, 'l'],
    }
  ),
  makePlay('r6-2p', 6, '2-Passer (L + OH)',
    'Libero and back-row OH split the court. Front-row OH, MB, setter, and OPP are all free.',
    {
      P1: [78, 62, 'p'],
      P2: [76, 8,  's', SETTER_TARGET.x, SETTER_TARGET.y],
      P3: [48, 10, 'mb', 50, 24],
      P4: [22, 16, 'h', 24, 26],
      P5: [26, 16, 'h', 28, 26],
      P6: [52, 68, 'l'],
    }
  ),
]

export const SERVE_RECEIVE_PLAYS = {
  1: R1, 2: R2, 3: R3, 4: R4, 5: R5, 6: R6,
}

// ============================================================
// Public helpers
// ============================================================

export function getPlaysForRotation(rotation) {
  return SERVE_RECEIVE_PLAYS[rotation] || []
}

export function findPlay(id) {
  if (!id) return null
  for (const r of [1, 2, 3, 4, 5, 6]) {
    const p = SERVE_RECEIVE_PLAYS[r].find(x => x.id === id)
    if (p) return p
  }
  return null
}

// Returns a plain slot → {x, y} map for dropping into the live court.
export function getPlayXY(play) {
  if (!play) return null
  const out = {}
  for (const s of SLOTS) {
    const p = play.positions[s]
    out[s] = { x: p.x, y: p.y }
  }
  return out
}

// Default picks (first option per rotation) — used when the coach has
// not explicitly chosen.
export function defaultPlayIds() {
  const out = {}
  for (const r of [1, 2, 3, 4, 5, 6]) out[r] = SERVE_RECEIVE_PLAYS[r][1].id
  return out
}
