import { hpct, n3, hcol } from '../utils/stats';
import { pColors, mkInit } from '../utils/colors';

export default function AveragesTab({ players, playerGameStats, completedGames, teamId, onSelectPlayer }) {
  const teamPlayers = players.filter(p => p.team_id === teamId);

  function getPlayerAvgs(player) {
    const stats = playerGameStats.filter(s => s.player_id === player.id);
    const sp = stats.reduce((a, s) => a + (s.sets_played || 0), 0);
    const k = stats.reduce((a, s) => a + (s.kills || 0), 0);
    const e = stats.reduce((a, s) => a + (s.errors || 0), 0);
    const att = stats.reduce((a, s) => a + (s.attempts || 0), 0);
    const ast = stats.reduce((a, s) => a + (s.assists || 0), 0);
    const sa = stats.reduce((a, s) => a + (s.aces || 0), 0);
    const se = stats.reduce((a, s) => a + (s.serve_errors || 0), 0);
    const digs = stats.reduce((a, s) => a + (s.digs || 0), 0);
    const bs = stats.reduce((a, s) => a + (s.blocks || 0), 0);
    const ba = stats.reduce((a, s) => a + (s.block_assists || 0), 0);
    return { sp, k, e, att, ast, sa, se, digs, bs, ba, h: hpct(k, e, att) };
  }

  return (
    <div>
      {teamPlayers.length === 0 ? (
        <div className="empty-state">No players on roster</div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(128,128,128,0.07)', textAlign: 'center' }}>
                  <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>Player</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>SP</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>K</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>E</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>TA</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>K%</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>A</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>SA</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>SE</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>Digs</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>BS</th>
                  <th style={{ padding: '10px 4px', fontWeight: 600 }}>BA</th>
                </tr>
              </thead>
              <tbody>
                {teamPlayers.map((p, i) => {
                  const a = getPlayerAvgs(p);
                  const colors = p.colors || pColors(p.player_index ?? i);
                  return (
                    <tr
                      key={p.id}
                      style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                      onClick={() => onSelectPlayer(p)}
                    >
                      <td style={{ padding: '8px', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
                        <span
                          className="player-badge"
                          style={{ background: colors.bg, color: colors.text, width: 32, height: 32, fontSize: 11 }}
                        >
                          {p.initials || mkInit(p.name)}
                        </span>
                        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{p.name}</span>
                      </td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: 'var(--text)' }}>{a.sp}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: 'var(--text)' }}>{a.k}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: a.e > 0 ? '#dc2626' : 'var(--text)' }}>{a.e}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: 'var(--text)' }}>{a.att}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: hcol(a.k, a.e, a.att), fontWeight: 600 }}>
                        {n3(a.h)}
                      </td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: 'var(--text)' }}>{a.ast}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: 'var(--text)' }}>{a.sa}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: a.se > 0 ? '#dc2626' : 'var(--text)' }}>{a.se}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: 'var(--text)' }}>{a.digs}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: 'var(--text)' }}>{a.bs}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: 'var(--text)' }}>{a.ba}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
