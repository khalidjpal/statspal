import { Fragment, useMemo, useState, useId } from 'react';
// Number formatting comes from each drill's band definition (perfBands().fmt),
// which is the same pfmt/n3/pctFmt the rest of the app uses.
import { hpct, passAvg, playerTotals } from '../utils/stats';
import {
  DRILL_ORDER, drillOf, drillHeadline, drillBreakdown,
  sumPracticeRows, sessionDrillLabel, emptyPracticeRow,
  perfShade, perfBands, serveInPct, acePct, pctFmt,
  drillAggregate, SCRIM_METRICS, METRIC_LABEL,
} from '../utils/practice';
import { sortByJersey } from '../utils/sort';

// Per-player development: how a player's practice numbers move across sessions,
// and how those numbers sit next to the same player's GAME numbers.
//
// Game stats are read here and never written. They arrive as props straight
// from DataContext's player_game_stats fetch; this screen has no Supabase
// client of its own precisely so it cannot write to a game table by accident.

function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = String(d).split('-');
  if (!y || !m || !day) return String(d);
  return `${Number(m)}/${Number(day)}`;
}

// ─── Trend chart ───────────────────────────────────────────────────────────
// A real plotted chart: fixed pixel viewBox with margins for the axes, scaled
// by the browser with preserveAspectRatio left at its default. The previous
// version stretched a 0–100 box with preserveAspectRatio="none", which skewed
// every stroke and dot as the column resized — that is what looked off.
//
// Colour carries the meaning, and it is CONTINUOUS: perfShade() picks the hue
// from the drill's bands and the shade from how far into that band the value
// sits, so 2.90 is a deep rich green where 2.10 is a pale one. Each connecting
// segment holds the STARTING point's shade for the first half of its length
// before crossing to the next point's, so the line leaving a good day reads
// green and the line leaving a bad day reads red — the eye lands on the bad
// days first, and how bad they were is legible without reading the number.
function TrendChart({ points, domain, drillType }) {
  const rawId = useId();
  // useId returns ':r1:'-style values; colons break url(#...) references.
  const uid = rawId.replace(/:/g, '');

  if (points.length === 0) {
    return <div className="pp-chart-empty">No reps recorded for this drill yet</div>;
  }

  const W = 600;
  const H = 240;
  const M = { top: 20, right: 18, bottom: 42, left: 54 };
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;

  const bands = perfBands(drillType);
  const [lo, hi] = domain;
  const span = (hi - lo) || 1;
  const n = points.length;

  const xAt = i => M.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yAt = v => M.top + (1 - (Math.max(lo, Math.min(hi, v)) - lo) / span) * plotH;

  // Gridlines sit at the scale ends AND at both band edges, so the chart's own
  // horizontal rules show where good and ok begin — no need to read them off
  // the legend while looking at a point.
  const ticks = [...new Set([lo, bands.ok, bands.good, hi])]
    .filter(t => t >= lo && t <= hi)
    .sort((a, b) => a - b);

  // Thin the date labels rather than letting them collide.
  const every = n <= 6 ? 1 : Math.ceil(n / 6);
  const showLabel = i => i === 0 || i === n - 1 || i % every === 0;

  return (
    <div className="pp-chart">
      <svg
        className="pp-chart-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${drillOf(drillType).short} per session over time`}
      >
        {/* horizontal gridlines + y labels */}
        {ticks.map(t => {
          const y = yAt(t);
          const edge = t === bands.good || t === bands.ok;
          return (
            <g key={t}>
              <line
                x1={M.left} y1={y} x2={W - M.right} y2={y}
                className={edge ? 'pp-ch-grid pp-ch-grid-edge' : 'pp-ch-grid'}
              />
              <text x={M.left - 10} y={y + 4} className="pp-ch-ylab" textAnchor="end">
                {bands.fmt(t)}
              </text>
            </g>
          );
        })}

        {/* axes */}
        <line x1={M.left} y1={M.top} x2={M.left} y2={M.top + plotH} className="pp-ch-axis" />
        <line x1={M.left} y1={M.top + plotH} x2={W - M.right} y2={M.top + plotH} className="pp-ch-axis" />

        {/* connecting segments — first half in the starting point's colour */}
        <defs>
          {points.slice(0, -1).map((p, i) => {
            const q = points[i + 1];
            return (
              <linearGradient
                key={i}
                id={`${uid}-s${i}`}
                gradientUnits="userSpaceOnUse"
                x1={xAt(i)} y1={yAt(p.value)}
                x2={xAt(i + 1)} y2={yAt(q.value)}
              >
                <stop offset="0%" stopColor={perfShade(drillType, p.value)} />
                <stop offset="50%" stopColor={perfShade(drillType, p.value)} />
                <stop offset="100%" stopColor={perfShade(drillType, q.value)} />
              </linearGradient>
            );
          })}
        </defs>
        {points.slice(0, -1).map((p, i) => (
          <line
            key={i}
            x1={xAt(i)} y1={yAt(p.value)}
            x2={xAt(i + 1)} y2={yAt(points[i + 1].value)}
            stroke={`url(#${uid}-s${i})`}
            className="pp-ch-line"
          />
        ))}

        {/* points + their values */}
        {points.map((p, i) => {
          const c = perfShade(drillType, p.value);
          const x = xAt(i);
          const y = yAt(p.value);
          return (
            <g key={i}>
              <circle cx={x} cy={y} r="6.5" className="pp-ch-dot-halo" />
              <circle cx={x} cy={y} r="4.5" fill={c} className="pp-ch-dot" />
              {n <= 8 && (
                <text x={x} y={y - 13} className="pp-ch-val" textAnchor="middle" fill={c}>
                  {p.display}
                </text>
              )}
            </g>
          );
        })}

        {/* x labels */}
        {points.map((p, i) => (showLabel(i) ? (
          <text key={i} x={xAt(i)} y={H - 18} className="pp-ch-xlab" textAnchor="middle">
            {p.dateLabel}
          </text>
        ) : null))}
      </svg>
    </div>
  );
}

// ─── Practice vs Game ──────────────────────────────────────────────────────
// Both sides are computed by the SAME function on the SAME column names — that
// is the whole point of the shared schema — so the two numbers are directly
// comparable rather than merely adjacent.
// Three contexts, in ascending order of pressure: a focused DRILL, an
// intrasquad SCRIMMAGE, a real GAME. Reading them left to right is the whole
// point — a player who passes 2.4 in a drill, 2.0 in a scrimmage and 1.6 in a
// match has a transfer problem, and that only shows up side by side.
//
// `contexts` is always three entries, present or not, so the columns stay in
// the same place for every stat and every player.
// ─── Drills vs Scrimmage vs Game ───────────────────────────────────────────
// One grid, three context columns, grouped by skill so a stat reads straight
// across: PASSING → [drills] [scrimmage] [game], then HITTING, then SERVING.
//
// The three contexts sit in ascending order of pressure. A player who passes
// 2.4 in a drill, 2.0 in a scrimmage and 1.6 in a match has a transfer
// problem, and that only shows up when the three line up on one row.
//
// Every value is computed by the SHARED helpers — passAvg(), hpct(),
// serveInPct() — on the same column names in all three contexts, which is the
// whole reason practice_stats reuses player_game_stats' names.
const CONTEXT_ORDER = [
  { key: 'drills', tag: 'Drills', cls: 'pp-cmp-drill' },
  { key: 'scrimmage', tag: 'Scrimmage', cls: 'pp-cmp-scrim' },
  { key: 'game', tag: 'Game', cls: 'pp-cmp-game' },
];

// ─── Broadcast card ────────────────────────────────────────────────────────
// The player development view, styled as a broadcast stats readout: one
// container, hairline dividers instead of nested boxes, and three hero numbers
// that carry the whole card.
//
// Not one number is computed here. Every value comes from the same passAvg() /
// hpct() / serveInPct() helpers the team view, the trend chart and the compare
// grid already call, and the colour is the same perfShade() the chart draws
// with — so the hero figure and the last dot on the line agree by construction.
// Game numbers arrive as props from DataContext and are read, never written.

// Positions are stored as full names ("Outside Hitter"), so they print as they
// come. The short codes are only there for rosters imported with them.
const POSITION_LABEL = {
  S: 'Setter', OH: 'Outside Hitter', MB: 'Middle Blocker', MH: 'Middle Blocker',
  RS: 'Right Side', OPP: 'Opposite', L: 'Libero', LIB: 'Libero',
  DS: 'Defensive Specialist',
};
function positionLabel(position) {
  const raw = String(position ?? '').trim();
  if (!raw) return null;
  return POSITION_LABEL[raw.toUpperCase()] || raw;
}

// The three hero stats, and the same three rows in each comparison column.
// One definition drives both, so the big number and the DRILLS column beneath
// it can never be computed two different ways.
const HERO_STATS = [
  {
    key: 'passing',
    label: 'Passing',
    abbr: 'Pass',
    band: 'serve_receive',
    value: s => passAvg(s),
    sub: s => `across ${s.receives || 0} receive${(s.receives || 0) === 1 ? '' : 's'}`,
  },
  {
    key: 'hitting',
    label: 'Hitting',
    abbr: 'Hit',
    band: 'hitting',
    value: s => ((s.attempts || 0) > 0 ? hpct(s.kills, s.errors, s.attempts) : null),
    sub: s => `${s.kills || 0}K · ${s.errors || 0}E · ${s.attempts || 0} att`,
  },
  {
    key: 'serving',
    label: 'Serving',
    abbr: 'Serve',
    band: 'serving',
    value: s => serveInPct(s),
    sub: s => `${s.serves_in || 0} of ${s.serve_attempts || 0} in · ${pctFmt(acePct(s))} ace`,
    // A scrimmage and a match record aces but never the total serves taken, so
    // the rate has no denominator there. That is "not measurable", which is a
    // different thing from "no reps yet" — and the coach deserves the
    // difference. Same predicate the compare grid uses.
    untracked: s => (s.serve_attempts || 0) === 0
      && ((s.aces || 0) > 0 || (s.serve_errors || 0) > 0),
  },
];

function HeroStat({ stat, totals }) {
  const v = stat.value(totals);
  const fmt = perfBands(stat.band).fmt;
  const untracked = !!(stat.untracked && stat.untracked(totals));
  return (
    <div className="pp-bc-stat">
      <span className="pp-bc-stat-lbl">{stat.label}</span>
      <span
        className={`pp-bc-stat-val${v == null ? ' is-none' : ''}`}
        style={v == null ? undefined : { color: perfShade(stat.band, v) }}
      >
        {v == null ? '—' : fmt(v)}
      </span>
      <span className="pp-bc-stat-sub">
        {v == null ? (untracked ? 'not tracked' : 'no reps yet') : stat.sub(totals)}
      </span>
    </div>
  );
}

// The comparison, transposed against the old grid: a column per CONTEXT, three
// skill rows inside it. Read down a column for "how did they do in matches",
// across the columns for "does practice carry over" — which is the question
// this card exists to answer.
function ContextColumns({ byContext }) {
  return (
    <div className="pp-bc-ctx">
      {CONTEXT_ORDER.map(c => {
        const totals = byContext[c.key];
        return (
          <div key={c.key} className="pp-bc-col" data-ctx={c.key}>
            <div className="pp-bc-col-hd">{c.tag}</div>
            {HERO_STATS.map(stat => {
              const v = totals ? stat.value(totals) : null;
              const fmt = perfBands(stat.band).fmt;
              const untracked = !!(totals && stat.untracked && stat.untracked(totals));
              return (
                <div key={stat.key} className="pp-bc-row">
                  <span className="pp-bc-row-lbl">{stat.label}</span>
                  <span
                    className={`pp-bc-row-val${v == null ? ' is-none' : ''}`}
                    style={v == null ? undefined : { color: perfShade(stat.band, v) }}
                    title={v == null && untracked ? 'not tracked in this context' : undefined}
                  >
                    {v == null ? '—' : fmt(v)}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function BroadcastHead({ player, sessionCount }) {
  const pos = positionLabel(player.position);
  const num = player.jersey_number;
  const hasNum = num != null && num !== '';
  return (
    <header className="pp-bc-head">
      {hasNum && <span className="pp-bc-jersey">#{num}</span>}
      <h3 className="pp-bc-name">{player.name}</h3>
      <span className="pp-bc-meta">
        {[pos, `${sessionCount} session${sessionCount === 1 ? '' : 's'}`]
          .filter(Boolean).join(' · ')}
      </span>
    </header>
  );
}

// ─── Player cards ──────────────────────────────────────────────────────────
// The Players tab: one card per player, the whole roster, wrapping to fill
// whatever width the panel has.
//
// The three cells are HERO_STATS — the very same definitions the broadcast
// card's big numbers come from — so a card and the view it opens cannot show
// two different passing averages. Only the labels shorten.

// Full names are what the roster stores ("Outside Hitter"); a 215px card wants
// the code. Both directions resolve to the same six groups.
const POSITION_SHORT = [
  ['S', 'Setter', ['s', 'setter']],
  ['OH', 'Outside Hitter', ['oh', 'outside hitter', 'outside']],
  ['MB', 'Middle Blocker', ['mb', 'mh', 'middle blocker', 'middle hitter', 'middle']],
  ['RS', 'Right Side', ['rs', 'opp', 'right side', 'opposite']],
  ['L', 'Libero', ['l', 'lib', 'libero']],
  ['DS', 'Defensive Specialist', ['ds', 'defensive specialist', 'defensive']],
];
function positionShort(position) {
  const raw = String(position ?? '').trim().toLowerCase();
  if (!raw) return null;
  const hit = POSITION_SHORT.find(([, , words]) => words.includes(raw))
    || POSITION_SHORT.find(([, , words]) => words.some(w => w.length > 2 && raw.includes(w)));
  return hit ? { short: hit[0], full: hit[1] } : { short: String(position).trim(), full: String(position).trim() };
}

function PlayerCard({ player, totals, onPick, selected = false }) {
  const num = player.jersey_number;
  const hasNum = num != null && num !== '';
  const pos = positionShort(player.position);
  return (
    <button
      type="button"
      className={`pp-pcard${selected ? ' is-on' : ''}`}
      onClick={() => onPick(player.id)}
      aria-pressed={selected}
    >
      <span className="pp-pcard-head">
        <span className="pp-pcard-av">{hasNum ? num : '—'}</span>
        <span className="pp-pcard-id">
          <span className="pp-pcard-name">{player.name}</span>
          <span className="pp-pcard-pos" title={pos ? pos.full : undefined}>
            {pos ? pos.short : 'No position'}
          </span>
        </span>
      </span>
      <span className="pp-pcard-stats">
        {HERO_STATS.map(stat => {
          const v = stat.value(totals);
          const fmt = perfBands(stat.band).fmt;
          return (
            <span key={stat.key} className="pp-pcard-stat">
              <span className="pp-pcard-stat-lbl">{stat.abbr}</span>
              <span
                className={`pp-pcard-stat-val${v == null ? ' is-none' : ''}`}
                style={v == null ? undefined : { color: perfShade(stat.band, v) }}
              >
                {v == null ? '—' : fmt(v)}
              </span>
            </span>
          );
        })}
      </span>
    </button>
  );
}

// The left rail: the whole roster as compact cards, and the only route into a
// player's development view.
//
// It computes its own per-player totals rather than taking them from the trends
// panel beside it — the two are separate grid areas and cannot share a render.
// Both call sumPracticeRows over the same rows, so the numbers are identical by
// construction; what is duplicated is the arithmetic, not the definition.
export function PlayerRail({ team, players, sessions, practiceStats, playerId, onSelectPlayer }) {
  const roster = useMemo(
    () => sortByJersey((players || []).filter(p => p.team_id === team?.id)),
    [players, team?.id]
  );

  const totalsById = useMemo(() => {
    const known = new Set((sessions || []).map(s => s.id));
    const mine = (practiceStats || []).filter(r => known.has(r.practice_session_id));
    const out = {};
    for (const p of roster) {
      out[p.id] = sumPracticeRows(mine.filter(r => r.player_id === p.id));
    }
    return out;
  }, [roster, sessions, practiceStats]);

  if (roster.length === 0) {
    return <div className="pp-empty">This team has no players on its roster yet.</div>;
  }

  return (
    <div className="pp-pcards pp-pcards-rail">
      {roster.map(p => (
        <PlayerCard
          key={p.id}
          player={p}
          totals={totalsById[p.id] || emptyPracticeRow()}
          onPick={onSelectPlayer}
          selected={p.id === playerId}
        />
      ))}
    </div>
  );
}

// ─── Team progression ──────────────────────────────────────────────────────
// One chart per drill, each plotting the TEAM average for that drill over
// time. Deliberately the same TrendChart the individual player view uses, so
// the graduated shading, the split-gradient segments and the band gridlines
// are one implementation — a team chart and a player chart cannot drift.
//
// All six cards always render, empty states included, so the panel keeps a
// stable shape as a season fills in — and an empty scrimmage cell under a full
// drill cell is itself information.

// A drawn chevron rather than a glyph: the rest of the app uses line icons,
// and a text arrow inherits the tabular font and sits off the baseline.
function Chevron({ open }) {
  return (
    <svg
      className={`pp-agg-chev${open ? ' is-open' : ''}`}
      width="8" height="5" viewBox="0 0 8 5" aria-hidden="true" focusable="false"
    >
      <path
        d="M0.8 0.9 L4 4.1 L7.2 0.9" fill="none" stroke="currentColor"
        strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

// One session's figures, in the same order and from the same helper as the
// total beneath them — so a column of session rows and the total it adds up to
// can never be formatted, ordered or derived two different ways.
function SessionRow({ metric, label, row, isTotal = false }) {
  const figures = drillAggregate(metric, row);
  const lead = figures.find(f => f.lead) || null;
  const counts = figures.filter(f => !f.lead);
  return (
    <div className={`pp-agg-row${isTotal ? ' is-total' : ''}`}>
      <dt className="pp-agg-row-lbl">{label}</dt>
      <dd className="pp-agg-row-figs">
        {counts.map(f => (
          <span key={f.key} className="pp-agg-row-fig">
            <span className="pp-agg-row-key">{f.label}</span>
            <span className="pp-agg-row-val">{f.value}</span>
          </span>
        ))}
      </dd>
      <dd
        className="pp-agg-row-rate"
        style={lead && lead.raw != null ? { color: perfShade(metric, lead.raw) } : undefined}
      >
        {lead ? lead.value : '—'}
      </dd>
    </div>
  );
}

// The totals line that sits where the threshold legend used to, plus the way
// into the sessions behind it.
//
// The merged total is what the card shows by default: the dashboard is a
// glance, and four cards each unfolding a table by default would bury the
// graphs. Expanding is the deliberate act of asking "which session".
//
// The derived rate is shaded with the very same perfShade() the chart draws
// with, so the summary colour and the last dot on the line always agree; the
// raw counts stay plain, because a count has no good or bad.
// `headline` is off only on the scrimmage card, where the aspect lines above
// already state this metric's total — printing it a second time directly
// underneath would be the same number twice in three inches.
function AggregateBlock({ metric, row, sessions, label = 'Total', headline = true }) {
  const [open, setOpen] = useState(false);
  const listId = useId().replace(/:/g, '');
  const figures = drillAggregate(metric, row);
  // One session IS the total, so there is nothing to expand into.
  const rows = sessions || [];
  const splittable = rows.length > 1;

  return (
    <div className="pp-aggwrap">
      {splittable && (
        <button
          type="button"
          className={`pp-agg-toggle${open ? ' is-open' : ''}`}
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          aria-controls={listId}
        >
          <Chevron open={open} />
          <span>By session</span>
          <span className="pp-agg-toggle-n">{rows.length}</span>
        </button>
      )}

      {splittable && open && (
        <dl className="pp-agg-rows" id={listId}>
          {rows.map(s => (
            <SessionRow key={s.id} metric={metric} label={s.label || s.dateLabel} row={s.row} />
          ))}
          <SessionRow metric={metric} label={label} row={row} isTotal />
        </dl>
      )}

      {headline && <dl className="pp-agg">
        {figures.map(f => (
          <div key={f.key} className={`pp-agg-fig${f.lead ? ' is-lead' : ''}`}>
            <dt className="pp-agg-lbl">{f.label}</dt>
            <dd
              className="pp-agg-val"
              style={f.lead ? { color: perfShade(metric, f.raw) } : undefined}
            >
              {f.value}
            </dd>
          </div>
        ))}
      </dl>}
    </div>
  );
}

// One skill in one context: the chart, and the totals under it.
//
// Drill and scrimmage cards are the SAME component. That is the point of the
// grid: a scrimmage passing card and the passing drill above it are computed,
// shaded and laid out identically, so the only thing that differs between them
// is the data — which is exactly the comparison the pairing exists to make.
function TrendCard({ metric, context, points, row, sessions, perSession }) {
  const domain = drillHeadline(metric, emptyPracticeRow()).domain;
  const scrim = context === 'scrimmage';
  return (
    <section className={`pp-tg pp-tg-${scrim ? 'scrim' : 'drill'}`}>
      <div className="pp-tg-head">
        <h4 className="pp-tg-title">{drillOf(metric).label}</h4>
        <span className={`pp-tg-tag${scrim ? ' is-scrim' : ''}`}>
          {scrim ? 'Scrimmage' : 'Drill'}
        </span>
        <span className="pp-tg-meta">
          {sessions === 0 ? 'none' : `${sessions} session${sessions !== 1 ? 's' : ''}`}
        </span>
      </div>

      {sessions === 0 ? (
        <div className="pp-tg-empty">
          {scrim
            ? 'No scrimmages tracked yet. Their passing, hitting and serving appear here beside the drill above.'
            : `Nothing tracked yet. Team progression appears here after the first ${drillOf(metric).short.toLowerCase()} session.`}
        </div>
      ) : (
        <>
          {points.length === 0 ? (
            // The counts below are still real — it is the RATE that cannot be
            // derived. For serving in a scrimmage we know exactly why.
            <div className="pp-tg-note">
              {scrim && metric === 'serving'
                ? 'Serve-in % needs a total serve count, which scrimmage tracking does not record. The ace and error totals below are real.'
                : 'Nothing to plot yet — the totals below are the reps logged so far.'}
            </div>
          ) : (
            <TrendChart points={points} domain={domain} drillType={metric} />
          )}
          <AggregateBlock metric={metric} row={row} sessions={perSession} />
        </>
      )}
    </section>
  );
}

// The team panel: three skills across, two contexts down.
//
// Cards are emitted PAIR-major — passing drill, passing scrimmage, hitting
// drill, hitting scrimmage… — which is the order they should be read in, and
// the order a narrow screen stacks them in. On a wide screen the grid flows
// that same sequence down columns instead, which puts each scrimmage card
// directly under its drill without reordering the markup to do it.
function TeamGraphs({ series, totals, counts, scrimSeries, perSession }) {
  const scrimSessions = counts?.scrimmage || 0;
  return (
    <>
      <div className="pp-tg-grid pp-tg-paired">
        {SCRIM_METRICS.map(m => (
          <Fragment key={m}>
            <TrendCard
              metric={m}
              context="drill"
              points={series?.[m] || []}
              row={totals?.[m] || emptyPracticeRow()}
              sessions={counts?.[m] || 0}
              perSession={perSession?.[m]}
            />
            <TrendCard
              metric={m}
              context="scrimmage"
              points={scrimSeries?.[m] || []}
              // Every scrimmage card reads the SAME summed scrimmage row; the
              // metric decides which counters it takes from it.
              row={totals?.scrimmage || emptyPracticeRow()}
              sessions={scrimSessions}
              perSession={perSession?.scrimmage}
            />
          </Fragment>
        ))}
      </div>

      {/* Custom drills have no scrimmage counterpart, so they sit outside the
          pairing rather than distorting it into a fourth column. */}
      {counts?.custom > 0 && (
        <div className="pp-tg-grid pp-tg-extra">
          <TrendCard
            metric="custom"
            context="drill"
            points={series?.custom || []}
            row={totals?.custom || emptyPracticeRow()}
            sessions={counts.custom}
            perSession={perSession?.custom}
          />
        </div>
      )}
    </>
  );
}

// ─── Team stats ────────────────────────────────────────────────────────────
// The card's default view: how the squad is doing overall, then every player
// with their headline numbers so weak and strong areas are scannable in one
// pass. Each number carries the same graduated shade the trend chart uses, so
// a red column down the list is immediately visible.
//
// Sums are taken over RAW COUNTERS before any rate is derived (sumPracticeRows
// then drillHeadline), never by averaging per-session rates — so a player who
// took 40 receives in one session and 4 in another is weighted correctly.
function TeamStats({ practiceStats, sessionById }) {
  const {
    hasData, series, totals, counts, scrimSeries, perSession,
  } = useMemo(() => {
    // Only rows whose session still resolves, grouped by drill and by player.
    const rows = (practiceStats || [])
      .map(r => ({ r, s: sessionById[r.practice_session_id] }))
      .filter(x => x.s);

    const present = DRILL_ORDER.filter(d => rows.some(x => x.s.drill_type === d));

    // Team progression: one point per SESSION, aggregated across everyone who
    // took part. Summing the counters and deriving the rate once is what makes
    // this the same number the session chip shows — and it is rep-weighted, so
    // a 40-receive session counts for more than a 4-receive one.
    const series = {};
    const bySession = new Map();
    for (const x of rows) {
      if (!bySession.has(x.s.id)) bySession.set(x.s.id, { s: x.s, rs: [] });
      bySession.get(x.s.id).rs.push(x.r);
    }
    for (const { s: sess, rs } of bySession.values()) {
      const h = drillHeadline(sess.drill_type, sumPracticeRows(rs));
      if (h.value == null) continue;
      (series[sess.drill_type] ||= []).push({
        value: h.value,
        display: h.display,
        dateLabel: fmtDate(sess.session_date),
        _d: String(sess.session_date || ''),
        _c: String(sess.created_at || ''),
      });
    }
    // Overall totals per drill, for the aggregate line under each graph.
    // Summed from the raw counters — the rate is derived from the total, never
    // averaged from per-session rates, so a 40-receive session outweighs a
    // 4-receive one exactly as it should.
    const totals = {};
    const counts = {};
    for (const d of present) {
      const mine = rows.filter(x => x.s.drill_type === d);
      totals[d] = sumPracticeRows(mine.map(x => x.r));
      // Sessions HELD, not sessions that happened to yield this drill's
      // headline — otherwise a scrimmage with no attempts would read "no
      // sessions" on a card whose passing numbers are sitting right there.
      counts[d] = new Set(mine.map(x => x.s.id)).size;
    }

    // A scrimmage records every counter, so the same sessions can be read as
    // passing, hitting OR serving. Three parallel series, one per metric, each
    // built with that metric's own headline — which is what makes the toggle
    // switch the chart's shading bands along with its numbers.
    const scrimSeries = {};
    for (const m of SCRIM_METRICS) scrimSeries[m] = [];
    for (const { s: sess, rs } of bySession.values()) {
      if (sess.drill_type !== 'scrimmage') continue;
      const summed = sumPracticeRows(rs);
      for (const m of SCRIM_METRICS) {
        const h = drillHeadline(m, summed);
        if (h.value == null) continue;
        scrimSeries[m].push({
          value: h.value,
          display: h.display,
          dateLabel: fmtDate(sess.session_date),
          _d: String(sess.session_date || ''),
          _c: String(sess.created_at || ''),
        });
      }
    }

    // The same sessions again, this time keeping each one's summed counters so
    // a card can be expanded into a row per session. One row per session per
    // drill, aggregated across everyone who took part — exactly the rows the
    // chart plots, which is what keeps an expanded table and the line above it
    // telling the same story.
    const perSession = {};
    for (const { s: sess, rs } of bySession.values()) {
      (perSession[sess.drill_type] ||= []).push({
        id: sess.id,
        row: sumPracticeRows(rs),
        dateLabel: fmtDate(sess.session_date),
        name: sess.name || '',
        _d: String(sess.session_date || ''),
        _c: String(sess.created_at || ''),
      });
    }

    // Chronological, oldest first — a progression reads left to right.
    const chrono = (a, b) => a._d.localeCompare(b._d) || a._c.localeCompare(b._c);
    for (const k of Object.keys(perSession)) perSession[k].sort(chrono);

    // Two sessions of one drill in an afternoon is normal, and three rows all
    // labelled "8/31" cannot be told apart. Number a date only where it
    // repeats, in the order the sessions were run, so the common case stays a
    // plain date.
    for (const list of Object.values(perSession)) {
      const seen = {};
      for (const x of list) seen[x._d] = (seen[x._d] || 0) + 1;
      const n = {};
      for (const x of list) {
        if (seen[x._d] < 2) { x.label = x.dateLabel; continue; }
        n[x._d] = (n[x._d] || 0) + 1;
        x.label = `${x.dateLabel}·${n[x._d]}`;
      }
    }
    for (const k of Object.keys(series)) series[k].sort(chrono);
    for (const k of Object.keys(scrimSeries)) scrimSeries[k].sort(chrono);

    return {
      // Just whether there is anything at all — the four derived headlines
      // this used to return existed only for the summary cards.
      hasData: present.length > 0,
      series, totals, counts, scrimSeries, perSession,
    };
  }, [practiceStats, sessionById]);

  if (!hasData) {
    return (
      <div className="pp-zero pp-zero-sm">
        <div className="pp-zero-title">No practice data yet</div>
        <p className="pp-zero-text">
          Team averages and the player breakdown appear here once a drill has
          been tracked.
        </p>
      </div>
    );
  }

  return (
    <div className="pp-team">
      <TeamGraphs
        series={series} totals={totals} counts={counts}
        scrimSeries={scrimSeries} perSession={perSession}
      />
    </div>
  );
}

// The middle panel: the team trend charts, or one player's development view
// when the rail beside it has a selection. Selecting is the rail's job now, so
// this component reads playerId and never sets it.
export default function PracticeTrends({
  team, players, sessions, practiceStats, playerGameStats, playerId,
}) {
  const roster = useMemo(
    () => sortByJersey((players || []).filter(p => p.team_id === team?.id)),
    [players, team?.id]
  );
  // `playerId` is owned by PracticePal so the card header can title itself and
  // offer the way back; null means the team view. Both the chips and the team
  // list route through onSelectPlayer, which is what keeps them in sync.
  const [drillType, setDrillType] = useState('serve_receive');

  const sessionById = useMemo(() => {
    const m = {};
    (sessions || []).forEach(s => { m[s.id] = s; });
    return m;
  }, [sessions]);

  // Every practice row belonging to the chosen player, each paired with its
  // session so the drill type and date travel with it.
  const myPractice = useMemo(() => {
    if (!playerId) return [];
    return (practiceStats || [])
      .filter(r => r.player_id === playerId)
      .map(r => ({ row: r, session: sessionById[r.practice_session_id] }))
      .filter(x => x.session)
      // Oldest first — a trend reads left to right.
      .sort((a, b) => String(a.session.session_date).localeCompare(String(b.session.session_date))
        || String(a.session.created_at || '').localeCompare(String(b.session.created_at || '')));
  }, [playerId, practiceStats, sessionById]);

  // Which drills this player actually has data for, so the selector never
  // offers an empty tab.
  const drillsWithData = useMemo(() => {
    const set = new Set(myPractice.map(x => x.session.drill_type));
    return DRILL_ORDER.filter(d => set.has(d));
  }, [myPractice]);

  const activeDrill = drillsWithData.includes(drillType)
    ? drillType
    : (drillsWithData[0] || 'serve_receive');

  const drillRows = useMemo(
    () => myPractice.filter(x => x.session.drill_type === activeDrill),
    [myPractice, activeDrill]
  );

  // Chart points — one per session, dropping any session where the player got
  // no reps (a null value would be a hole in the line, not a data point).
  const points = useMemo(() => drillRows.map(({ row, session }) => {
    const head = drillHeadline(activeDrill, row);
    return {
      value: head.value,
      display: head.display,
      reps: head.reps,
      repsLabel: head.repsLabel,
      session,
      dateLabel: fmtDate(session.session_date),
    };
  }).filter(p => p.value != null), [drillRows, activeDrill]);

  const drillTotal = useMemo(
    () => sumPracticeRows(drillRows.map(x => x.row)),
    [drillRows]
  );
  const drillTotalHead = drillHeadline(activeDrill, drillTotal);

  // ── Practice vs Game ─────────────────────────────────────────────────────
  // Practice side: every serve-receive / hitting session summed.
  // Game side: the player's player_game_stats rows summed. READ ONLY.
  // One sum across every NON-scrimmage drill row feeds all three skills at
  // once. That is safe because each focused drill only ever fills its own
  // counters — a serve-receive row has no attempts, a hitting row has no
  // receives — so nothing overlaps and nothing is double counted.
  const practiceDrills = useMemo(
    () => sumPracticeRows(myPractice.filter(x => x.session.drill_type !== 'scrimmage').map(x => x.row)),
    [myPractice]
  );
  // Scrimmage rows carry the full stat set, so one sum serves both comparisons.
  const scrimmage = useMemo(
    () => sumPracticeRows(myPractice.filter(x => x.session.drill_type === 'scrimmage').map(x => x.row)),
    [myPractice]
  );
  const gameTotals = useMemo(
    () => playerTotals((playerGameStats || []).filter(s => s.player_id === playerId)),
    [playerGameStats, playerId]
  );

  // The hero line is this player across EVERY practice rep, drills and
  // scrimmages together — the context block underneath is what splits them.
  const practiceAll = useMemo(
    () => sumPracticeRows(myPractice.map(x => x.row)),
    [myPractice]
  );
  const sessionCount = useMemo(
    () => new Set(myPractice.map(x => x.session.id)).size,
    [myPractice]
  );

  const player = roster.find(p => p.id === playerId) || null;

  if (roster.length === 0) {
    return <div className="pp-empty">This team has no players on its roster yet.</div>;
  }

  return (
    <div className="pp-trends">
      {/* Player selector */}
      {/* The row of player chips that used to sit here has gone. It listed the
          same names as the leaderboard directly below it, so it was a second
          copy of the same control taking the top of the card — a player is
          picked by clicking their row, and left by the header's back button. */}

      {!player ? (
        <TeamStats practiceStats={practiceStats} sessionById={sessionById} />
      ) : (
        // ONE container. Header, hero numbers, the context comparison and the
        // trend all live inside it, separated by hairlines and space rather
        // than by nested cards with their own backgrounds.
        <section className="pp-bc">
          <BroadcastHead player={player} sessionCount={sessionCount} />

          {/* The hero: this player across every practice rep they have. The
              breakdown by context is the block directly beneath, so the top
              line is deliberately the whole picture. */}
          <div className="pp-bc-hero">
            {HERO_STATS.map(stat => (
              <HeroStat key={stat.key} stat={stat} totals={practiceAll} />
            ))}
          </div>

          <div className="pp-bc-sect">
            <div className="pp-bc-sect-hd">
              <span className="pp-bc-sect-ttl">By context</span>
              <span className="pp-bc-sect-sub">Game data is read-only</span>
            </div>
            <ContextColumns
              byContext={{ drills: practiceDrills, scrimmage, game: gameTotals }}
            />
          </div>

          {myPractice.length === 0 ? (
            <div className="pp-bc-sect">
              <div className="pp-bc-empty">
                {player.name} has not been tracked in a drill yet. Start one from
                &ldquo;Start a drill&rdquo; and the trend appears here.
              </div>
            </div>
          ) : (
            <div className="pp-bc-sect">
              <div className="pp-bc-sect-hd">
                <span className="pp-bc-sect-ttl">Trend</span>
                <span className="pp-bc-sect-sub">
                  {drillRows.length} {drillOf(activeDrill).short.toLowerCase()} session{drillRows.length !== 1 ? 's' : ''}
                  {' · '}{drillTotalHead.reps} {drillTotalHead.repsLabel}
                </span>
              </div>

              <div className="pp-bc-trendbar">
                {drillsWithData.length > 1 && (
                  <div className="pp-seg pp-seg-mini">
                    {drillsWithData.map(d => (
                      <button
                        key={d}
                        type="button"
                        className={`pp-seg-btn${d === activeDrill ? ' on' : ''}`}
                        onClick={() => setDrillType(d)}
                      >
                        {drillOf(d).short}
                      </button>
                    ))}
                  </div>
                )}
                <span className="pp-bc-trendbar-val">
                  <span
                    className="pp-bc-trendbar-num"
                    style={{ color: perfShade(activeDrill, drillTotalHead.value) }}
                  >
                    {drillTotalHead.display}
                  </span>
                  <span className="pp-bc-trendbar-lbl">{drillTotalHead.label}</span>
                </span>
              </div>

              <TrendChart points={points} domain={drillTotalHead.domain} drillType={activeDrill} />

              <div className="pp-bc-log">
                {drillRows.slice().reverse().map(({ row, session }) => {
                  const head = drillHeadline(activeDrill, row);
                  return (
                    <div key={session.id} className="pp-bc-logrow">
                      <span className="pp-bc-log-date">{fmtDate(session.session_date)}</span>
                      <span className="pp-bc-log-name">{session.name || sessionDrillLabel(session)}</span>
                      <span className="pp-bc-log-break">
                        {drillBreakdown(activeDrill, row).map(([abbr, v]) => (
                          <span key={abbr} className="pp-bc-pair">
                            <b>{v}</b><span>{abbr}</span>
                          </span>
                        ))}
                      </span>
                      <span
                        className="pp-bc-log-val"
                        style={{ color: perfShade(activeDrill, head.value) }}
                      >
                        {head.display}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <p className="pp-bc-foot">
            Practice reps are stored in their own tables and are never counted
            towards a player&rsquo;s match statistics. A serve-in&nbsp;% needs the
            total serves taken, which only the serving drill records — scrimmages
            and matches log aces and serve errors but not every serve, so serving
            reads &ldquo;—&rdquo; in those columns.
          </p>
        </section>
      )}
    </div>
  );
}
