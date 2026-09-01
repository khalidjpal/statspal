# VolleyballPal Design System

The reference for how VolleyballPal looks. Future work can say **"follow DESIGN.md"**
and get a consistent result.

**Target:** Linear's restraint and density, with Sleeper's way of presenting sports
data. Dark, tight, quiet — colour earns its place instead of decorating. Numbers
are first-class: crisp, aligned, tabular.

**Status:** the tokens and components below are implemented in `src/styles.css`
(the `DESIGN SYSTEM` block at the end of the file). They are applied to the
**team dashboard** (`src/screens/TeamLaunch.jsx` and `src/components/dashboard/*`).
Every other screen still uses the older ad-hoc styles and is scheduled for a
later pass.

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

**Stacks**
- `--ds-font`: system-first (`-apple-system, BlinkMacSystemFont, 'Segoe UI',
  Roboto, 'Helvetica Neue', Arial, sans-serif`). No webfont to wait on.
- `--ds-font-display`: `'Space Grotesk'` — the wordmark only.
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

**Uppercase micro-label** — the recurring section header (`SESSIONS`, `PASSING`,
`SETTERS`): `--ds-fs-2xs`, weight 700, `text-transform: uppercase`,
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

A card at rest has **a border and the hairline, no shadow**. Shadows appear on
hover or on genuinely floating layers.

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

---

## 7. Do / don't

**Do**
- Reach for a token. If a value is not in the scale, question the value.
- Give every statistic `.ds-num`.
- Use one accent element per view.
- Let cards be defined by their border; keep them flat.
- Truncate long names with ellipsis rather than wrapping in a dense row.

**Don't**
- Add a new hex to a component file. Add a token here first.
- Use `--ds-success` / `--ds-danger` for anything but meaning (a green border
  on a neutral card is noise).
- Stack more than two surface levels.
- Use emoji as an icon.
- Set a font-size not in the scale.

---

## 8. Applying this to a new screen

1. Put `.ds-scope` on the screen's root (or add the screen to the scoped block
   in `styles.css`). This switches the screen onto the DS font and background.
2. Replace panels with `.ds-card`, headers with `.ds-card-head`.
3. Replace buttons with `.ds-btn` + variant. Pick exactly one primary.
4. Replace stat displays with `.ds-stat`, player rows with `.ds-player`.
5. Delete the screen's bespoke colours and sizes as you go — anything left over
   that is not a token is a loose end.
