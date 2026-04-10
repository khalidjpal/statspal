import { useData } from '../contexts/DataContext';
import { hpct, n3, hcol, hlbl } from '../utils/stats';
import PlayerBadge from '../components/PlayerBadge';

export default function PlayerGameDetail({ player, game, team, onBack, asModal = false }) {
  const { playerGameStats } = useData();
  const stats = playerGameStats.find(s => s.player_id === player.id && s.game_id === game.id) ||
    { kills: 0, aces: 0, digs: 0, assists: 0, blocks: 0, errors: 0, attempts: 0, sets_played: 0, block_assists: 0, serve_errors: 0 };

  const sp = stats.sets_played || 1;
  const k = stats.kills || 0;
  const e = stats.errors || 0;
  const ta = stats.attempts || 0;
  const h = hpct(k, e, ta);
  const kColor = hcol(k, e, ta);

  // Game totals — 11 stats laid out in a balanced grid
  const totals = [
    { label: 'SP',   value: stats.sets_played || 0 },
    { label: 'K',    value: k },
    { label: 'E',    value: e, color: e > 0 ? '#f85149' : undefined },
    { label: 'TA',   value: ta },
    { label: 'K%',   value: n3(h), color: kColor, mono: true },
    { label: 'A',    value: stats.assists || 0 },
    { label: 'SA',   value: stats.aces || 0 },
    { label: 'SE',   value: stats.serve_errors || 0, color: (stats.serve_errors || 0) > 0 ? '#f85149' : undefined },
    { label: 'Digs', value: stats.digs || 0 },
    { label: 'BS',   value: stats.blocks || 0 },
    { label: 'BA',   value: stats.block_assists || 0 },
  ];

  // Per-set — 7 stats; last cell centered on its own row
  const perSet = [
    { label: 'K/S',  value: (k / sp).toFixed(2) },
    { label: 'K%',   value: n3(h), color: kColor },
    { label: 'SA/S', value: ((stats.aces || 0) / sp).toFixed(2) },
    { label: 'D/S',  value: ((stats.digs || 0) / sp).toFixed(2) },
    { label: 'BS/S', value: ((stats.blocks || 0) / sp).toFixed(2) },
    { label: 'BA/S', value: ((stats.block_assists || 0) / sp).toFixed(2) },
    { label: 'E/S',  value: (e / sp).toFixed(2), color: e > 0 ? '#f85149' : undefined, last: true },
  ];

  const body = (
    <div className="pgd-body">
      <div className="pgd-head">
        <PlayerBadge player={player} team={team} size={44} />
        <div className="pgd-head-text">
          <div className="pgd-name">{player.name}</div>
          <div className="pgd-sub">
            vs {game.opponent} · {new Date(game.game_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
        </div>
        <span className={`game-result-badge ${game.result === 'W' ? 'win' : 'loss'}`}>{game.result}</span>
      </div>

      {/* Hitting efficiency — compact, tier badge inline */}
      <div className="pgd-card pgd-eff">
        <div className="pgd-section-label">Hitting Efficiency</div>
        <div className="pgd-eff-row">
          <div className="pgd-eff-num" style={{ color: kColor }}>{n3(h)}</div>
          <span className="pgd-eff-tier" style={{ background: `${kColor}22`, color: kColor, borderColor: `${kColor}55` }}>
            {hlbl(k, e, ta)}
          </span>
        </div>
        <div className="pgd-eff-formula">({k}K − {e}E) ÷ {ta} TA</div>
      </div>

      {/* Game totals — 11 stats in 6-col grid: 3 rows of 3 (each spanning 2) + last row of 2 (each spanning 3) */}
      <div className="pgd-card">
        <div className="pgd-section-label">Game Totals</div>
        <div className="pgd-grid pgd-grid-totals">
          {totals.map((it, i) => (
            <div
              key={i}
              className={`pgd-cell${i >= 9 ? ' pgd-cell-wide' : ''}`}
            >
              <div className="pgd-cell-label">{it.label}</div>
              <div className="pgd-cell-value" style={{ color: it.color || '#f0f6fc' }}>{it.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Per set — 7 stats in 3 columns with last cell centered */}
      <div className="pgd-card">
        <div className="pgd-section-label">Per Set ({stats.sets_played || 0} {(stats.sets_played || 0) === 1 ? 'set' : 'sets'})</div>
        <div className="pgd-grid pgd-grid-perset">
          {perSet.map((it, i) => (
            <div key={i} className={`pgd-cell${it.last ? ' pgd-cell-full' : ''}`}>
              <div className="pgd-cell-label">{it.label}</div>
              <div className="pgd-cell-value" style={{ color: it.color || '#f0f6fc' }}>{it.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (asModal) return body;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{
        background: `linear-gradient(135deg, ${team.color || '#0d1f5c'}, ${team.color || '#1a3a8f'})`,
        color: '#fff', padding: '16px 20px',
      }}>
        <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
          Back
        </button>
      </div>
      <div style={{ padding: '16px 20px', maxWidth: 600, margin: '0 auto' }}>
        {body}
      </div>
    </div>
  );
}
