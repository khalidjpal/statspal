// Product mockups for the landing page. Lightweight components rather than
// screenshots: the stat buttons come from the real StatsPal button set and
// every figure is computed with the app's own formulas, so the mockups stay
// truthful as the app changes. All names and numbers are fictional.
import { CATEGORIES } from '../../utils/statActions';
import { hfmt, passAvg, pfmt } from '../../utils/stats';

function DeviceFrame({ label, variant = 'tablet', children }) {
  return (
    <figure className={`lp-device lp-device--${variant}`} role="img" aria-label={label}>
      <div className="lp-device__screen" aria-hidden="true">{children}</div>
    </figure>
  );
}

// ── StatsPal: live game ────────────────────────────────────────────────

const ROSTER = [
  { num: 12, name: 'Maya Okafor', k: 9, e: 2, att: 24, pass: { pass_3: 6, pass_2: 5, pass_1: 1, pass_0: 0 } },
  { num: 4, name: 'Jess Tran', k: 1, e: 0, att: 3, pass: { pass_3: 1, pass_2: 1, pass_1: 0, pass_0: 0 } },
  { num: 9, name: 'Riley Brooks', k: 5, e: 1, att: 11, pass: {} },
  { num: 7, name: 'Ana Lima', k: 0, e: 0, att: 0, pass: { pass_3: 9, pass_2: 4, pass_1: 2, pass_0: 1 } },
  { num: 15, name: 'Sofia Reyes', k: 6, e: 3, att: 17, pass: {} },
  { num: 2, name: 'Kenzie Park', k: 4, e: 1, att: 14, pass: { pass_3: 3, pass_2: 4, pass_1: 2, pass_0: 1 } },
];

// Badge counts on the selected player's buttons, keyed by action.
const COUNTS = {
  kill: 9, attack_error: 2, attempt: 13, ace: 2, serve_in: 9, serve_error: 1,
  dig: 7, pass_1: 1, pass_2: 5, pass_3: 6, assist: 1,
};

function miniLine(p) {
  const parts = [`${p.k}K`, `${p.e}E`, `${p.att}TA`];
  const pa = passAvg(p.pass);
  if (pa != null) parts.push(`${pfmt(pa)}P`);
  if (p.att) parts.push(hfmt(p.k, p.e, p.att));
  return parts.join(' · ');
}

function ActionButton({ a, err }) {
  const tone = a.tone || (err ? 'err' : 'ok');
  const count = COUNTS[a.key];
  return (
    <span className={`mk-btn mk-btn--${tone}`}>
      <b>{a.abbr}</b>
      <small>{a.label}</small>
      {count ? <i className="mk-btn__count">{count}</i> : null}
    </span>
  );
}

export function StatsMockup() {
  const me = ROSTER[0];
  return (
    <DeviceFrame label="StatsPal live game screen: a scoreboard, the roster with each player's running stat line, and the stat buttons for the selected player.">
      <div className="mk-live">
        <div className="mk-live__bar">
          <span className="mk-icon">✕</span>
          <span className="mk-icon">↩</span>
          <span className="mk-live__set">SET 2</span>
          <span className="mk-seg"><span className="is-on">Live</span><span>Stats</span></span>
          <span className="mk-live__end">End Set</span>
        </div>

        <div className="mk-score">
          <span className="mk-score__team">Herons</span>
          <span className="mk-score__pts">18</span>
          <span className="mk-score__sets">1–0<small>S1: 25–21</small></span>
          <span className="mk-score__pts">15</span>
          <span className="mk-score__team">Cedar Ridge</span>
        </div>
        <div className="mk-last">Maya → Kill</div>

        <div className="mk-live__body">
          <ul className="mk-roster">
            {ROSTER.map((p, i) => (
              <li key={p.num} className={i === 0 ? 'is-sel' : ''}>
                <span className="mk-roster__num">#{p.num}</span>
                <span className="mk-roster__name">{p.name.split(' ')[0]}</span>
                <span className="mk-roster__line">{miniLine(p)}</span>
              </li>
            ))}
          </ul>

          <div className="mk-pad">
            <div className="mk-pad__who">
              <b>#{me.num} {me.name}</b>
              <span>{me.k} K · {me.e} E · {me.att} TA · {hfmt(me.k, me.e, me.att)} · {pfmt(passAvg(me.pass))} Pass</span>
            </div>
            {CATEGORIES.map(cat => (
              <div key={cat.label} className="mk-cat">
                <span className="mk-cat__label">{cat.label}</span>
                <div className="mk-cat__row">
                  {cat.actions.map(a =>
                    a.group ? (
                      <span key={a.key} className="mk-receive">
                        <span className="mk-receive__label">{a.group}</span>
                        {a.actions.map(r => <ActionButton key={r.key} a={r} err={r.err} />)}
                      </span>
                    ) : (
                      <ActionButton key={a.key} a={a} err={a.err} />
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DeviceFrame>
  );
}

// ── RotationPal: gameplan builder ──────────────────────────────────────

// Rotation 1, serve receive. `pair` picks the bubble colour the builder uses
// for opposite positions; the libero is gold.
const COURT = [
  { slot: 'P4', num: 2, name: 'Kenzie', pair: 'a' },
  { slot: 'P3', num: 9, name: 'Riley', pair: 'b' },
  { slot: 'P2', num: 15, name: 'Sofia', pair: 'c' },
  { slot: 'P5', num: 12, name: 'Maya', pair: 'a' },
  { slot: 'P6', num: 7, name: 'Ana', pair: 'lib', libero: true },
  { slot: 'P1', num: 4, name: 'Jess', pair: 'c' },
];

export function RotationMockup() {
  return (
    <DeviceFrame label="RotationPal gameplan builder: six players placed on a volleyball court for rotation 1 in serve receive, with the libero marked and two players waiting on the bench.">
      <div className="mk-rot">
        <div className="mk-rot__head">
          <span className="mk-rot__plan">Plan A <small>vs Cedar Ridge</small></span>
          <span className="mk-seg"><span>Serve</span><span className="is-on">Serve Receive</span></span>
        </div>
        <div className="mk-rot__rotations">
          {[1, 2, 3, 4, 5, 6].map(r => (
            <span key={r} className={r === 1 ? 'is-on' : ''}>R{r}</span>
          ))}
        </div>

        <div className="mk-court">
          <div className="mk-court__net">FRONT ROW · NET</div>
          <div className="mk-court__grid">
            {COURT.slice(0, 3).map(p => <Bubble key={p.slot} p={p} />)}
            <div className="mk-court__attack" />
            {COURT.slice(3).map(p => <Bubble key={p.slot} p={p} />)}
          </div>
          <div className="mk-court__back">BACK ROW</div>
        </div>

        <div className="mk-bench">
          <span className="mk-bench__label">ROSTER</span>
          <span className="mk-chip">#10 Tess</span>
          <span className="mk-chip">#21 Nora</span>
        </div>
      </div>
    </DeviceFrame>
  );
}

function Bubble({ p }) {
  return (
    <span className={`mk-bubble mk-bubble--${p.pair}`}>
      <small>{p.slot}</small>
      <b>#{p.num}</b>
      <span>{p.name}</span>
      {p.libero && <i className="mk-bubble__lib">L</i>}
    </span>
  );
}

// ── PracticePal: player development card ──────────────────────────────

const PRACTICE = {
  pass: { pass_3: 20, pass_2: 15, pass_1: 5, pass_0: 2 },
  k: 16, e: 4, att: 45,
  served: 22, servedIn: 19, aces: 2,
};

// Passing average per session, oldest first, for the trend line.
const TREND = [1.8, 1.95, 1.9, 2.1, 2.05, 2.2, 2.25, 2.3];

function trendPath(points, w, h, min = 1.5, max = 2.5) {
  const step = w / (points.length - 1);
  return points
    .map((v, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)} ${(h - ((v - min) / (max - min)) * h).toFixed(1)}`)
    .join(' ');
}

export function PracticeMockup() {
  const pa = passAvg(PRACTICE.pass);
  const graded = Object.values(PRACTICE.pass).reduce((s, n) => s + n, 0);
  const inPct = Math.round((PRACTICE.servedIn / PRACTICE.served) * 100);
  const acePct = Math.round((PRACTICE.aces / PRACTICE.served) * 100);
  return (
    <DeviceFrame label="PracticePal player development card: passing, hitting and serving numbers for one player, a comparison of drills, scrimmage and games, and a rising passing trend line.">
      <div className="mk-dev">
        <div className="mk-dev__head">
          <span className="mk-dev__jersey">#12</span>
          <span>
            <b>Maya Okafor</b>
            <small>Outside Hitter · 8 sessions</small>
          </span>
        </div>

        <div className="mk-dev__hero">
          <div>
            <small>PASSING</small>
            <b>{pfmt(pa)}</b>
            <span>across {graded} receives</span>
          </div>
          <div>
            <small>HITTING</small>
            <b>{hfmt(PRACTICE.k, PRACTICE.e, PRACTICE.att)}</b>
            <span>{PRACTICE.k}K · {PRACTICE.e}E · {PRACTICE.att} att</span>
          </div>
          <div>
            <small>SERVING</small>
            <b>{inPct}%</b>
            <span>{PRACTICE.servedIn} of {PRACTICE.served} in · {acePct}% ace</span>
          </div>
        </div>

        <div className="mk-dev__compare">
          <div><small>DRILLS</small><b>2.28</b></div>
          <div><small>SCRIMMAGE</small><b>2.14</b></div>
          <div><small>GAME</small><b>2.08</b></div>
        </div>

        <div className="mk-dev__chart">
          <small>PASSING · BY SESSION</small>
          <svg viewBox="0 0 300 80" preserveAspectRatio="none">
            <line x1="0" y1="40" x2="300" y2="40" className="mk-dev__grid" />
            <path d={trendPath(TREND, 300, 80)} className="mk-dev__line" />
          </svg>
        </div>
      </div>
    </DeviceFrame>
  );
}
