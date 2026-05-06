import { useMemo } from 'react';
import { computeStandings } from '../../utils/stats';

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function StandingsWidget({ team, leagueTeams, leagueResults }) {
  const myLeagueTeams = useMemo(
    () => leagueTeams.filter(lt => lt.team_id === team.id),
    [leagueTeams, team.id]
  );
  const myLeagueResults = useMemo(
    () => leagueResults.filter(lr => lr.team_id === team.id),
    [leagueResults, team.id]
  );

  // Use computeStandings to get teams + h2h map, then re-sort here per dashboard rules:
  //   1. Win % desc
  //   2. Wins desc
  //   3. Head-to-head (when both above tie)
  //   4. Alphabetical
  const ranked = useMemo(() => {
    const base = computeStandings(myLeagueTeams, myLeagueResults);
    const sorted = [...base].sort((a, b) => {
      const totalA = a.wins + a.losses;
      const totalB = b.wins + b.losses;
      const pctA = totalA > 0 ? a.wins / totalA : 0;
      const pctB = totalB > 0 ? b.wins / totalB : 0;
      if (pctB !== pctA) return pctB - pctA;
      if (b.wins !== a.wins) return b.wins - a.wins;
      const h2h = a.h2h?.[b.id] || 0;
      if (h2h !== 0) return -h2h;
      return (a.name || '').localeCompare(b.name || '');
    });
    return sorted.map((t, i) => ({ ...t, rank: i + 1 }));
  }, [myLeagueTeams, myLeagueResults]);

  return (
    <div className="dash-widget dash-widget-standings">
      <header className="dash-widget-head">
        <span className="dash-widget-title">🏆 Standings</span>
        <span className="dash-widget-meta">{ranked.length} teams</span>
      </header>

      <div className="dash-widget-body dash-stand-scroll">
        {ranked.length === 0 ? (
          <div className="dash-empty">
            <div className="dash-empty-title">No teams in your league yet</div>
            <div className="dash-empty-sub">Use the + button to add a team to the standings.</div>
          </div>
        ) : (
          <table className="dash-stand-tbl">
            <thead>
              <tr>
                <th className="dash-stand-rank">RANK</th>
                <th className="dash-stand-team">TEAM</th>
                <th>W</th>
                <th>L</th>
                <th>PCT</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map(t => {
                const total = t.wins + t.losses;
                const pct = total > 0 ? (t.wins / total).toFixed(3).replace(/^0/, '') : '—';
                return (
                  <tr key={t.id} className={t.is_us ? 'dash-stand-us' : ''}>
                    <td className="dash-stand-rank">
                      <span className="dash-stand-rank-pill">{ordinal(t.rank)}</span>
                    </td>
                    <td className="dash-stand-team">
                      <span className="dash-stand-dot" style={{ background: t.dot_color || '#58a6ff' }} />
                      <span className="dash-stand-name">
                        {t.name}{t.is_us && <span className="dash-stand-star"> ★</span>}
                      </span>
                    </td>
                    <td className="dash-stand-w">{t.wins}</td>
                    <td className="dash-stand-l">{t.losses}</td>
                    <td className="dash-stand-pct">{pct}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
