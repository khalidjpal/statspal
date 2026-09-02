import { useState, useRef, useEffect } from 'react';
import { CATEGORIES } from '../utils/statActions';

// The live stat-entry button grid, shared by StatsPal's LiveGame and
// PracticePal's scrimmage tracker.
//
// Lifted out of LiveGame when the scrimmage arrived: an intrasquad practice
// match is tracked with exactly the same buttons, and two copies of this
// markup would have diverged the first time one was touched. The `lv-` class
// names come with it, so both trackers stay pixel-identical by construction
// rather than by discipline.

// One action button. Flashes briefly when pressed so a courtside tap is
// confirmed without the coach having to look up at the tally.
export function ActBtn({ a, err, fid, fk, onClick, count = 0 }) {
  const [fl, setFl] = useState(false);
  const pk = useRef(fk);
  const tm = useRef(null);

  // The un-flash timer is held in a ref and deliberately NOT cleaned up on dep
  // changes: pressing another button within 150ms used to cancel this one's
  // reset and leave it lit.
  useEffect(() => {
    if (fk !== pk.current && fid === a.key) {
      setFl(true);
      if (tm.current) clearTimeout(tm.current);
      tm.current = setTimeout(() => setFl(false), 150);
    }
    pk.current = fk;
  }, [fk, fid, a.key]);
  useEffect(() => () => { if (tm.current) clearTimeout(tm.current); }, []);

  const tone = a.tone || (err ? 'err' : 'ok');
  // A graded receive, specifically — not merely "has a tone". Attempt and
  // Serve In carry tone:'neutral' precisely so they are NOT coloured as
  // outcomes, and they must not inherit the graded flash and badge with it.
  const isRate = /^r\d$/.test(tone);
  const flClass = fl
    ? (isRate ? (tone === 'r0' ? 'lv-ab-fl-amber' : 'lv-ab-fl-pass') : (err ? 'lv-ab-fl-err' : 'lv-ab-fl-ok'))
    : '';
  const badgeClass = isRate ? (tone === 'r0' ? 'lv-ab-badge-amber' : 'lv-ab-badge-pass') : (err ? 'lv-ab-badge-err' : '');

  return (
    <button className={`lv-ab lv-ab-${tone} ${isRate ? 'lv-ab-rate' : ''} ${flClass}`} onClick={onClick}>
      {count > 0 && <span className={`lv-ab-badge ${badgeClass}`}>{count}</span>}
      <span className="lv-ab-a">{a.abbr}</span>
      <span className="lv-ab-l">{a.label}</span>
    </button>
  );
}

// The full category grid for one selected player.
//
// `stats` is that player's flat counter object; each button's badge reads the
// counter it owns (`also` when it has one, so a graded receive shows its own
// grade count rather than the shared receives total).
export default function StatActionGrid({ stats, flashId, flashKey, onAction }) {
  return (
    <div className="lv-btns">
      {CATEGORIES.map(cat => (
        <div key={cat.label} className="lv-btns-cat">
          <div className="lv-btns-cat-label">{cat.label}</div>
          <div className="lv-btns-row">
            {cat.actions.map(a => (a.group ? (
              <div key={a.key} className="lv-recgrp">
                <div className="lv-recgrp-lbl">{a.group}</div>
                <div className="lv-recgrp-btns">
                  {a.actions.map(g => (
                    <ActBtn
                      key={g.key}
                      a={g}
                      err={g.err}
                      fid={flashId}
                      fk={flashKey}
                      onClick={() => onAction(g)}
                      count={stats[g.also || g.stat] || 0}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <ActBtn
                key={a.key}
                a={a}
                err={a.err}
                fid={flashId}
                fk={flashKey}
                onClick={() => onAction(a)}
                count={stats[a.also || a.stat] || 0}
              />
            )))}
          </div>
        </div>
      ))}
    </div>
  );
}
