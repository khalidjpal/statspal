import { useMemo, useState, useId } from 'react';
// Number formatting comes from each drill's band definition (perfBands().fmt),
// which is the same pfmt/n3/pctFmt the rest of the app uses.
import { hpct, passAvg, playerTotals } from '../utils/stats';
import {
  DRILL_ORDER, drillOf, drillHeadline, drillBreakdown,
  sumPracticeRows, sessionDrillLabel, emptyPracticeRow,
  perfShade, perfBands, perfRampStops, perfRampTicks, serveInPct, acePct, pctFmt,
  drillAggregate, SCRIM_METRICS, METRIC_LABEL,
  scrimmageAspects,
} from '../utils/practice';
import { sortByJersey } from '../utils/sort';

// Per-player development: how a player's practice numbers move across sessions,
// and how those numbers sit next to the same player's GAME numbers.
//
// Game stats are read here and never written. They arrive as props straight
// from DataContext's player_game_stats fetch; this screen has no Supabase
// client of its own precisely so it cannot write to a game table by accident.

const TIER_LABEL = { good: 'Good', ok: 'OK', bad: 'Needs work' };

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

// The legend is the ramp itself, not a set of swatches — the point being made
// is that the SHADE carries magnitude, which three flat chips cannot say. The
// bar is built by sampling perfShade() across the same floor→ceil range the
// chart shades against, so it can never drift from what the chart draws.
function PerfLegend({ drillType }) {
  const bands = perfBands(drillType);
  const stops = perfRampStops(drillType);
  const ticks = perfRampTicks(drillType);
  const css = stops.map(s => `${s.color} ${s.pct.toFixed(1)}%`).join(', ');

  return (
    <div className="pp-legend">
      <div className="pp-legend-row">
        <span className="pp-legend-cap">{TIER_LABEL.bad}</span>
        <span className="pp-legend-bar" style={{ background: `linear-gradient(90deg, ${css})` }}>
          {ticks.map(t => (
            <span key={t.key} className="pp-legend-tick" style={{ left: `${t.pct}%` }} />
          ))}
        </span>
        <span className="pp-legend-cap">{TIER_LABEL.good}</span>
      </div>
      <div className="pp-legend-foot">
        <span className="pp-legend-note">
          Shade shows degree · <b>{bands.fmt(bands.ok)}</b> {TIER_LABEL.ok.toLowerCase()}
          {' · '}<b>{bands.fmt(bands.good)}</b> {TIER_LABEL.good.toLowerCase()}
        </span>
        <span className="pp-legend-scale">{bands.scale}</span>
      </div>
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

// `band` names the perfBands entry used to shade a value; null means the value
// is a raw count with no good/bad scale, so it stays uncoloured.
//
// `untracked` marks the case where a context CANNOT produce this stat rather
// than merely having no reps yet — the difference between "nothing recorded"
// and "this is not measurable here", which the coach deserves to be told.
const COMPARE_SKILLS = [
  {
    key: 'passing',
    label: 'Passing',
    rows: [{
      key: 'pass_avg',
      label: 'Passing average',
      note: '0–3 scale',
      band: 'serve_receive',
      value: s => passAvg(s),
      reps: s => s.receives || 0,
      repsLabel: 'receives',
    }],
  },
  {
    key: 'hitting',
    label: 'Hitting',
    rows: [{
      key: 'hit_pct',
      label: 'Hitting %',
      note: '(kills − errors) ÷ attempts',
      band: 'hitting',
      value: s => hpct(s.kills, s.errors, s.attempts),
      reps: s => s.attempts || 0,
      repsLabel: 'attempts',
    }],
  },
  {
    key: 'serving',
    label: 'Serving',
    rows: [
      {
        key: 'serve_in',
        label: 'Serve-in %',
        note: 'serves in ÷ serves taken',
        band: 'serving',
        value: s => serveInPct(s),
        reps: s => s.serve_attempts || 0,
        repsLabel: 'serves',
        // StatsPal's live tracker records aces and serve errors but never the
        // TOTAL serves taken — and the scrimmage shares that button set, as
        // does player_game_stats. So the denominator only exists in the
        // serving drill. Saying "not tracked" is honest; showing 0% would be a
        // lie, and a blank would look like the player never served.
        untracked: s => (s.serve_attempts || 0) === 0
          && ((s.aces || 0) > 0 || (s.serve_errors || 0) > 0),
      },
      {
        key: 'ace_pct',
        label: 'Ace %',
        note: 'aces ÷ serves taken',
        band: null,
        value: s => acePct(s),
        fmt: v => pctFmt(v),
        reps: s => s.serve_attempts || 0,
        repsLabel: 'serves',
        // Same denominator problem as serve-in %: a scrimmage and a match
        // record aces but never the total serves, so the rate simply does not
        // exist there. Say so rather than implying a 0%.
        untracked: s => (s.serve_attempts || 0) === 0
          && ((s.aces || 0) > 0 || (s.serve_errors || 0) > 0),
      },
      {
        key: 'aces',
        label: 'Aces',
        note: 'count, with serve errors',
        band: null,
        value: s => ((s.aces || 0) + (s.serve_errors || 0) > 0 ? (s.aces || 0) : null),
        fmt: v => String(v),
        reps: s => s.serve_errors || 0,
        repsLabel: 'serve errors',
      },
    ],
  },
];

function CompareCell({ row, stats, ctxKey }) {
  const value = stats ? row.value(stats) : null;
  const isUntracked = !!(stats && row.untracked && row.untracked(stats));
  const has = value != null;
  const fmt = row.fmt || perfBands(row.band || 'serve_receive').fmt;

  return (
    <div className={`pp-cmp-cell${has ? '' : ' pp-cmp-cell-none'}`} data-ctx={ctxKey}>
      <span
        className="pp-cmp-cell-val"
        style={row.band && has ? { color: perfShade(row.band, value) } : undefined}
      >
        {has ? fmt(value) : '—'}
      </span>
      <span className="pp-cmp-cell-sub">
        {has
          ? `${row.reps(stats)} ${row.repsLabel}`
          : isUntracked ? 'not tracked' : 'no data'}
      </span>
    </div>
  );
}

function CompareGrid({ byContext }) {
  return (
    <div className="pp-cmp-grid">
      {/* Column headers, stated once and repeated visually down every skill
          block by keeping the grid columns identical. */}
      <div className="pp-cmp-grid-head">
        <span className="pp-cmp-corner" />
        {CONTEXT_ORDER.map(c => (
          <span key={c.key} className={`pp-cmp-ctx ${c.cls}`}>{c.tag}</span>
        ))}
      </div>

      {COMPARE_SKILLS.map(skill => (
        <div key={skill.key} className="pp-cmp-skill">
          <div className="pp-cmp-skill-hd">{skill.label}</div>
          {skill.rows.map(row => (
            <div key={row.key} className="pp-cmp-metric">
              <span className="pp-cmp-metric-lbl">
                <span className="pp-cmp-metric-name">{row.label}</span>
                <span className="pp-cmp-metric-note">{row.note}</span>
              </span>
              {CONTEXT_ORDER.map(c => (
                <CompareCell key={c.key} row={row} stats={byContext[c.key]} ctxKey={c.key} />
              ))}
            </div>
          ))}
        </div>
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
// The four named drills always render, empty state included, so the panel
// keeps a stable shape as a season fills in. Custom only appears once it has
// data, because a permanently empty fifth card is noise — and because a
// "Custom" series pools whatever different drills a coach invented, so it is
// the one series that needs reading with care.
const CORE_DRILLS = ['serve_receive', 'hitting', 'serving', 'scrimmage'];

// The totals line that sits where the threshold legend used to. The derived
// rate is shaded with the very same perfShade() the chart draws with, so the
// summary colour and the last dot on the line always agree; the raw counts
// stay plain, because a count has no good or bad.
function AggregateLine({ metric, row }) {
  const figures = drillAggregate(metric, row);
  return (
    <dl className="pp-agg">
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
    </dl>
  );
}

// The scrimmage card's totals: every aspect of the game, one line each.
//
// It replaces the single-metric aggregate line the other cards use, because a
// scrimmage is not one metric — and the three aspects that DO have a rate hand
// straight off to the same drillAggregate() those cards call, so the passing
// average here and the one under the passing graph cannot disagree.
//
// The rate sits in its own right-hand column so the aspects that have one line
// up down the card; the three that are pure counts leave it empty rather than
// printing a dash, since no rate is missing — there simply is not one.
function AspectLines({ row, current }) {
  return (
    <dl className="pp-asps">
      {scrimmageAspects(row).map(a => {
        const lead = a.figures.find(f => f.lead) || null;
        const counts = a.figures.filter(f => !f.lead);
        return (
          <div
            key={a.key}
            className={`pp-asp${a.metric === current ? ' is-current' : ''}`}
          >
            <dt className="pp-asp-lbl">{a.label}</dt>
            <dd className="pp-asp-figs">
              {counts.map(f => (
                <span key={f.key} className="pp-asp-fig">
                  <span className="pp-asp-key">{f.label}</span>
                  <span className="pp-asp-val">{f.value}</span>
                </span>
              ))}
            </dd>
            {lead ? (
              <dd className="pp-asp-rate" style={{ color: perfShade(a.metric, lead.raw) }}>
                {lead.value}
              </dd>
            ) : <dd className="pp-asp-rate-none" />}
          </div>
        );
      })}
    </dl>
  );
}

// A scrimmage is the one drill with several stories to tell, so its card gets
// a metric toggle. Switching it swaps the SERIES, the shading bands and the
// aggregate line together — all three come from the chosen metric, so the card
// can never show a hitting line under a passing scale.
function ScrimCard({ series, row, sessions }) {
  const [metric, setMetric] = useState('serve_receive');
  const pts = series[metric] || [];
  const domain = drillHeadline(metric, emptyPracticeRow()).domain;
  const segId = useId();

  return (
    <>
      <div className="pp-seg pp-seg-mini pp-scrim-seg" role="group" aria-label="Scrimmage stat">
        {SCRIM_METRICS.map(m => (
          <button
            key={m}
            type="button"
            id={`${segId}-${m}`}
            className={`pp-seg-btn${m === metric ? ' on' : ''}`}
            aria-pressed={m === metric}
            onClick={() => setMetric(m)}
          >
            {METRIC_LABEL[m]}
          </button>
        ))}
      </div>
      {pts.length === 0 ? (
        // The counts below are still real — it is only the RATE that cannot
        // be derived, and for serving we know exactly why: scrimmage tracking
        // logs aces and errors but never a total serve count, so there is no
        // denominator. Say that, rather than drawing an empty chart.
        <div className="pp-tg-note">
          {metric === 'serving'
            ? 'Serve-in % needs a total serve count, which scrimmage tracking does not record. The ace and error totals below are real.'
            : `No ${METRIC_LABEL[metric].toLowerCase()} rate to plot across ${sessions === 1 ? 'this scrimmage' : 'these scrimmages'} yet.`}
        </div>
      ) : (
        <TrendChart points={pts} domain={domain} drillType={metric} />
      )}
      <AspectLines row={row} current={metric} />
    </>
  );
}

function TeamGraphs({ series, totals, counts, scrimSeries }) {
  const shown = [...CORE_DRILLS, ...(counts?.custom ? ['custom'] : [])];
  return (
    <div className="pp-tg-grid">
      {shown.map(d => {
        const pts = series[d] || [];
        const domain = drillHeadline(d, emptyPracticeRow()).domain;
        const total = counts?.[d] || 0;
        const row = totals?.[d] || emptyPracticeRow();
        return (
          <section key={d} className="pp-tg">
            <div className="pp-tg-head">
              <h4 className="pp-tg-title">{drillOf(d).label}</h4>
              <span className="pp-tg-meta">
                {total === 0 ? 'no sessions' : `${total} session${total !== 1 ? 's' : ''}`}
              </span>
            </div>
            {total === 0 ? (
              <div className="pp-tg-empty">
                Nothing tracked yet. Team progression appears here after the
                first {drillOf(d).short.toLowerCase()} session.
              </div>
            ) : d === 'scrimmage' ? (
              <ScrimCard series={scrimSeries || {}} row={row} sessions={total} />
            ) : (
              <>
                {pts.length === 0 ? (
                  <div className="pp-tg-note">
                    Nothing to plot yet — the totals below are the reps logged
                    so far.
                  </div>
                ) : (
                  <TrendChart points={pts} domain={domain} drillType={d} />
                )}
                <AggregateLine metric={d} row={row} />
              </>
            )}
          </section>
        );
      })}
    </div>
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
const METRIC_ABBR = {
  serve_receive: 'Pass', hitting: 'Hit', serving: 'Srv', custom: 'Custom', scrimmage: 'Scrim',
};

function TeamStats({ roster, practiceStats, sessionById, onPick }) {
  const [sortDrill, setSortDrill] = useState(null);
  // The graphs are the default view. The player list stays one tap away —
  // removing it outright would have left no route into a player at all, since
  // the leaderboard is the only way in now that the chip row is gone.
  const [view, setView] = useState('team');

  const { teamMetrics, perPlayer, drills, series, totals, counts, scrimSeries } = useMemo(() => {
    // Only rows whose session still resolves, grouped by drill and by player.
    const rows = (practiceStats || [])
      .map(r => ({ r, s: sessionById[r.practice_session_id] }))
      .filter(x => x.s);

    const present = DRILL_ORDER.filter(d => rows.some(x => x.s.drill_type === d));

    const headline = (drill, subset) => {
      if (subset.length === 0) return null;
      const summed = sumPracticeRows(subset);
      const h = drillHeadline(drill, summed);
      // `row` rides along so serving can show a second figure (ace %) derived
      // from the very same aggregate, instead of summing again somewhere else.
      return h.value == null ? null : { drill, ...h, row: summed };
    };

    const team = present
      .map(d => headline(d, rows.filter(x => x.s.drill_type === d).map(x => x.r)))
      .filter(Boolean);

    const byPlayer = {};
    for (const p of roster) {
      const mine = rows.filter(x => x.r.player_id === p.id);
      const metrics = present
        .map(d => headline(d, mine.filter(x => x.s.drill_type === d).map(x => x.r)))
        .filter(Boolean);
      if (metrics.length > 0) byPlayer[p.id] = metrics;
    }

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

    // Chronological, oldest first — a progression reads left to right.
    const chrono = (a, b) => a._d.localeCompare(b._d) || a._c.localeCompare(b._c);
    for (const k of Object.keys(series)) series[k].sort(chrono);
    for (const k of Object.keys(scrimSeries)) scrimSeries[k].sort(chrono);

    return { teamMetrics: team, perPlayer: byPlayer, drills: present, series, totals, counts, scrimSeries };
  }, [roster, practiceStats, sessionById]);

  const activeSort = drills.includes(sortDrill) ? sortDrill : drills[0];

  // Players holding the sorted metric come first, best to worst; everyone else
  // keeps roster order underneath rather than being dropped.
  const ordered = useMemo(() => {
    const valueOf = p => perPlayer[p.id]?.find(m => m.drill === activeSort)?.value;
    const withVal = roster.filter(p => valueOf(p) != null)
      .sort((a, b) => valueOf(b) - valueOf(a));
    const without = roster.filter(p => valueOf(p) == null);
    return [...withVal, ...without];
  }, [roster, perPlayer, activeSort]);

  if (teamMetrics.length === 0) {
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
      <div className="pp-team-cards">
        {teamMetrics.map(m => (
          // Labelled by DRILL, not by metric: a scrimmage and the hitting
          // drill both headline on hitting %, and two cards reading
          // "Hitting %" would be indistinguishable.
          <div key={m.drill} className="pp-team-card">
            <span className="pp-team-card-lbl">{drillOf(m.drill).short}</span>
            {m.drill === 'serving' ? (
              // Serving is the one drill with two figures worth showing side by
              // side: how often the serve landed, and how often it was an ace.
              <span className="pp-team-card-pair">
                <span className="pp-team-card-fig">
                  <span className="pp-team-card-val" style={{ color: perfShade(m.drill, m.value) }}>
                    {m.display}
                  </span>
                  <span className="pp-team-card-unit">in</span>
                </span>
                <span className="pp-team-card-fig">
                  <span className="pp-team-card-val pp-team-card-val-2">{pctFmt(acePct(m.row))}</span>
                  <span className="pp-team-card-unit">ace</span>
                </span>
              </span>
            ) : (
              <span className="pp-team-card-val" style={{ color: perfShade(m.drill, m.value) }}>
                {m.display}
              </span>
            )}
            <span className="pp-team-card-sub">{m.reps} {m.repsLabel}</span>
          </div>
        ))}
      </div>

      {/* Team trends are the default; the ranked player list is one tap away
          and is the route into an individual player's development view —
          without it there would be no way to open a player at all, now that
          the chip row is gone. */}
      <div className="pp-seg pp-seg-inline pp-view-seg">
        <button
          type="button"
          className={`pp-seg-btn${view === 'team' ? ' on' : ''}`}
          onClick={() => setView('team')}
        >
          Team trends
        </button>
        <button
          type="button"
          className={`pp-seg-btn${view === 'players' ? ' on' : ''}`}
          onClick={() => setView('players')}
        >
          Players
        </button>
      </div>

      {view === 'team' ? (
        <TeamGraphs series={series} totals={totals} counts={counts} scrimSeries={scrimSeries} />
      ) : (
        <>
      {drills.length > 1 && (
        <div className="pp-seg pp-seg-inline">
          {drills.map(d => (
            <button
              key={d}
              type="button"
              className={`pp-seg-btn${d === activeSort ? ' on' : ''}`}
              onClick={() => setSortDrill(d)}
            >
              {drillOf(d).short}
            </button>
          ))}
        </div>
      )}

      <div className="pp-team-list">
        {ordered.map(p => {
          const metrics = perPlayer[p.id] || [];
          // Only the sorted metric is shown; `others` is how many more drills
          // this player has data in.
          const lead = metrics.find(m => m.drill === activeSort) || null;
          const others = metrics.filter(m => m.drill !== activeSort).length;
          return (
            <button
              key={p.id}
              type="button"
              className="pp-team-row"
              onClick={() => onPick(p.id)}
            >
              <span className="pp-team-row-num">
                {p.jersey_number != null && p.jersey_number !== '' ? p.jersey_number : '—'}
              </span>
              <span className="pp-team-row-name">{p.name}</span>
              {/* ONE number per row: the metric the list is sorted by. The
                  row used to carry every metric the player had, in shrinking
                  type — four numbers to compare down a column when only one of
                  them is the one being ranked. The rest are a tap away in the
                  player's own view. */}
              <span className="pp-team-row-vals">
                {lead ? (
                  <span
                    className="pp-team-val is-lead"
                    style={{ color: perfShade(lead.drill, lead.value) }}
                  >
                    {lead.display}
                    {lead.drill === 'serving' && <small>in</small>}
                  </span>
                ) : (
                  <span className="pp-team-row-none">—</span>
                )}
                {/* Ace % sits beside the in %, deliberately UNCOLOURED: it is a
                    more-is-better stat with no agreed good/bad thresholds, and
                    inventing bands just to tint it would imply a judgement the
                    numbers do not support. Weight and label carry it instead. */}
                {lead && lead.drill === 'serving' && (
                  <span className="pp-team-val pp-team-val-ace">
                    {pctFmt(acePct(lead.row))}
                    <small>ace</small>
                  </span>
                )}
                {/* A quiet count of the other drills they have data in, so the
                    row still says "there is more here" without spelling it out. */}
                {others > 0 && <span className="pp-team-row-more">+{others}</span>}
              </span>
            </button>
          );
        })}
      </div>
        </>
      )}
    </div>
  );
}

export default function PracticeTrends({
  team, players, sessions, practiceStats, playerGameStats,
  playerId, onSelectPlayer,
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
        <TeamStats
          roster={roster}
          practiceStats={practiceStats}
          sessionById={sessionById}
          onPick={onSelectPlayer}
        />
      ) : (
        <>
          {/* Deliberately understated: the selector chip above is already lit
              for this player, so a hero block with an avatar would say the same
              thing twice and push the chart below the fold. */}
          <div className="pp-sel-player">
            {player.name}
            {player.jersey_number != null && player.jersey_number !== '' && (
              <span className="pp-sel-player-num"> (#{player.jersey_number})</span>
            )}
          </div>

          {myPractice.length === 0 ? (
            <div className="pp-zero pp-zero-sm">
              <div className="pp-zero-title">No practice reps yet</div>
              <p className="pp-zero-text">
                {player.name} has not been tracked in a drill yet. Start one from
                &ldquo;Start a drill&rdquo; and the trend appears here.
              </p>
            </div>
          ) : (
            <section className="pp-block">
              <div className="pp-block-head">
                <h3>Practice trend</h3>
                <span className="pp-block-sub">
                  {drillRows.length} {drillOf(activeDrill).short.toLowerCase()} session{drillRows.length !== 1 ? 's' : ''} over time
                </span>
              </div>

              {drillsWithData.length > 1 && (
                <div className="pp-seg">
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

              <div className="pp-trend-total">
                <span
                  className="pp-trend-total-val"
                  style={{ color: perfShade(activeDrill, drillTotalHead.value) }}
                >
                  {drillTotalHead.display}
                </span>
                <span className="pp-trend-total-lbl">
                  {drillTotalHead.label} across all {drillOf(activeDrill).short.toLowerCase()} sessions
                  {' '}({drillTotalHead.reps} {drillTotalHead.repsLabel})
                </span>
              </div>

              <TrendChart points={points} domain={drillTotalHead.domain} drillType={activeDrill} />
              <PerfLegend drillType={activeDrill} />

              <div className="pp-trend-list">
                {drillRows.slice().reverse().map(({ row, session }) => {
                  const head = drillHeadline(activeDrill, row);
                  return (
                    <div key={session.id} className="pp-trend-item">
                      <span className="pp-trend-item-date">{fmtDate(session.session_date)}</span>
                      <span className="pp-trend-item-name">{session.name || sessionDrillLabel(session)}</span>
                      <span className="pp-trend-item-break">
                        {drillBreakdown(activeDrill, row).map(([abbr, v]) => (
                          <span key={abbr} className="pp-pair"><b>{v}</b><span>{abbr}</span></span>
                        ))}
                      </span>
                      <span
                        className="pp-trend-item-val"
                        style={{ color: perfShade(activeDrill, head.value) }}
                      >
                        {head.display}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Rendered whenever a player is selected, NOT only when they have
              practice reps: a player with match history and no drills yet
              should still see the game side, with the practice side saying so
              explicitly rather than the whole block vanishing. */}
          <section className="pp-block">
            <div className="pp-block-head">
              <h3>Drills vs Scrimmage vs Game</h3>
              <span className="pp-block-sub">
                Every value from the same shared helpers — game data is read-only
              </span>
            </div>

            <CompareGrid
              byContext={{
                drills: practiceDrills,
                scrimmage,
                game: gameTotals,
              }}
            />

            <p className="pp-cmp-foot">
              Practice reps are stored in their own tables and are never counted
              towards a player&rsquo;s match statistics. A serve-in&nbsp;% needs
              the total serves taken, which only the serving drill records —
              scrimmages and matches log aces and serve errors but not every
              serve, so that row reads &ldquo;not tracked&rdquo; there.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
