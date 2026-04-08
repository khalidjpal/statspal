import { useEffect } from 'react';
import { useData } from '../contexts/DataContext';
import { hpct, n2, n3, hcol, hlbl, playerTotals } from '../utils/stats';
import { pColors, mkInit } from '../utils/colors';
import { sortedCompleted } from '../utils/sort';

export default function PlayerDetail({ player, team, onBack, onSelectGame }) {
  const { completedGames, playerGameStats, refresh } = useData();

  useEffect(() => { refresh(); }, [refresh]);

  const colors = player.colors || pColors(player.player_index ?? 0);
  const myStats = playerGameStats.filter(s => s.player_id === player.id);
  const totals = playerTotals(myStats);
  const sp = totals.sets_played;
  const h = hpct(totals.kills, totals.errors, totals.attempts);

  // Games this player appeared in
  const gameIds = new Set(myStats.map(s => s.game_id));
  const myGames = sortedCompleted(completedGames.filter(g => gameIds.has(g.id)));

  return (
    <div style={{ minHeight: '100vh', background: '#0a0f1e' }}>
      <div style={{
        background: `linear-gradient(135deg, ${team.color || '#0d1f5c'}, ${team.color || '#1a3a8f'})`,
        color: '#fff', padding: '16px 20px',
      }}>
        <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
          Back
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
          <span className="player-badge" style={{ background: colors.bg, color: colors.text, width: 56, height: 56, fontSize: 20 }}>
            {player.initials || mkInit(player.name)}
          </span>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700 }}>{player.name}</h1>
            <div style={{ fontSize: 13, opacity: 0.7 }}>
              {[player.jersey_number ? `#${player.jersey_number}` : null, player.position, player.height, player.grade].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '16px 20px', maxWidth: 600, margin: '0 auto' }}>
        {/* Season averages */}
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 600, color: '#8892a4', marginBottom: 12 }}>Season Averages (per set)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, textAlign: 'center' }}>
            {[
              { label: 'K/S', value: n2(sp > 0 ? totals.kills / sp : null) },
              { label: 'A/S', value: n2(sp > 0 ? totals.aces / sp : null) },
              { label: 'D/S', value: n2(sp > 0 ? totals.digs / sp : null) },
              { label: 'AST/S', value: n2(sp > 0 ? totals.assists / sp : null) },
              { label: 'B/S', value: n2(sp > 0 ? totals.blocks / sp : null) },
              { label: 'Sets', value: sp },
            ].map((item, i) => (
              <div key={i}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#8892a4', textTransform: 'uppercase' }}>{item.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#f0f4ff' }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Hitting efficiency */}
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#8892a4', marginBottom: 8 }}>Hitting Efficiency</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: hcol(totals.kills, totals.errors, totals.attempts) }}>
            {n3(h)}
          </div>
          <div style={{ fontSize: 13, color: hcol(totals.kills, totals.errors, totals.attempts), fontWeight: 600 }}>
            {hlbl(totals.kills, totals.errors, totals.attempts)}
          </div>
          <div style={{ fontSize: 12, color: '#8892a4', marginTop: 8 }}>
            {totals.kills}K - {totals.errors}E / {totals.attempts} Att
          </div>
        </div>

        {/* Season totals */}
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 600, color: '#8892a4', marginBottom: 12 }}>Season Totals</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, textAlign: 'center' }}>
            {[
              { label: 'Kills', value: totals.kills },
              { label: 'Aces', value: totals.aces },
              { label: 'Digs', value: totals.digs },
              { label: 'Assists', value: totals.assists },
              { label: 'Blocks', value: totals.blocks },
              { label: 'Errors', value: totals.errors, color: '#ef4444' },
            ].map((item, i) => (
              <div key={i}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#8892a4', textTransform: 'uppercase' }}>{item.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: item.color || '#f0f4ff' }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Game log */}
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#f0f4ff' }}>Game Log</h3>
        {myGames.length === 0 && <div className="empty-state">No games played yet</div>}
        {myGames.map(g => {
          const gs = myStats.find(s => s.game_id === g.id);
          return (
            <div key={g.id} className="game-row" onClick={() => onSelectGame(player, g)}>
              <div>
                <div style={{ fontWeight: 600 }}>vs {g.opponent}</div>
                <div style={{ fontSize: 12, color: '#8892a4' }}>
                  {new Date(g.game_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {gs && (
                  <span style={{ fontSize: 12, color: '#8892a4' }}>
                    {gs.kills}K {gs.digs}D
                  </span>
                )}
                <span className={`game-result-badge ${g.result === 'W' ? 'win' : 'loss'}`}>
                  {g.result}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
