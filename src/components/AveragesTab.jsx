import { hpct, n2, n3, hcol } from '../utils/stats';
import { pColors, mkInit } from '../utils/colors';

export default function AveragesTab({ players, playerGameStats, completedGames, teamId, onSelectPlayer }) {
  const teamPlayers = players.filter(p => p.team_id === teamId);
  const teamGames = completedGames.filter(g => g.team_id === teamId);

  function getPlayerAvgs(player) {
    const stats = playerGameStats.filter(s => s.player_id === player.id);
    const sp = stats.reduce((a, s) => a + (s.sets_played || 0), 0);
    const k = stats.reduce((a, s) => a + (s.kills || 0), 0);
    const e = stats.reduce((a, s) => a + (s.errors || 0), 0);
    const att = stats.reduce((a, s) => a + (s.attempts || 0), 0);
    const aces = stats.reduce((a, s) => a + (s.aces || 0), 0);
    const digs = stats.reduce((a, s) => a + (s.digs || 0), 0);
    const assists = stats.reduce((a, s) => a + (s.assists || 0), 0);
    const blocks = stats.reduce((a, s) => a + (s.blocks || 0), 0);
    return {
      sp,
      kps: sp > 0 ? k / sp : null,
      aps: sp > 0 ? aces / sp : null,
      dps: sp > 0 ? digs / sp : null,
      asps: sp > 0 ? assists / sp : null,
      bps: sp > 0 ? blocks / sp : null,
      h: hpct(k, e, att),
      k, e, att,
    };
  }

  return (
    <div>
      {teamPlayers.length === 0 ? (
        <div className="empty-state">No players on roster</div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8f9fa', textAlign: 'center' }}>
                <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 600 }}>Player</th>
                <th style={{ padding: '10px 4px', fontWeight: 600 }}>SP</th>
                <th style={{ padding: '10px 4px', fontWeight: 600 }}>K/S</th>
                <th style={{ padding: '10px 4px', fontWeight: 600 }}>A/S</th>
                <th style={{ padding: '10px 4px', fontWeight: 600 }}>D/S</th>
                <th style={{ padding: '10px 4px', fontWeight: 600 }}>B/S</th>
                <th style={{ padding: '10px 4px', fontWeight: 600 }}>Hit%</th>
              </tr>
            </thead>
            <tbody>
              {teamPlayers.map((p, i) => {
                const a = getPlayerAvgs(p);
                const colors = p.colors || pColors(p.player_index ?? i);
                return (
                  <tr
                    key={p.id}
                    style={{ borderTop: '1px solid #eee', cursor: 'pointer' }}
                    onClick={() => onSelectPlayer(p)}
                  >
                    <td style={{ padding: '8px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        className="player-badge"
                        style={{ background: colors.bg, color: colors.text, width: 32, height: 32, fontSize: 11 }}
                      >
                        {p.initials || mkInit(p.name)}
                      </span>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</span>
                    </td>
                    <td style={{ textAlign: 'center', padding: '8px 4px' }}>{a.sp}</td>
                    <td style={{ textAlign: 'center', padding: '8px 4px' }}>{n2(a.kps)}</td>
                    <td style={{ textAlign: 'center', padding: '8px 4px' }}>{n2(a.aps)}</td>
                    <td style={{ textAlign: 'center', padding: '8px 4px' }}>{n2(a.dps)}</td>
                    <td style={{ textAlign: 'center', padding: '8px 4px' }}>{n2(a.bps)}</td>
                    <td style={{ textAlign: 'center', padding: '8px 4px', color: hcol(a.k, a.e, a.att), fontWeight: 600 }}>
                      {n3(a.h)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
