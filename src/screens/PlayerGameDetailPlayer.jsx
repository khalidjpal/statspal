import { useData } from '../contexts/DataContext';
import { hpct, n3, hcol, hlbl } from '../utils/stats';
import PlayerBadge from '../components/PlayerBadge';

export default function PlayerGameDetailPlayer({ player, game, onBack }) {
  const { playerGameStats, teams } = useData();
  const team = teams.find(t => t.id === player.team_id);
  const stats = playerGameStats.find(s => s.player_id === player.id && s.game_id === game.id) ||
    { kills: 0, aces: 0, digs: 0, assists: 0, blocks: 0, errors: 0, attempts: 0, sets_played: 0, block_assists: 0, serve_errors: 0 };

  const sp = stats.sets_played || 1;
  const h = hpct(stats.kills, stats.errors, stats.attempts);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{
        background: `linear-gradient(135deg, ${team?.color || '#0d1f5c'}, ${team?.color || '#1a3a8f'})`,
        color: '#fff', padding: '16px 20px',
      }}>
        <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
          Back
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <PlayerBadge player={player} team={team} size={48} />
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700 }}>{player.name}</h1>
            <div style={{ fontSize: 13, opacity: 0.7 }}>
              vs {game.opponent} · {new Date(game.game_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '16px 20px', maxWidth: 600, margin: '0 auto' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>K% — Hitting Efficiency</div>
          <div style={{ fontSize: 40, fontWeight: 700, color: hcol(stats.kills, stats.errors, stats.attempts) }}>
            {n3(h)}
          </div>
          <div style={{ fontSize: 13, color: hcol(stats.kills, stats.errors, stats.attempts), fontWeight: 600 }}>
            {hlbl(stats.kills, stats.errors, stats.attempts)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
            {stats.kills}K - {stats.errors}E / {stats.attempts} TA
          </div>
        </div>

        {/* Game totals — Presto format */}
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12 }}>Game Totals ({stats.sets_played} SP)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, textAlign: 'center' }}>
            {[
              { label: 'K',    value: stats.kills },
              { label: 'E',    value: stats.errors, color: stats.errors > 0 ? '#ef4444' : undefined },
              { label: 'TA',   value: stats.attempts },
              { label: 'A',    value: stats.assists },
              { label: 'SA',   value: stats.aces },
              { label: 'SE',   value: stats.serve_errors || 0, color: (stats.serve_errors || 0) > 0 ? '#ef4444' : undefined },
              { label: 'Digs', value: stats.digs },
              { label: 'BS',   value: stats.blocks },
              { label: 'BA',   value: stats.block_assists || 0 },
            ].map((item, i) => (
              <div key={i}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{item.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: item.color || 'var(--text)' }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
