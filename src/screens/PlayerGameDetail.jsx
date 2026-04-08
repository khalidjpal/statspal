import { useData } from '../contexts/DataContext';
import { hpct, n2, n3, hcol, hlbl } from '../utils/stats';
import { pColors, mkInit } from '../utils/colors';

export default function PlayerGameDetail({ player, game, team, onBack }) {
  const { playerGameStats } = useData();
  const colors = player.colors || pColors(player.player_index ?? 0);
  const stats = playerGameStats.find(s => s.player_id === player.id && s.game_id === game.id) ||
    { kills: 0, aces: 0, digs: 0, assists: 0, blocks: 0, errors: 0, attempts: 0, sets_played: 0 };

  const sp = stats.sets_played || 1;
  const h = hpct(stats.kills, stats.errors, stats.attempts);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0f1e' }}>
      <div style={{
        background: `linear-gradient(135deg, ${team.color || '#0d1f5c'}, ${team.color || '#1a3a8f'})`,
        color: '#fff', padding: '16px 20px',
      }}>
        <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
          Back
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <span className="player-badge" style={{ background: colors.bg, color: colors.text, width: 48, height: 48, fontSize: 16 }}>
            {player.initials || mkInit(player.name)}
          </span>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700 }}>{player.name}</h1>
            <div style={{ fontSize: 13, opacity: 0.7 }}>
              vs {game.opponent} · {new Date(game.game_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          </div>
          <span className={`game-result-badge ${game.result === 'W' ? 'win' : 'loss'}`} style={{ marginLeft: 'auto' }}>
            {game.result}
          </span>
        </div>
      </div>

      <div style={{ padding: '16px 20px', maxWidth: 600, margin: '0 auto' }}>
        {/* Hitting efficiency */}
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#8892a4', marginBottom: 8 }}>Hitting Efficiency</div>
          <div style={{ fontSize: 40, fontWeight: 700, color: hcol(stats.kills, stats.errors, stats.attempts) }}>
            {n3(h)}
          </div>
          <div style={{ fontSize: 13, color: hcol(stats.kills, stats.errors, stats.attempts), fontWeight: 600 }}>
            {hlbl(stats.kills, stats.errors, stats.attempts)}
          </div>
          <div style={{ fontSize: 12, color: '#8892a4', marginTop: 8 }}>
            {stats.kills}K - {stats.errors}E / {stats.attempts} Att
          </div>
        </div>

        {/* Per-set averages */}
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 600, color: '#8892a4', marginBottom: 12 }}>Per Set ({stats.sets_played} sets)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, textAlign: 'center' }}>
            {[
              { label: 'K/S', value: n2(stats.kills / sp) },
              { label: 'A/S', value: n2(stats.aces / sp) },
              { label: 'D/S', value: n2(stats.digs / sp) },
              { label: 'AST/S', value: n2(stats.assists / sp) },
              { label: 'B/S', value: n2(stats.blocks / sp) },
              { label: 'E/S', value: n2(stats.errors / sp) },
            ].map((item, i) => (
              <div key={i}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#8892a4', textTransform: 'uppercase' }}>{item.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#f0f4ff' }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Raw totals */}
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 600, color: '#8892a4', marginBottom: 12 }}>Game Totals</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, textAlign: 'center' }}>
            {[
              { label: 'Kills', value: stats.kills },
              { label: 'Aces', value: stats.aces },
              { label: 'Digs', value: stats.digs },
              { label: 'Assists', value: stats.assists },
              { label: 'Blocks', value: stats.blocks },
              { label: 'Errors', value: stats.errors, color: '#ef4444' },
            ].map((item, i) => (
              <div key={i}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#8892a4', textTransform: 'uppercase' }}>{item.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: item.color || '#f0f4ff' }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
