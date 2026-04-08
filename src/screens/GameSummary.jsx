import { useEffect } from 'react';
import { useData } from '../contexts/DataContext';
import { hpct, n2, n3, hcol, playerTotals } from '../utils/stats';
import { pColors, mkInit } from '../utils/colors';

export default function GameSummary({ game, team, onBack, onSelectPlayer }) {
  const { players, playerGameStats, refresh } = useData();

  useEffect(() => { refresh(); }, [refresh]);

  const teamPlayers = players.filter(p => p.team_id === team.id);
  const gameStats = playerGameStats.filter(s => s.game_id === game.id);

  function getPlayerStats(playerId) {
    return gameStats.find(s => s.player_id === playerId) || { kills: 0, aces: 0, digs: 0, assists: 0, blocks: 0, errors: 0, attempts: 0, sets_played: 0 };
  }

  // Team totals for this game
  const totals = playerTotals(gameStats);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0f1e' }}>
      <div style={{
        background: `linear-gradient(135deg, ${team.color || '#0d1f5c'}, ${team.color || '#1a3a8f'})`,
        color: '#fff', padding: '16px 20px',
      }}>
        <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
          Back
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginTop: 8 }}>
          vs {game.opponent}
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
          <span className={`game-result-badge ${game.result === 'W' ? 'win' : 'loss'}`}>
            {game.result}
          </span>
          <span style={{ fontSize: 18, fontWeight: 700 }}>{game.home_sets}-{game.away_sets}</span>
          <span style={{ fontSize: 13, opacity: 0.7 }}>
            {new Date(game.game_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
        {game.set_scores && (
          <div style={{ fontSize: 12, opacity: 0.5, marginTop: 4 }}>
            {game.set_scores.map((s, i) => `S${i + 1}: ${s.home}-${s.away}`).join('  ')}
          </div>
        )}
      </div>

      <div style={{ padding: '16px 20px', maxWidth: 800, margin: '0 auto' }}>
        {/* Team totals strip */}
        <div className="card" style={{ marginBottom: 16, background: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#8892a4', marginBottom: 8 }}>Team Totals</div>
          <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
            {[
              { label: 'K', value: totals.kills },
              { label: 'A', value: totals.aces },
              { label: 'D', value: totals.digs },
              { label: 'AST', value: totals.assists },
              { label: 'B', value: totals.blocks },
              { label: 'E', value: totals.errors },
              { label: 'Hit%', value: n3(hpct(totals.kills, totals.errors, totals.attempts)), color: hcol(totals.kills, totals.errors, totals.attempts) },
            ].map((item, i) => (
              <div key={i}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#8892a4', textTransform: 'uppercase' }}>{item.label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: item.color || '#f0f4ff' }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Individual player stats */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', background: '#111827', border: '1px solid rgba(255,255,255,0.06)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, color: '#f0f4ff' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', textAlign: 'center' }}>
                <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 600 }}>Player</th>
                <th style={{ padding: '10px 4px', fontWeight: 600 }}>SP</th>
                <th style={{ padding: '10px 4px', fontWeight: 600 }}>K</th>
                <th style={{ padding: '10px 4px', fontWeight: 600 }}>A</th>
                <th style={{ padding: '10px 4px', fontWeight: 600 }}>D</th>
                <th style={{ padding: '10px 4px', fontWeight: 600 }}>AST</th>
                <th style={{ padding: '10px 4px', fontWeight: 600 }}>B</th>
                <th style={{ padding: '10px 4px', fontWeight: 600 }}>E</th>
                <th style={{ padding: '10px 4px', fontWeight: 600 }}>Hit%</th>
              </tr>
            </thead>
            <tbody>
              {teamPlayers.map((p, i) => {
                const s = getPlayerStats(p.id);
                if (s.sets_played === 0 && s.kills === 0 && s.aces === 0 && s.digs === 0) return null;
                const colors = p.colors || pColors(p.player_index ?? i);
                return (
                  <tr
                    key={p.id}
                    style={{ borderTop: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer' }}
                    onClick={() => onSelectPlayer(p, game)}
                  >
                    <td style={{ padding: '8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="player-badge" style={{ background: colors.bg, color: colors.text, width: 28, height: 28, fontSize: 10 }}>
                        {p.initials || mkInit(p.name)}
                      </span>
                      <span style={{ fontWeight: 600, fontSize: 12 }}>{p.name}</span>
                    </td>
                    <td style={{ textAlign: 'center', padding: '8px 4px' }}>{s.sets_played}</td>
                    <td style={{ textAlign: 'center', padding: '8px 4px' }}>{s.kills}</td>
                    <td style={{ textAlign: 'center', padding: '8px 4px' }}>{s.aces}</td>
                    <td style={{ textAlign: 'center', padding: '8px 4px' }}>{s.digs}</td>
                    <td style={{ textAlign: 'center', padding: '8px 4px' }}>{s.assists}</td>
                    <td style={{ textAlign: 'center', padding: '8px 4px' }}>{s.blocks}</td>
                    <td style={{ textAlign: 'center', padding: '8px 4px', color: '#C0392B' }}>{s.errors}</td>
                    <td style={{ textAlign: 'center', padding: '8px 4px', color: hcol(s.kills, s.errors, s.attempts), fontWeight: 600 }}>
                      {n3(hpct(s.kills, s.errors, s.attempts))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
