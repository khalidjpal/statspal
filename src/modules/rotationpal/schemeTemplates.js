// ============================================================
// Built-in scheme templates for the SCHEMES screen.
//
// These are read-only starting points (5-1, 6-2, 4-2, 5-2) that always
// appear above the coach's own saved schemes. They are defined here in
// code — never as formation_presets rows — so they can't be edited or
// deleted by accident. Clicking one opens the scheme editor pre-populated
// with its formation; the coach tweaks it and Saves As their own named
// preset. The template itself is never mutated.
//
// Each template's `rotations` blob matches the exact shape the PresetEditor
// and formation_presets table use:
//   { 1: { serve: { S:{x,y}, OH1:{x,y}, ... }, receive: {...} }, ... 6: {...} }
// with the six role markers S, OH1, OH2, MB1, MB2, OPP.
// ============================================================

// Base court coordinates per slot — mirrors SLOT_POS in GameplanBuilderModal
// so a template opens with markers exactly where the editor would draw them.
const SLOT_POS = {
  P4: { x: 22, y: 28 }, P3: { x: 50, y: 24 }, P2: { x: 78, y: 28 },
  P5: { x: 22, y: 72 }, P6: { x: 50, y: 76 }, P1: { x: 78, y: 72 },
}
// Cyclic rotation order (P1 → P6 → P5 → P4 → P3 → P2 → P1).
const ROT_CYCLE = ['P1', 'P6', 'P5', 'P4', 'P3', 'P2']
const FRONT_SLOTS = ['P2', 'P3', 'P4']

// Serve-receive reference points — mirrors makeReceiveDefault in
// gameplanFormations.js: three passers in a W, non-setter front players
// hiding at the net, and the active setter released to the right of the net.
const W = {
  P5: { x: 18, y: 60 }, P6: { x: 50, y: 70 }, P1: { x: 82, y: 60 },
}
const HIDE = {
  P4: { x: 14, y: 16 }, P3: { x: 50, y: 12 }, P2: { x: 82, y: 16 },
}
const SETTER_FRONT = { x: 72, y: 14 } // setting from the front row
const SETTER_BACK = { x: 78, y: 32 }  // penetrating from the back row

function slotInRotation(r1Slot, rotationN) {
  const idx = ROT_CYCLE.indexOf(r1Slot)
  if (idx === -1) return r1Slot
  return ROT_CYCLE[(idx + rotationN - 1) % 6]
}

// Build the full 6-rotation × serve/receive marker map from a rotation-1
// slot→marker assignment. Serve positions follow the standard 6-zone
// rotation; receive positions place the active setter at the net and spread
// the rest into a passing W / net-hide shape.
//
//   r1        — { P1:'S', P2:'OH1', ... }  (who stands where at rotation 1)
//   setters   — marker(s) that run the offense, e.g. ['S'] or ['S','OPP']
//   setFrom   — 'back' (penetrating setter) or 'front' (front-row setter)
function buildRotations(r1, { setters, setFrom = 'back' }) {
  const markerR1Slot = {}
  for (const slot of Object.keys(r1)) markerR1Slot[r1[slot]] = slot

  const out = {}
  for (let r = 1; r <= 6; r++) {
    const markerSlot = {}
    for (const m of Object.keys(markerR1Slot)) {
      markerSlot[m] = slotInRotation(markerR1Slot[m], r)
    }

    // The setter actually running this rotation: the back-row setter when
    // penetrating, the front-row setter for a 4-2.
    const backSetters = setters.filter(m => !FRONT_SLOTS.includes(markerSlot[m]))
    const frontSetters = setters.filter(m => FRONT_SLOTS.includes(markerSlot[m]))
    const active = setFrom === 'front'
      ? (frontSetters[0] || backSetters[0] || setters[0])
      : (backSetters[0] || frontSetters[0] || setters[0])

    const serve = {}
    const receive = {}
    for (const m of Object.keys(markerSlot)) {
      const slot = markerSlot[m]
      serve[m] = { ...SLOT_POS[slot] }
      if (m === active) {
        receive[m] = FRONT_SLOTS.includes(slot) ? { ...SETTER_FRONT } : { ...SETTER_BACK }
      } else if (FRONT_SLOTS.includes(slot)) {
        receive[m] = { ...HIDE[slot] }
      } else {
        receive[m] = { ...W[slot] }
      }
    }
    out[r] = { serve, receive }
  }
  return out
}

// Rotation-1 base alignments (opposite pairs kept 3 zones apart so the
// rotation stays legal through all six positions).
//
// 5-1 / 6-2 / 5-2 share the standard "setters opposite" alignment — the
// difference between those systems is who sets, which the receive shape
// reflects (one vs two penetrating setters). The 4-2 starts its setter in
// the front row.
const R1_STANDARD = {
  P1: 'S', P2: 'OH1', P3: 'MB1', P4: 'OPP', P5: 'OH2', P6: 'MB2',
}
const R1_FOUR_TWO = {
  P2: 'S', P4: 'OH1', P3: 'MB1', P1: 'OH2', P5: 'OPP', P6: 'MB2',
}

export const SCHEME_TEMPLATES = [
  {
    key: '5-1',
    name: '5-1',
    subtitle: 'One setter',
    description: 'One setter runs the offense all six rotations — two outsides, two middles, an opposite. The standard competitive system.',
    rotations: buildRotations(R1_STANDARD, { setters: ['S'], setFrom: 'back' }),
  },
  {
    key: '6-2',
    name: '6-2',
    subtitle: 'Two setters · back-row set',
    description: 'Two setters opposite each other; whoever is in the back row sets, so you always attack with three front-row hitters.',
    rotations: buildRotations(R1_STANDARD, { setters: ['S', 'OPP'], setFrom: 'back' }),
  },
  {
    key: '4-2',
    name: '4-2',
    subtitle: 'Front-row setter',
    description: 'Two setters set from the front row. Simple to run and easy to teach — a great base for developing teams.',
    rotations: buildRotations(R1_FOUR_TWO, { setters: ['S', 'OPP'], setFrom: 'front' }),
  },
  {
    key: '5-2',
    name: '5-2',
    subtitle: 'Two setters · five attackers',
    description: 'Two setters run the offense from the back row while the front-row setter also attacks — five attacking options.',
    rotations: buildRotations(R1_STANDARD, { setters: ['S', 'OPP'], setFrom: 'back' }),
  },
]

// Seed a fresh (unsaved) preset draft from a template so the editor opens
// pre-populated and a Save writes a NEW formation_presets row. No `id` is
// set, which is what marks it "new" to the editor and the upsert.
export function makeTemplateDraft(template) {
  return {
    name: `${template.name} Base`,
    rotations: template.rotations,
  }
}
