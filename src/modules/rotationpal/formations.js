// ============================================================
// Formation library: built-in templates + rotation helpers.
//
// Coordinate system: 0..100 percent within our half of the court.
// x=0 left sideline, x=100 right sideline.
// y=0 at the net, y=100 at the back endline.
// ============================================================

const SLOTS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']

// When rotation advances once: player at P2 → P1, P3 → P2, P4 → P3, P5 → P4, P6 → P5, P1 → P6.
// So a player currently at slot X moves to NEXT_SLOT[X] on the next rotation.
const NEXT_SLOT = { P1: 'P6', P6: 'P5', P5: 'P4', P4: 'P3', P3: 'P2', P2: 'P1' }

export function rotateSlot(slot, n = 1) {
  let s = slot
  const steps = ((n % 6) + 6) % 6
  for (let i = 0; i < steps; i++) s = NEXT_SLOT[s]
  return s
}

// Given a base rotation-1 position map and (optionally) the setter's starting slot,
// build position maps for all 6 rotations. The shape of the formation stays constant;
// only the "setter" tag rotates with the setter around the court.
export function buildRotationMap(basePositions, setterStart) {
  const rotations = {}
  for (let r = 1; r <= 6; r++) {
    const setterSlot = setterStart ? rotateSlot(setterStart, r - 1) : null
    const map = {}
    for (const s of SLOTS) {
      const base = basePositions[s] || { x: 50, y: 50 }
      map[s] = {
        x: base.x,
        y: base.y,
        passer: setterSlot ? s !== setterSlot : !!base.passer,
        setter: setterSlot ? s === setterSlot : false,
        note: base.note || null,
      }
    }
    rotations[r] = map
  }
  return rotations
}

// Cache materialized (all-6-rotations) versions of formations.
const materializedCache = new WeakMap()
export function materialize(formation) {
  if (!formation) return null
  if (materializedCache.has(formation)) return materializedCache.get(formation)
  const out = {
    ...formation,
    rotations: formation.rotations || buildRotationMap(formation.positions, formation.setterStart),
  }
  materializedCache.set(formation, out)
  return out
}

// ============================================================
// Built-in templates
// ============================================================

// Serve receive formations have moved to ./serveReceive.js —
// they're now per-rotation plays with the setter always hidden.

// --- Offensive systems ---
const OFF_51 = {
  id: 'off-51',
  name: '5-1 Offense',
  category: 'offense',
  description: 'One setter, five attackers. Setter runs offense from all 6 rotations.',
  positions: {
    P4: { x: 16, y: 24 }, // outside hitter approach
    P3: { x: 48, y: 22 }, // middle blocker / quick attack
    P2: { x: 82, y: 26 }, // opposite / right-side
    P5: { x: 20, y: 66 },
    P6: { x: 50, y: 72 },
    P1: { x: 80, y: 66 },
  },
  setterStart: 'P1',
}

const OFF_62 = {
  id: 'off-62',
  name: '6-2 Offense',
  category: 'offense',
  description: 'Two setters, six attackers. Back-row setter penetrates to target on every play.',
  positions: {
    P4: { x: 16, y: 22 },
    P3: { x: 48, y: 22 },
    P2: { x: 80, y: 22 },
    P5: { x: 22, y: 66 },
    P6: { x: 50, y: 74 },
    P1: { x: 70, y: 46 }, // back-row setter penetrating
  },
  setterStart: 'P1',
}

const OFF_42 = {
  id: 'off-42',
  name: '4-2 Offense',
  category: 'offense',
  description: 'Two setters, four attackers. Front-row setter always sets from P2 / P3.',
  positions: {
    P4: { x: 18, y: 24 },
    P3: { x: 50, y: 32 },
    P2: { x: 80, y: 20 }, // front-row setter at target
    P5: { x: 20, y: 68 },
    P6: { x: 50, y: 76 },
    P1: { x: 80, y: 66 },
  },
  setterStart: 'P2',
}

// --- Defensive systems ---
const DEF_PERIMETER = {
  id: 'def-perim',
  name: 'Perimeter Defense',
  category: 'defense',
  description: 'Players spread to the edges; middle back deep for over-hits.',
  positions: {
    P4: { x: 10, y: 38 },  // left front digger
    P3: { x: 50, y: 16 },  // middle blocker at net
    P2: { x: 90, y: 38 },  // right front digger
    P5: { x: 8,  y: 78 },  // deep left corner
    P6: { x: 50, y: 92 },  // middle back deep
    P1: { x: 92, y: 78 },  // deep right corner
  },
  setterStart: null,
}

const DEF_ROTATIONAL = {
  id: 'def-rot',
  name: 'Rotational Defense',
  category: 'defense',
  description: 'Middle back rotates behind the block to dig line; off-blocker drops to cover tips.',
  positions: {
    P4: { x: 18, y: 40 },
    P3: { x: 50, y: 18 },
    P2: { x: 80, y: 38 },
    P5: { x: 14, y: 66 },  // off-blocker dropped to cover short
    P6: { x: 60, y: 86 },  // rotated toward the line
    P1: { x: 86, y: 72 },
  },
  setterStart: null,
}

const DEF_MANUP = {
  id: 'def-manup',
  name: 'Man-Up (Red) Defense',
  category: 'defense',
  description: 'Middle back comes up for tips; outside defenders cover deep corners.',
  positions: {
    P4: { x: 14, y: 44 },
    P3: { x: 50, y: 20 },
    P2: { x: 86, y: 44 },
    P5: { x: 16, y: 82 },
    P6: { x: 50, y: 52 }, // middle back UP for tips
    P1: { x: 84, y: 82 },
  },
  setterStart: null,
}

export const BUILTIN_FORMATIONS = [
  OFF_51, OFF_62, OFF_42,
  DEF_PERIMETER, DEF_ROTATIONAL, DEF_MANUP,
].map(f => ({ ...f, builtin: true }))

export const CATEGORY_LABELS = {
  offense: 'Offense',
  defense: 'Defense',
}
export const CATEGORY_ORDER = ['offense', 'defense']

// ============================================================
// Public helpers
// ============================================================

export function getAllFormations(customFormations = []) {
  return [
    ...BUILTIN_FORMATIONS,
    ...customFormations.map(f => ({ ...f, builtin: false })),
  ]
}

export function getFormationsByCategory(category, customFormations = []) {
  return getAllFormations(customFormations).filter(f => f.category === category)
}

export function findFormation(id, customFormations = []) {
  if (!id) return null
  return getAllFormations(customFormations).find(f => f.id === id) || null
}

export function getRotationPositions(formation, rotation = 1) {
  if (!formation) return null
  const m = materialize(formation)
  return m.rotations[rotation] || m.rotations[1]
}

// Used by the custom formation editor. Returns a blank formation seeded
// with sensible defaults that the coach can then drag around.
export function makeCustomFormationDraft(category) {
  const base = {
    P4: { x: 20, y: 30 }, P3: { x: 50, y: 30 }, P2: { x: 80, y: 30 },
    P5: { x: 20, y: 70 }, P6: { x: 50, y: 76 }, P1: { x: 80, y: 70 },
  }
  return {
    id: `custom-${Math.random().toString(36).slice(2, 9)}`,
    name: '',
    category,
    description: '',
    positions: base,
    setterStart: category === 'offense' ? 'P1' : null,
    builtin: false,
  }
}
