import { hpct, n2, n3, hcol } from '../utils/stats';

export default function StatsStrip({ stats, gamesPlayed }) {
  const sp = stats.sets_played || 0;
  const kps = sp > 0 ? stats.kills / sp : null;
  const aps = sp > 0 ? stats.aces / sp : null;
  const dps = sp > 0 ? stats.digs / sp : null;
  const asps = sp > 0 ? stats.assists / sp : null;
  const bps = sp > 0 ? stats.blocks / sp : null;
  const h = hpct(stats.kills, stats.errors, stats.attempts);

  const items = [
    { label: 'Record', value: gamesPlayed ?? '—' },
    { label: 'K/S', value: n2(kps) },
    { label: 'A/S', value: n2(aps) },
    { label: 'D/S', value: n2(dps) },
    { label: 'AST/S', value: n2(asps) },
    { label: 'B/S', value: n2(bps) },
    { label: 'Hit%', value: n3(h), color: hcol(stats.kills, stats.errors, stats.attempts) },
  ];

  return (
    <div className="stats-strip">
      {items.map((item, i) => (
        <div key={i} className="stats-strip-item">
          <div className="stats-strip-label">{item.label}</div>
          <div className="stats-strip-value" style={item.color ? { color: item.color } : undefined}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}
