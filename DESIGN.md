# VolleyballPal Design System

The reference for how VolleyballPal looks. Future work can say **"follow DESIGN.md"**
and get a consistent result.

**Target:** Linear's restraint and density, with Sleeper's way of presenting sports
data. Dark, tight, quiet — colour earns its place instead of decorating. Numbers
are first-class: crisp, aligned, tabular.

**Status:** two layers exist.
- **Dashboard system (`--ds-*`)**, §1–8: implemented in `src/styles.css` (the
  `DESIGN SYSTEM` block at the end of the file) and applied to the **team
  dashboard** (`src/screens/TeamLaunch.jsx`, `src/components/dashboard/*`).
- **Material You layer (`--md-*`)**, §9: seed-generated colour roles plus shared
  components, used by the signed-out landing page (`src/screens/Login.jsx`) and
  intended for every screen redesigned from here on.

Every other screen still uses the older ad-hoc styles and is scheduled for a
later pass.

**§0 overrides everything else in this file.** Where an older section disagrees
with it, §0 wins.

---

## 0. House rules (override every section below)

These exist because the first Material You pass drifted toward a generic
"AI-generated" look. They apply to every screen, in both design layers.

**No effects. Solid, flat colour only.**
- No gradients of any kind (linear, radial or conic), on backgrounds, text,
  borders or masks.
- No blurred decorative shapes, glows, `filter: blur()`, `backdrop-filter`,
  frosted or glass surfaces. A sticky top bar is a solid surface with a 1px
  bottom border.
- Shadows: none by default. At most **one** very subtle shadow, and only on a
  layer that genuinely floats above the page (a modal or popover), never on
  cards, panels, buttons or hover states. Focus rings are not shadows and are
  required.
- Separate things with **1px borders** (`--md-sys-color-outline-variant` /
  `--ds-border`) and space, not with depth.

**Plain, not generic.**
- No small all-caps tracked "eyebrow" labels above headings ("FEATURES", "FOR
  HIGH SCHOOL AND CLUB VOLLEYBALL"). A heading stands on its own; if context is
  truly needed, use one normal sentence-case line. Uppercase micro-labels are
  allowed only as *data* labels inside dense stat UI (§3, §6), never as
  marketing decoration.
- No pill-shaped chips used as decoration. Short lists are plain lines,
  optionally with a small line icon.
- Buttons are **8px-radius rectangles**, 48px tall for primary actions. Pills
  (`999px`) are for avatars and status badges only.
- Floating rounded "cards" are not a default container. Prefer full-width
  sections divided by hairlines, or one bordered block split by internal
  dividers.

**Layout.**
- Use the full width. Page sections span the viewport; their content runs up to
  **1440px** with **64px** side padding on desktop (40px tablet, **20px** phone).
  No narrow centred column.
- A sign-in screen is a split view: product copy on the left (~60%), a
  full-height sign-in panel on the right (~40%) on a solid surface, divided by a
  single 1px border. On phones the panel stacks directly under the copy.

**Accent.**
- Deep and muted, never neon. The brand seed is `#2A6F6B` (deep "Court
  Teal"), which resolves to `#076a65` (light) / `#84d4cf` (dark) as primary.
- Use it sparingly: the main button, links, focus rings and the wordmark's
  "Pal". Icons, checkmarks and dividers stay neutral.

**Forms.**
- Outlined inputs: a visible label *above* the field, 1px border, 8px radius,
  48px tall, and a clear focus ring (primary border plus a 3px translucent
  ring). No filled or floating-label fields.
- Password fields have a "Show"/"Hide" text toggle inside the right edge.

**Type.** Archivo everywhere, see §3.

---

## 1. Principles

1. **Greys carry the UI; the accent carries meaning.** A screen should read as
   near-black and grey. If two things on screen are accent-coloured, one of them
   is probably wrong.
2. **Hierarchy comes from weight and colour, not size.** Prefer changing text
   colour (`--ds-text` → `--ds-text-secondary` → `--ds-text-muted`) and weight
   before reaching for a bigger font.
3. **Numbers are the product.** Every statistic uses tabular figures so digits
   line up in a column. A number that shifts as it updates is a bug.
4. **Borders over shadows.** Depth comes from a 1px hairline and a slightly
   lighter surface. Shadows are for things that genuinely float (modals,
   popovers), never for cards in a grid.
5. **Tight, even spacing.** Use the scale. Do not invent 7px.
6. **No emoji.** Line icons only, from `src/components/Icons.jsx`.

---

## 2. Colour

### Surfaces
Four levels, each a step lighter. Never nest more than two deep.

| Token | Hex | Use |
|---|---|---|
| `--ds-bg` | `#08090b` | Page background |
| `--ds-surface` | `#0e1013` | Cards, panels, widgets |
| `--ds-surface-2` | `#15181c` | Nested blocks, hover, inputs |
| `--ds-surface-3` | `#1c2026` | Popovers, modals, active rows |

### Borders
| Token | Value | Use |
|---|---|---|
| `--ds-border` | `rgba(255,255,255,0.07)` | Default hairline on every card |
| `--ds-border-strong` | `rgba(255,255,255,0.13)` | Hover, focus, emphasis |
| `--ds-border-faint` | `rgba(255,255,255,0.04)` | Row dividers inside a card |

### Text
| Token | Hex | Use |
|---|---|---|
| `--ds-text` | `#f2f4f7` | Headings, player names, stat values |
| `--ds-text-secondary` | `#9ba3af` | Body, labels, supporting copy |
| `--ds-text-muted` | `#6b7280` | Meta, captions, units |
| `--ds-text-faint` | `#4b5563` | Placeholders, disabled, em-dashes |

### Accent — exactly one
`--ds-accent` `#6366f1` (indigo), with `--ds-accent-hover` `#7c81f5`,
`--ds-accent-subtle` `rgba(99,102,241,0.12)`, `--ds-accent-border`
`rgba(99,102,241,0.34)`.

**Use it for:** the primary button on a screen, the active tab or toggle, a
focus ring, one selected row.
**Do not use it for:** card borders, headings, body text, icons at rest, or
more than one element in a viewport.

### Semantic
| Token | Hex | Meaning |
|---|---|---|
| `--ds-success` | `#3ecf8e` | Wins, good stats, confirmation |
| `--ds-warning` | `#f5a524` | Caution, pending, "not tracked" |
| `--ds-danger` | `#f0555c` | Losses, errors, destructive |
| `--ds-info` | `#5b9df9` | Neutral notice |

Each has a `-subtle` background (`rgba(...,0.12)`) for badges and pills.

### Category colours (Sleeper-style tags)
Identity colours for the three pillars and for position tags. These are
**labels, not accents** — always as a subtle tinted background with matching
text, never as large fills.

| Token | Hex | For |
|---|---|---|
| `--ds-cat-rotation` | `#c6a3ff` | RotationPal |
| `--ds-cat-stats` | `#6bb3ff` | StatsPal |
| `--ds-cat-practice` | `#4ade80` | PracticePal |

Team colour stays available as `--tc`, set per team.

---

## 3. Typography

**Typeface: Archivo.** Loaded from Google Fonts in `index.html` as the variable
font (`wght` 100–900, `wdth` 62–125) with `display=swap`; exposed as
`--md-ref-typeface` in `src/theme/md3.css`.
- **Headings:** Archivo SemiBold (600) or Bold (700), tracking `-0.02em`
  (`--md-sys-heading-tracking`).
- **The big hero headline only:** Bold, `font-stretch: 110%`. No other text is
  widened.
- **Body:** Archivo Regular (400) at normal width.
- **Numbers:** always `font-variant-numeric: tabular-nums` (`.md-scope` sets it
  for the whole screen; `.ds-num` in the dashboard layer).
- Do not reintroduce Roboto or Space Grotesk on redesigned screens.

**Legacy stacks** (dashboard screens not yet migrated; move them to Archivo
when they are next touched):
- `--ds-font`: system-first (`-apple-system, BlinkMacSystemFont, 'Segoe UI',
  Roboto, 'Helvetica Neue', Arial, sans-serif`).
- `--ds-font-display`: `'Space Grotesk'` — the old wordmark.
- `--ds-font-mono`: `ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas,
  monospace` — dense stat tables and IDs.

**Numbers.** Any element showing a statistic gets `.ds-num`, which applies
`font-variant-numeric: tabular-nums`. Use `--ds-font-mono` as well when digits
sit in a column (tables, box scores).

**Scale.** Sizes are deliberately small and close together — density is the point.

| Token | Size / line-height | Use |
|---|---|---|
| `--ds-fs-2xs` | 10px / 1.4 | Uppercase micro-labels |
| `--ds-fs-xs` | 11px / 1.45 | Meta, captions |
| `--ds-fs-sm` | 12px / 1.5 | Secondary text, table cells |
| `--ds-fs-base` | 13px / 1.55 | Body, list rows |
| `--ds-fs-md` | 14px / 1.5 | Emphasised body, card titles |
| `--ds-fs-lg` | 16px / 1.4 | Section headings |
| `--ds-fs-xl` | 20px / 1.3 | Screen titles |
| `--ds-fs-2xl` | 26px / 1.2 | Hero stat values |
| `--ds-fs-3xl` | 34px / 1.15 | Scoreboard figures |

**Weights:** 400 body · 500 medium · 600 semibold (most UI) · 700 bold (names,
titles) · 800 heavy (stat values only).

**Letter-spacing:** `-0.015em` at `lg` and above; `0.08em` on uppercase
micro-labels; `0` elsewhere.

**Uppercase micro-label** — a *data* label inside dense stat UI (`SESSIONS`,
`PASSING`, `SETTERS`), never an eyebrow above a page heading (§0): `--ds-fs-2xs`, weight 700, `text-transform: uppercase`,
`letter-spacing: 0.08em`, `--ds-text-muted`.

---

## 4. Spacing

One scale. Everything is a multiple of 4.

| Token | px |
|---|---|
| `--ds-space-1` | 4 |
| `--ds-space-2` | 8 |
| `--ds-space-3` | 12 |
| `--ds-space-4` | 16 |
| `--ds-space-5` | 20 |
| `--ds-space-6` | 24 |
| `--ds-space-7` | 32 |
| `--ds-space-8` | 40 |

**Rules**
- Card padding: `--ds-space-4` (16px); `--ds-space-3` on phones.
- Gap between cards in a grid: `--ds-space-4`.
- Gap between a label and its value: `--ds-space-1`.
- Related controls in a row: `--ds-space-2`.
- Space above a section heading: `--ds-space-5`; below it: `--ds-space-3`.

---

## 5. Radius and elevation

| Token | Value | Use |
|---|---|---|
| `--ds-radius-sm` | 6px | Badges, small buttons, tags |
| `--ds-radius-md` | 8px | Buttons, inputs, list rows |
| `--ds-radius-lg` | 12px | Cards, panels |
| `--ds-radius-xl` | 16px | Modals, large surfaces |
| `--ds-radius-full` | 999px | Pills, avatars |

| Token | Value | Use |
|---|---|---|
| `--ds-shadow-sm` | `0 1px 2px rgba(0,0,0,0.45)` | Raised button |
| `--ds-shadow-md` | `0 6px 20px rgba(0,0,0,0.35)` | Dropdown, hovered card |
| `--ds-shadow-lg` | `0 16px 44px rgba(0,0,0,0.5)` | Modal, popover |
| `--ds-hairline` | `inset 0 1px 0 rgba(255,255,255,0.03)` | Top edge of a card |

A card at rest has **a border and the hairline, no shadow**. Per §0, hover
states get no shadow either; `--ds-shadow-md`/`-lg` are retired, and a
genuinely floating layer (modal, popover) may use one subtle shadow at most.

---

## 6. Components

Classes live in `src/styles.css`. Use them rather than restyling ad hoc.

### Card — `.ds-card`
Surface + border + `--ds-radius-lg` + hairline. Optional `.ds-card-head`
(title left, meta right, bottom hairline) and `.ds-card-body`.
`.ds-card-title` is the uppercase micro-label; `.ds-card-meta` is muted.

### Buttons — `.ds-btn` plus a variant
| Variant | Look | When |
|---|---|---|
| `.ds-btn-primary` | Accent fill, near-black text | One per screen — the main action |
| `.ds-btn-secondary` | `--ds-surface-2` fill, border | Ordinary actions |
| `.ds-btn-ghost` | Transparent, border on hover | Low-emphasis, toolbars |
| `.ds-btn-danger` | Danger-subtle fill, danger text | Destructive |

Height 32px (`.ds-btn-sm` 26px, `.ds-btn-lg` 40px). Minimum 44px tap target on
touch screens — enforced by the `pointer: coarse` rule.

### Input — `.ds-input`
`--ds-surface-2`, 1px border, `--ds-radius-md`, 13px. Focus: accent border plus
a 3px `--ds-accent-subtle` ring. Never remove the focus ring.

### Badge / tag — `.ds-badge` + tone
`.ds-badge-neutral` · `-success` · `-warning` · `-danger` · `-accent` ·
`-rotation` · `-stats` · `-practice`. 10px, weight 700, uppercase, subtle tinted
background with matching text. Position tags on a player card use these.

### Tabs / segmented — `.ds-tabs` > `.ds-tab` (`.is-active`)
Inset track on `--ds-surface-2`; the active tab is a raised `--ds-surface-3`
chip with primary text. Accent is used only for the active underline in
page-level tabs.

### List row — `.ds-row`
Fixed height, `--ds-border-faint` divider, hover lifts to `--ds-surface-2`.
Rows do not carry their own borders or radius — the card provides those.

### Stat card — `.ds-stat`
```
LABEL          ← uppercase micro-label, muted
2.31           ← --ds-fs-2xl, weight 800, tabular
14 receives    ← --ds-fs-xs, muted
```
Value takes a semantic or scale colour; the label never does.

### Player card / row — `.ds-player` (Sleeper-style)
```
[12]  Jayden Lam          2.31  Pass
      OH · Gr. 11          ← meta, muted
```
- `.ds-player-num` — jersey, mono tabular, **fixed width so names align**.
  Rendered as a small chip tinted in the **team colour** (`--tc`): a 10% fill,
  a 32% border, and the colour itself as the text. This is the roster's one
  piece of identity colour — it is what makes a squad list read as *this*
  team's squad. It is an identity colour, not the accent, so it stays confined
  to the chip and never fills a larger surface. Players in a muted group
  (unassigned) drop to a plain border and muted text.
- `.ds-player-name` — 13px, weight 700, primary text, truncates.
- `.ds-player-meta` — 11px muted, one line, ` · ` separated.
- `.ds-player-tag` — a `.ds-badge` for position or status.
- `.ds-player-stat` — right-aligned, mono tabular, weight 800.

The jersey number and the stat are both fixed-width columns so a list of
players reads as a clean table without being one.

### Broadcast readout — `.pp-bc` (a whole-view pattern)

Established by PracticePal's player development card. Where `.ds-stat` is one
figure, this is the pattern for a **view whose entire job is to present a
player's numbers** — a pro-sports stats readout rather than a dashboard.

Four rules make it read that way. They matter more than the class names, and
any screen adopting the pattern should keep all four.

**1. One surface.** The container has a background, a `--ds-border` and
`--ds-radius-xl`. *Nothing inside it does.* Sections are separated by a
`--ds-border-faint` hairline and space — never by a nested tile with its own
fill. Boxes inside boxes are what make a stats page read as an admin panel.

**2. One spacing rhythm.** A single local custom property (`--bc-gap`: 28px,
20px on a phone) is the card's padding *and* the margin and padding either
side of every hairline. One number to change, and the rhythm cannot drift
section to section.

**3. Type carries the hierarchy.** The card works because of the distance
between its two type poles, not because of chrome:

```
PASSING            ← 2xs, uppercase, +0.08em, muted        the label pole
2.31               ← 40px mono tabular, 600, -0.03em       the value pole
across 30 receives ← xs, muted, tabular                    the qualifier
```

The hero value is the one place a size above `--ds-fs-3xl` is right: it is
deliberately outside the scale because it is the single largest thing on the
screen, and the scale exists for dense UI. Do not reach for it anywhere else.
Header name: 20px / 600 / `-0.02em`. Jersey: an **outlined** mono chip, never
filled — it identifies, it does not shout.

**4. Colour only on values.** Greys everywhere else. Each figure takes its
graduated shade from the same `perfShade()` the charts draw with, so a number
and the chart beside it always agree. A missing value is a muted `—` and is
never shaded — shading a dash implies a judgement about data that is absent.

**Layout.** Hero stats in `repeat(3, minmax(0, 1fr))`, no dividers between
them: the numerals are already doing the separating. Comparison columns in the
same three-track grid with the divider drawn as `border-left` **on the column**
— a divider should not be an element. Both stack on a phone, and stacked
columns swap the vertical rule for a horizontal one, since a vertical hairline
needs width beside it to read as a divider rather than as an edge.

Every figure in the card — hero, comparison, chart total, log — carries
`tabular-nums` and `--ds-font-mono`, so columns align down the whole card
without a table.

---

## 7. Do / don't

**Do**
- Reach for a token. If a value is not in the scale, question the value.
- Give every statistic `.ds-num`.
- Use one accent element per view.
- Let cards be defined by their border; keep them flat.
- Truncate long names with ellipsis rather than wrapping in a dense row.
- Separate sections with a hairline and space. A nested tile with its own fill
  is almost always the wrong answer.
- Drive a block's whole spacing rhythm from one local custom property, so the
  gaps either side of a divider cannot drift apart.

**Don't**
- Add a new hex to a component file. Add a token here first.
- Use `--ds-success` / `--ds-danger` for anything but meaning (a green border
  on a neutral card is noise).
- Stack more than two surface levels.
- Use emoji as an icon.
- Set a font-size not in the scale. The one sanctioned exception is a
  broadcast hero value (see §6), which is deliberately larger than `3xl`
  because it is the single largest thing on its screen.
- Shade a missing value. A `—` stays muted: colouring it implies a judgement
  about data that is not there.

---

## 8. Applying this to a new screen

1. Put `.ds-scope` on the screen's root (or add the screen to the scoped block
   in `styles.css`). This switches the screen onto the DS font and background.
2. Replace panels with `.ds-card`, headers with `.ds-card-head`.
3. Replace buttons with `.ds-btn` + variant. Pick exactly one primary.
4. Replace stat displays with `.ds-stat`, player rows with `.ds-player`.
5. Delete the screen's bespoke colours and sizes as you go — anything left over
   that is not a token is a loose end.

---

## 9. Material You layer (`--md-*`)

The layer every redesigned screen builds on. §0 overrides its MD3 defaults.

**Files**
- `src/theme/md3.js` — colour. `schemeFromSeed(seed, dark)` turns one hex seed
  into the full MD3 role set (primary, on-primary, containers, secondary,
  tertiary, error, surface and surface-container levels, outline, inverse).
  Tones are CIELAB L* so contrast pairings hold for any seed; hue and chroma
  are OKLCH so blues don't drift purple. `BRAND_SEED` is the default.
- `src/theme/md3.css` — everything seed-independent: Archivo type scale, shape,
  motion, state-layer opacities, and the shared components below.
- `src/main.jsx` calls `applySeed(BRAND_SEED)` at startup, writing light and
  dark role sets keyed off `<html data-theme>`.

**Re-seeding for a team.** Every team screen should use the team's colour as the
seed: `applySeed(team.color)` for the whole app,
`applySeed(team.color, { selector: '.team-scope' })` for a subtree, or
`style={seedStyle(team.color, dark)}` inline. Never hard-code a role colour.

**Tokens:** `--md-sys-color-<role>` (e.g. `primary`, `on-primary`,
`surface-container-low`, `outline-variant`), `--md-sys-typescale-*`,
`--md-sys-shape-corner-*` (`small` = 8px is the default radius),
`--md-sys-motion-easing-standard` (`cubic-bezier(0.2, 0, 0, 1)`).

**Components** (opt a screen in with `.md-scope` on its root):
- `.md-field` — outlined text field: `.md-field__label` above,
  `.md-field__control` (1px border, 8px radius, 48px), `.md-field__input`,
  optional `.md-field__trailing` text button. `.md-field--error` for errors,
  with the message tied to the input by `aria-describedby`.
- `.md-button.md-button--filled` / `--outlined` — 8px radius, 48px tall,
  on-colour state layer, `scale(0.98)` on press, no elevation. Add
  `[data-loading]` plus `.md-spinner` while an action is in flight.

**Motion:** state changes use the standard easing at 150–200ms. Everything
respects `prefers-reduced-motion`.

**Reference implementation:** `src/screens/Login.jsx` + `Login.css` (landing
page and sign-in panel).
