import { useMemo, useState } from 'react';
import { useData } from '../contexts/DataContext';
import { hpct, n3, hcol } from '../utils/stats';
import { sortByJersey } from '../utils/sort';
import PlayerBadge from './PlayerBadge';

export default function AveragesTab({ players, playerGameStats, completedGames, teamId, onSelectPlayer }) {
  const { teams } = useData();
  const team = teams.find(t => t.id === teamId);
  const teamPlayers = sortByJersey(players.filter(p => p.team_id === teamId));
  const [scope, setScope] = useState('all'); // 'all' | 'league'

  // Games for this team
  const teamGames = useMemo(
    () => (completedGames || []).filter(g => g.team_id === teamId),
    [completedGames, teamId]
  );
  const leagueGames = useMemo(
    () => teamGames.filter(g => g.is_league),
    [teamGames]
  );

  // Set of game ids included in the current scope
  const scopedGameIds = useMemo(() => {
    const src = scope === 'league' ? leagueGames : teamGames;
    return new Set(src.map(g => g.id));
  }, [scope, teamGames, leagueGames]);

  const scopedStats = useMemo(
    () => (playerGameStats || []).filter(s => scopedGameIds.has(s.game_id)),
    [playerGameStats, scopedGameIds]
  );

  const gameCount = scope === 'league' ? leagueGames.length : teamGames.length;

  function getPlayerAvgs(player) {
    const stats = scopedStats.filter(s => s.player_id === player.id);
    if (stats.length === 0) return null;
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
      <div className="avg-scope-bar">
        <div className="avg-seg">
          <button
            type="button"
            className={`avg-seg-btn${scope === 'all' ? ' on' : ''}`}
            onClick={() => setScope('all')}
          >
            All Games
          </button>
          <button
            type="button"
            className={`avg-seg-btn${scope === 'league' ? ' on' : ''}`}
            onClick={() => setScope('league')}
          >
            League Only
          </button>
        </div>
        <div className="avg-scope-meta">
          Based on {gameCount} {scope === 'league' ? 'league' : 'total'} {gameCount === 1 ? 'game' : 'games'}
        </div>
      </div>

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
                {teamPlayers.map(p => {
                  const a = getPlayerAvgs(p);
                  const dash = <span style={{ color: 'var(--text-muted)' }}>—</span>;
                  return (
                    <tr
                      key={p.id}
                      style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                      onClick={() => onSelectPlayer(p)}
                    >
                      <td style={{ padding: '8px', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
                        <PlayerBadge player={p} team={team} size={32} />
                        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{p.name}</span>
                      </td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: 'var(--text)' }}>{a ? a.sp : dash}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: 'var(--text)' }}>{a ? a.k : dash}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: a && a.e > 0 ? '#dc2626' : 'var(--text)' }}>{a ? a.e : dash}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: 'var(--text)' }}>{a ? a.att : dash}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: a ? hcol(a.k, a.e, a.att) : 'var(--text-muted)', fontWeight: 600 }}>
                        {a ? n3(a.h) : '—'}
                      </td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: 'var(--text)' }}>{a ? a.ast : dash}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: 'var(--text)' }}>{a ? a.sa : dash}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: a && a.se > 0 ? '#dc2626' : 'var(--text)' }}>{a ? a.se : dash}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: 'var(--text)' }}>{a ? a.digs : dash}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: 'var(--text)' }}>{a ? a.bs : dash}</td>
                      <td style={{ textAlign: 'center', padding: '8px 4px', color: 'var(--text)' }}>{a ? a.ba : dash}</td>
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
