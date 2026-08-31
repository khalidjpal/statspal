import { useMemo, useState, useId } from 'react';
// Number formatting comes from each drill's band definition (perfBands().fmt),
// which is the same pfmt/n3/pctFmt the rest of the app uses.
import { hpct, passAvg, playerTotals } from '../utils/stats';
import {
  DRILL_ORDER, drillOf, drillHeadline, drillBreakdown,
  sumPracticeRows, sessionDrillLabel,
  perfShade, perfBands, perfRampStops, perfRampTicks,
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
function CompareRow({ title, note, drillType, practice, game, practiceReps, gameReps, repsLabel }) {
  const fmt = perfBands(drillType).fmt;
  const delta = (practice != null && game != null) ? practice - game : null;

  // Say WHICH side is missing rather than a generic blank — "no game data yet"
  // tells the coach the comparison is waiting on a match, not that it's broken.
  const missing = practice == null && game == null
    ? 'no data yet'
    : practice == null
      ? 'no practice data yet'
      : game == null
        ? 'no game data yet'
        : null;

  return (
    <div className="pp-cmp-row">
      <div className="pp-cmp-title">
        <span className="pp-cmp-title-main">{title}</span>
        <span className="pp-cmp-title-note">{note}</span>
      </div>
      <div className="pp-cmp-pair">
        <div className="pp-cmp-side pp-cmp-practice">
          <span className="pp-cmp-tag">Practice</span>
          <span className="pp-cmp-val" style={{ color: perfShade(drillType, practice) }}>
            {practice != null ? fmt(practice) : '—'}
          </span>
          <span className="pp-cmp-reps">{practiceReps} {repsLabel}</span>
        </div>
        <div className="pp-cmp-mid">
          {delta != null ? (
            <>
              <span
                className="pp-cmp-delta"
                style={{ color: delta > 0 ? 'var(--win)' : delta < 0 ? 'var(--loss)' : 'var(--text-muted)' }}
              >
                {delta > 0 ? '+' : ''}{fmt(delta).replace('+', '')}
              </span>
              <span className="pp-cmp-delta-lbl">
                {delta > 0 ? 'better in practice' : delta < 0 ? 'better in games' : 'level'}
              </span>
            </>
          ) : (
            <span className="pp-cmp-delta-lbl">{missing}</span>
          )}
        </div>
        <div className="pp-cmp-side pp-cmp-game">
          <span className="pp-cmp-tag">Game</span>
          <span className="pp-cmp-val" style={{ color: perfShade(drillType, game) }}>
            {game != null ? fmt(game) : '—'}
          </span>
          <span className="pp-cmp-reps">{gameReps} {repsLabel}</span>
        </div>
      </div>
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
const METRIC_ABBR = { serve_receive: 'Pass', hitting: 'Hit', serving: 'Srv', custom: 'Custom' };

function TeamStats({ roster, practiceStats, sessionById, onPick }) {
  const [sortDrill, setSortDrill] = useState(null);

  const { teamMetrics, perPlayer, drills } = useMemo(() => {
    // Only rows whose session still resolves, grouped by drill and by player.
    const rows = (practiceStats || [])
      .map(r => ({ r, s: sessionById[r.practice_session_id] }))
      .filter(x => x.s);

    const present = DRILL_ORDER.filter(d => rows.some(x => x.s.drill_type === d));

    const headline = (drill, subset) => {
      if (subset.length === 0) return null;
      const h = drillHeadline(drill, sumPracticeRows(subset));
      return h.value == null ? null : { drill, ...h };
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

    return { teamMetrics: team, perPlayer: byPlayer, drills: present };
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
          <div key={m.drill} className="pp-team-card">
            <span className="pp-team-card-lbl">{m.label}</span>
            <span className="pp-team-card-val" style={{ color: perfShade(m.drill, m.value) }}>
              {m.display}
            </span>
            <span className="pp-team-card-sub">{m.reps} {m.repsLabel}</span>
          </div>
        ))}
      </div>

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
          // The sorted metric leads the row; the rest follow in drill order.
          const sorted = [
            ...metrics.filter(m => m.drill === activeSort),
            ...metrics.filter(m => m.drill !== activeSort),
          ];
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
              <span className="pp-team-row-vals">
                {sorted.length === 0 ? (
                  <span className="pp-team-row-none">no reps</span>
                ) : sorted.map((m, i) => (
                  <span
                    key={m.drill}
                    className={`pp-team-val${i === 0 ? ' is-lead' : ''}`}
                    style={{ color: perfShade(m.drill, m.value) }}
                  >
                    {m.display}
                    <small>{METRIC_ABBR[m.drill]}</small>
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
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
  const practicePassing = useMemo(
    () => sumPracticeRows(myPractice.filter(x => x.session.drill_type === 'serve_receive').map(x => x.row)),
    [myPractice]
  );
  const practiceHitting = useMemo(
    () => sumPracticeRows(myPractice.filter(x => x.session.drill_type === 'hitting').map(x => x.row)),
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
      <div className="pp-picker">
        {roster.map(p => (
          <button
            key={p.id}
            type="button"
            className={`pp-chip${p.id === playerId ? ' pp-chip-on' : ''}`}
            onClick={() => onSelectPlayer(p.id === playerId ? null : p.id)}
          >
            {p.jersey_number != null && p.jersey_number !== '' && (
              <span className="pp-chip-num">{p.jersey_number}</span>
            )}
            {p.name}
          </button>
        ))}
      </div>

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
              <h3>Practice vs Game</h3>
              <span className="pp-block-sub">
                Practice from PracticePal, game from StatsPal — game data is read-only
              </span>
            </div>

            <CompareRow
              title="Passing average"
              note="0–3 scale, identical in both"
              drillType="serve_receive"
              practice={passAvg(practicePassing)}
              game={passAvg(gameTotals)}
              practiceReps={practicePassing.receives || 0}
              gameReps={gameTotals.receives || 0}
              repsLabel="receives"
            />

            <CompareRow
              title="Hitting %"
              note="(kills − errors) ÷ attempts"
              drillType="hitting"
              practice={hpct(practiceHitting.kills, practiceHitting.errors, practiceHitting.attempts)}
              game={hpct(gameTotals.kills, gameTotals.errors, gameTotals.attempts)}
              practiceReps={practiceHitting.attempts || 0}
              gameReps={gameTotals.attempts || 0}
              repsLabel="attempts"
            />

            <p className="pp-cmp-foot">
              Practice reps are stored in their own tables and are never counted
              towards a player&rsquo;s match statistics.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
