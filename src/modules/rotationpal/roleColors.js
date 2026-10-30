// The one role-colour map for RotationPal. Court bubbles, roster number
// squares, role badges, accent bars, bench subheaders, empty-spot
// placeholders, sub lines, the slot picker and the preset role markers all
// read from here, so a player is the same colour everywhere.

export const ROLE_COLORS = {
  S:   '#38bdf8', // blue
  OH:  '#fb923c', // orange
  MB:  '#4ade80', // green
  OPP: '#f472b6', // pink
  L:   '#fbbf24', // gold
  DS:  '#fde68a', // soft light yellow
};

// No role, or one we don't recognise.
export const ROLE_COLOR_NONE = '#8b949e';

// The roster's free-text position → its role key ("Setter" → S). Anything
// unrecognised comes back as its first four letters, which has no colour.
const ROLE_ALIASES = {
  S: ['S', 'SET', 'SETTER'],
  OH: ['OH', 'WS', 'OUTSIDE', 'OUTSIDE HITTER', 'LH', 'LEFT SIDE'],
  MB: ['MB', 'MH', 'M', 'MIDDLE', 'MIDDLE BLOCKER', 'MIDDLE HITTER'],
  OPP: ['OPP', 'RS', 'OPPOSITE', 'RIGHT SIDE'],
  L: ['L', 'LIBERO'],
  DS: ['DS', 'DEFENSIVE SPECIALIST'],
};
export function roleTagOf(position) {
  const r = (position || '').trim().toUpperCase();
  if (!r) return '';
  for (const key of Object.keys(ROLE_ALIASES)) {
    if (ROLE_ALIASES[key].includes(r)) return key;
  }
  return r.slice(0, 4);
}

// Text on a filled role colour. Every fill here is light enough that dark
// text reads better than white (measured on the bubble gradient: dark is
// 5.3:1 or more for every role, white tops out at 4.0:1), so they all
// share one ink. Kept per role so a darker colour can switch to white.
const INK_DARK = '#111418';
export const ROLE_INK = {
  S: INK_DARK, OH: INK_DARK, MB: INK_DARK, OPP: INK_DARK, L: INK_DARK, DS: INK_DARK,
};
export const ROLE_INK_NONE = INK_DARK;

// CSS variables for a filled bubble in `color`: the role colour fading to a
// slightly deeper shade (the subtle shine sits on top in CSS), a glow tinted
// with the same colour, and a pale rim.
export function roleBubbleVars(color, ink = INK_DARK) {
  return {
    '--bubble-bg': `linear-gradient(135deg, ${color} 0%, color-mix(in srgb, ${color} 80%, #000) 100%)`,
    '--bubble-glow': `color-mix(in srgb, ${color} 55%, transparent)`,
    '--bubble-edge': `color-mix(in srgb, ${color} 45%, #fff)`,
    '--bubble-ink': ink,
  };
}
