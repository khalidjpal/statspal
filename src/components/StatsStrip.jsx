import { useState, useEffect, useRef } from 'react';
import { hpct, n2, n3, hcol, playerTotals, teamRecord } from '../utils/stats';
import { sortByJersey } from '../utils/sort';

export default function StatsStrip({ players, playerGameStats, completedGames, teamId, currentUser }) {
  const isPlayerRole = currentUser?.role === 'player';
  const [selectedPlayerId, setSelectedPlayerId] = useState(
    isPlayerRole ? (currentUser?.player_id || null) : null
  );
  const [flashing, setFlashing] = useState(false);
  const flashTimeout = useRef(null);
  const prevStr = useRef(null);

  const teamPlayers = sortByJersey(players.filter(p => p.team_id === teamId));
  const teamGames = completedGames.filter(g => g.team_id === teamId);
  const teamGameIds = new Set(teamGames.map(g => g.id));
  const record = teamRecord(teamGames);

  // Compute totals from raw data — always live
  const relevantStats = selectedPlayerId
    ? playerGameStats.filter(s => s.player_id === selectedPlayerId)
    : playerGameStats.filter(s => teamGameIds.has(s.game_id));
  const totals = playerTotals(relevantStats);

  console.log('[StatsStrip] render — games:', teamGames.length, 'statRows:', relevantStats.length, 'record:', record.w + '-' + record.l, 'kills:', totals.kills);

  const sp = totals.sets_played || 0;
  const h = hpct(totals.kills, totals.errors, totals.attempts);
  const kps = sp > 0 ? totals.kills / sp : null;
  const dps = sp > 0 ? totals.digs / sp : null;
  const asps = sp > 0 ? totals.assists / sp : null;

  // Flash animation when any computed value changes
  const valStr = `${n3(h)}|${n2(kps)}|${n2(dps)}|${n2(asps)}`;
  useEffect(() => {
    if (prevStr.current !== null && prevStr.current !== valStr) {
      setFlashing(true);
      clearTimeout(flashTimeout.current);
      flashTimeout.current = setTimeout(() => setFlashing(false), 700);
    }
    prevStr.current = valStr;
    return () => clearTimeout(flashTimeout.current);
  }, [valStr]);

  return (
    <div className={`stats-strip${flashing ? ' stats-strip-flash' : ''}`}>
      {/* Selector column */}
      <div className="stats-strip-sel">
        {isPlayerRole ? (
          <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 1.3 }}>
            {teamPlayers.find(p => p.id === selectedPlayerId)?.name?.split(' ')[0] || 'My Stats'}
          </div>
        ) : (
          <select
            value={selectedPlayerId || ''}
            onChange={e => setSelectedPlayerId(e.target.value || null)}
            className="stats-strip-select"
          >
            <option value="">Team</option>
            {teamPlayers.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      <div className="stats-strip-item">
        <div className="stats-strip-label">Record</div>
        <div className="stats-strip-value">{`${record.w}-${record.l}`}</div>
      </div>
      <div className="stats-strip-item">
        <div className="stats-strip-label">K%</div>
        <div className="stats-strip-value" style={{ color: hcol(totals.kills, totals.errors, totals.attempts), fontSize: 16 }}>
          {n3(h)}
        </div>
      </div>
      <div className="stats-strip-item">
        <div className="stats-strip-label">K/S</div>
        <div className="stats-strip-value">{n2(kps)}</div>
      </div>
      <div className="stats-strip-item">
        <div className="stats-strip-label">Dig/S</div>
        <div className="stats-strip-value">{n2(dps)}</div>
      </div>
      <div className="stats-strip-item">
        <div className="stats-strip-label">Ast/S</div>
        <div className="stats-strip-value">{n2(asps)}</div>
      </div>
    </div>
  );
}
