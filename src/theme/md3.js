/* ===================================================================
 *  Material You (MD3) colour tokens from a single seed colour.
 *
 *  Every --md-sys-color-* custom property in the app comes from here.
 *  The login screen uses the VolleyballPal brand seed; team screens can
 *  re-seed from the team's colour:
 *
 *    applySeed(team.color)                          // whole app
 *    applySeed(team.color, { selector: '.team-x' }) // one subtree
 *    <div style={seedStyle(team.color, dark)}>      // inline, per element
 *
 *  Tones follow MD3: a tone is CIELAB L* (0 = black, 100 = white), so the
 *  role pairings below (e.g. primary 40 / on-primary 100) keep the same
 *  contrast guarantees whatever hue the seed is. Hue and chroma are held
 *  in OKLCH (a close, dependency-free stand-in for MD3's HCT, and true to
 *  hue for blues where CIELAB drifts purple) and chroma is reduced only as
 *  far as the sRGB gamut needs.
 * =================================================================== */

/** VolleyballPal brand seed, a deep, muted "Court Teal". Used until a team is chosen. */
export const BRAND_SEED = '#2A6F6B';

// ---------- colour maths (sRGB <-> OKLCH, tone = CIELAB L*) ----------

function hexToRgb(hex) {
  let h = String(hex).trim().replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(n)) throw new Error(`Invalid hex colour: ${hex}`);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toLinear = c => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const fromLinear = c => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const toHex = rgb =>
  '#' + rgb.map(v => Math.round(fromLinear(Math.min(1, Math.max(0, v)))).toString(16).padStart(2, '0')).join('');

/** OKLCH hue (degrees) and chroma (roughly 0-0.37) of a hex colour. */
function hexToOklch(hex) {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}

function oklchToLinearRgb(L, c, h) {
  const rad = (h * Math.PI) / 180;
  const A = c * Math.cos(rad), B = c * Math.sin(rad);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const inGamut = rgb => rgb.every(v => v >= -1e-4 && v <= 1 + 1e-4);

/** Relative luminance (0-1) for a tone (CIELAB L*). */
function toneToY(tone) {
  const ft = (tone + 16) / 116;
  return ft ** 3 > 216 / 24389 ? ft ** 3 : tone / (24389 / 27);
}

/** Linear sRGB at a hue and chroma whose luminance is `y`. */
function atLuminance(h, c, y) {
  let lo = 0, hi = 1, rgb = null;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    rgb = oklchToLinearRgb(mid, c, h);
    if (luminance(rgb) < y) lo = mid; else hi = mid;
  }
  return rgb;
}

/** The colour at a tone, keeping hue and as much chroma as sRGB allows. */
function toneColor(hue, chroma, tone) {
  if (tone <= 0) return '#000000';
  if (tone >= 100) return '#ffffff';
  const y = toneToY(tone);
  const exact = atLuminance(hue, chroma, y);
  if (inGamut(exact)) return toHex(exact);
  let lo = 0, hi = chroma, best = atLuminance(hue, 0, y);
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    const rgb = atLuminance(hue, mid, y);
    if (inGamut(rgb)) { best = rgb; lo = mid; } else hi = mid;
  }
  return toHex(best);
}

// ---------- palettes and schemes ----------

/** A tonal palette: call with a tone (0-100) to get a hex colour. */
export function tonalPalette(hue, chroma) {
  const cache = new Map();
  return tone => {
    if (!cache.has(tone)) cache.set(tone, toneColor(hue, chroma, tone));
    return cache.get(tone);
  };
}

const ERROR_HUE = hexToOklch('#B3261E').h;

/** The six MD3 key palettes for a seed colour. */
export function palettesFromSeed(seed) {
  const { c, h } = hexToOklch(seed);
  return {
    // Keep the seed's own chroma so a strong team colour stays strong; the
    // floor only lifts near-grey seeds, and is kept low so accents stay muted.
    primary: tonalPalette(h, Math.max(c, 0.08)),
    secondary: tonalPalette(h, 0.04),
    tertiary: tonalPalette((h + 60) % 360, 0.07),
    neutral: tonalPalette(h, 0.008),
    neutralVariant: tonalPalette(h, 0.018),
    error: tonalPalette(ERROR_HUE, 0.2),
  };
}

const ROLES = {
  //                               light                 dark
  primary:                     [['primary', 40],        ['primary', 80]],
  'on-primary':                [['primary', 100],       ['primary', 20]],
  'primary-container':         [['primary', 90],        ['primary', 30]],
  'on-primary-container':      [['primary', 10],        ['primary', 90]],
  secondary:                   [['secondary', 40],      ['secondary', 80]],
  'on-secondary':              [['secondary', 100],     ['secondary', 20]],
  'secondary-container':       [['secondary', 90],      ['secondary', 30]],
  'on-secondary-container':    [['secondary', 10],      ['secondary', 90]],
  tertiary:                    [['tertiary', 40],       ['tertiary', 80]],
  'on-tertiary':               [['tertiary', 100],      ['tertiary', 20]],
  'tertiary-container':        [['tertiary', 90],       ['tertiary', 30]],
  'on-tertiary-container':     [['tertiary', 10],       ['tertiary', 90]],
  error:                       [['error', 40],          ['error', 80]],
  'on-error':                  [['error', 100],         ['error', 20]],
  'error-container':           [['error', 90],          ['error', 30]],
  'on-error-container':        [['error', 10],          ['error', 90]],
  background:                  [['neutral', 98],        ['neutral', 6]],
  'on-background':             [['neutral', 10],        ['neutral', 90]],
  surface:                     [['neutral', 98],        ['neutral', 6]],
  'on-surface':                [['neutral', 10],        ['neutral', 90]],
  'surface-variant':           [['neutralVariant', 90], ['neutralVariant', 30]],
  'on-surface-variant':        [['neutralVariant', 30], ['neutralVariant', 80]],
  'surface-dim':               [['neutral', 87],        ['neutral', 6]],
  'surface-bright':            [['neutral', 98],        ['neutral', 24]],
  'surface-container-lowest':  [['neutral', 100],       ['neutral', 4]],
  'surface-container-low':     [['neutral', 96],        ['neutral', 10]],
  'surface-container':         [['neutral', 94],        ['neutral', 12]],
  'surface-container-high':    [['neutral', 92],        ['neutral', 17]],
  'surface-container-highest': [['neutral', 90],        ['neutral', 22]],
  'inverse-surface':           [['neutral', 20],        ['neutral', 90]],
  'inverse-on-surface':        [['neutral', 95],        ['neutral', 20]],
  'inverse-primary':           [['primary', 80],        ['primary', 40]],
  outline:                     [['neutralVariant', 50], ['neutralVariant', 60]],
  'outline-variant':           [['neutralVariant', 80], ['neutralVariant', 30]],
  shadow:                      [['neutral', 0],         ['neutral', 0]],
  scrim:                       [['neutral', 0],         ['neutral', 0]],
};

/** { primary: '#…', 'on-primary': '#…', … } for a seed, light or dark. */
export function schemeFromSeed(seed, dark = false) {
  const palettes = palettesFromSeed(seed);
  const scheme = {};
  for (const [role, pair] of Object.entries(ROLES)) {
    const [palette, tone] = pair[dark ? 1 : 0];
    scheme[role] = palettes[palette](tone);
  }
  return scheme;
}

/** The scheme as custom properties, for a React `style` prop. */
export function seedStyle(seed, dark = false) {
  const style = {};
  for (const [role, value] of Object.entries(schemeFromSeed(seed, dark))) {
    style[`--md-sys-color-${role}`] = value;
  }
  return style;
}

const declarations = scheme =>
  Object.entries(scheme).map(([role, v]) => `  --md-sys-color-${role}: ${v};`).join('\n');

/**
 * Write light and dark schemes for `seed` into a <style> tag. The app's
 * theme toggle sets data-theme on <html>, so both schemes are emitted and
 * the attribute picks between them. Calling again with the same `id`
 * replaces the previous seed.
 */
export function applySeed(seed, { selector = ':root', id = 'md-seed-root' } = {}) {
  if (typeof document === 'undefined') return;
  const scope = selector === ':root' ? '' : ` ${selector}`;
  const css =
    `:root${scope}, :root[data-theme="light"]${scope} {\n${declarations(schemeFromSeed(seed, false))}\n}\n` +
    `:root[data-theme="dark"]${scope} {\n${declarations(schemeFromSeed(seed, true))}\n}\n`;
  let tag = document.getElementById(id);
  if (!tag) {
    tag = document.createElement('style');
    tag.id = id;
    document.head.appendChild(tag);
  }
  tag.textContent = css;
}
