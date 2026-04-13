import { useData } from '../contexts/DataContext';
import { hpct, n3, playerTotals } from '../utils/stats';
import { sortedCompleted, sortByJersey } from '../utils/sort';

export default function Export({ team, onBack }) {
  const { players, completedGames, playerGameStats } = useData();

  const teamPlayers = sortByJersey(players.filter(p => p.team_id === team.id));
  const teamGames = sortedCompleted(completedGames.filter(g => g.team_id === team.id));

  function buildCSV() {
    const headers = ['Player', 'SP', 'K', 'E', 'TA', 'K%', 'A', 'BHE', 'SA', 'SE', 'R', 'Digs', 'DE', 'BS', 'BA', 'BE'];
    const rows = teamPlayers.map(p => {
      const stats = playerGameStats.filter(s => s.player_id === p.id);
      const t = playerTotals(stats);
      const h = hpct(t.kills, t.errors, t.attempts);
      return [
        p.name,
        t.sets_played,
        t.kills,
        t.errors,
        t.attempts,
        h !== null ? n3(h) : '',
        t.assists,
        t.ball_handling_errors || 0,
        t.aces,
        t.serve_errors,
        t.receives || 0,
        t.digs,
        t.digging_errors || 0,
        t.blocks,
        t.block_assists,
        t.blocking_errors || 0,
      ];
    });
    return [headers, ...rows].map(r => r.join(',')).join('\n');
  }

  function buildGameLogCSV() {
    const headers = ['Date', 'Opponent', 'Result', 'Sets', 'Location'];
    const rows = teamGames.map(g => [
      g.game_date, g.opponent, g.result, `${g.home_sets}-${g.away_sets}`, g.location,
    ]);
    return [headers, ...rows].map(r => r.join(',')).join('\n');
  }

  function download(content, filename) {
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{
        background: `linear-gradient(135deg, ${team.color || '#0d1f5c'}, ${team.color || '#1a3a8f'})`,
        color: '#fff', padding: '16px 20px',
      }}>
        <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
          Back
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginTop: 8 }}>Export — {team.name}</h1>
      </div>

      <div style={{ padding: '16px 20px', maxWidth: 600, margin: '0 auto' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <h3 style={{ marginBottom: 8, color: 'var(--text)' }}>Season Stats</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>Download player season averages and totals as CSV</p>
          <button
            className="modal-btn-primary"
            onClick={() => download(buildCSV(), `${team.name.replace(/\s+/g, '_')}_season_stats.csv`)}
          >
            Download Season Stats
          </button>
        </div>

        <div className="card" style={{ textAlign: 'center' }}>
          <h3 style={{ marginBottom: 8, color: 'var(--text)' }}>Game Log</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>Download all game results as CSV</p>
          <button
            className="modal-btn-primary"
            onClick={() => download(buildGameLogCSV(), `${team.name.replace(/\s+/g, '_')}_game_log.csv`)}
          >
            Download Game Log
          </button>
        </div>
      </div>
    </div>
  );
}
