import { useState, useMemo } from 'react';
import PlayerBadge from '../components/PlayerBadge';
import { hpct, n3, hcol } from '../utils/stats';
import { sortByJersey } from '../utils/sort';

const STAT_TYPES = ['kills', 'aces', 'digs', 'assists', 'blocks', 'errors', 'attempts'];

export default function LiveStats({ team, roster: rosterProp, onBack, onSave }) {
  const roster = useMemo(() => sortByJersey(rosterProp || []), [rosterProp]);
  const [stats, setStats] = useState(() => {
    const init = {};
    roster.forEach(p => {
      init[p.id] = { kills: 0, aces: 0, digs: 0, assists: 0, blocks: 0, errors: 0, attempts: 0, sets_played: 0 };
    });
    return init;
  });
  const [selectedPlayer, setSelectedPlayer] = useState(roster[0]?.id || null);

  function increment(playerId, stat) {
    setStats(prev => ({
      ...prev,
      [playerId]: { ...prev[playerId], [stat]: (prev[playerId][stat] || 0) + 1 },
    }));
  }

  function decrement(playerId, stat) {
    setStats(prev => ({
      ...prev,
      [playerId]: { ...prev[playerId], [stat]: Math.max(0, (prev[playerId][stat] || 0) - 1) },
    }));
  }

  function setSetsPlayed(playerId, val) {
    setStats(prev => ({
      ...prev,
      [playerId]: { ...prev[playerId], sets_played: Math.max(0, val) },
    }));
  }

  const player = roster.find(p => p.id === selectedPlayer);
  const ps = selectedPlayer ? stats[selectedPlayer] : null;

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <div style={{
        background: `linear-gradient(135deg, ${team.color || '#0d1f5c'}, ${team.color || '#1a3a8f'})`,
        color: '#fff', padding: '12px 20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
          Back to Game
        </button>
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>Live Stats</h2>
        <button onClick={() => onSave(stats)} style={{ background: '#c9a84c', color: '#000', padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
          Save
        </button>
      </div>

      <div style={{ padding: '12px 20px', maxWidth: 600, margin: '0 auto' }}>
        {/* Player selector */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 16, paddingBottom: 4 }}>
          {roster.map(p => {
            const isSelected = p.id === selectedPlayer;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedPlayer(p.id)}
                style={{
                  flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  padding: '8px 12px', borderRadius: 10,
                  background: isSelected ? (team.color || '#1a3a8f') : '#fff',
                  color: isSelected ? '#fff' : '#333',
                  border: 'none', cursor: 'pointer',
                  boxShadow: isSelected ? '0 2px 8px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.08)',
                }}
              >
                <PlayerBadge player={p} team={team} size={36} />
                <span style={{ fontSize: 11, fontWeight: 600 }}>{p.name.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>

        {/* Stat entry for selected player */}
        {player && ps && (
          <div className="card">
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{player.name}</div>
              {ps.attempts > 0 && (
                <div style={{ fontSize: 13, color: hcol(ps.kills, ps.errors, ps.attempts), fontWeight: 600 }}>
                  Hit%: {n3(hpct(ps.kills, ps.errors, ps.attempts))}
                </div>
              )}
            </div>

            {/* Sets played */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, padding: '8px 0', borderBottom: '1px solid #eee' }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Sets Played</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={() => setSetsPlayed(player.id, ps.sets_played - 1)}
                  style={{ width: 32, height: 32, borderRadius: 8, background: '#f0f2f5', border: 'none', fontSize: 18, cursor: 'pointer' }}>−</button>
                <span style={{ fontWeight: 700, fontSize: 18, minWidth: 30, textAlign: 'center' }}>{ps.sets_played}</span>
                <button onClick={() => setSetsPlayed(player.id, ps.sets_played + 1)}
                  style={{ width: 32, height: 32, borderRadius: 8, background: '#f0f2f5', border: 'none', fontSize: 18, cursor: 'pointer' }}>+</button>
              </div>
            </div>

            {/* Stat counters */}
            {STAT_TYPES.map(stat => (
              <div key={stat} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f2f5' }}>
                <span style={{ fontWeight: 600, fontSize: 14, textTransform: 'capitalize' }}>{stat}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button onClick={() => decrement(player.id, stat)}
                    style={{ width: 32, height: 32, borderRadius: 8, background: stat === 'errors' ? '#fdecea' : '#f0f2f5', border: 'none', fontSize: 18, cursor: 'pointer', color: stat === 'errors' ? '#8b1a1a' : '#333' }}>−</button>
                  <span style={{ fontWeight: 700, fontSize: 18, minWidth: 30, textAlign: 'center', color: stat === 'errors' ? '#C0392B' : '#333' }}>{ps[stat]}</span>
                  <button onClick={() => increment(player.id, stat)}
                    style={{ width: 32, height: 32, borderRadius: 8, background: stat === 'errors' ? '#fdecea' : '#f0f2f5', border: 'none', fontSize: 18, cursor: 'pointer', color: stat === 'errors' ? '#8b1a1a' : '#333' }}>+</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
