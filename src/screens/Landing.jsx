import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useVolleyballPal } from '../contexts/VolleyballPalContext';
import { IconLink, IconChart, IconRotate, IconArrowRight, IconSwap } from '../components/Icons';

function readRotationPalTeams() {
  try {
    const raw = localStorage.getItem('rotationpal-teams-v2');
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
}

export default function Landing({ onOpenStatsPal, onOpenRotationPal }) {
  const { currentUser, logout } = useAuth();
  const { teams, completedGames } = useData();
  const { links, standaloneTeams, linkTeam, unlinkTeam, isLinked } = useVolleyballPal();

  const isAdmin = currentUser?.role === 'admin';
  const teamIds = currentUser?.teamIds || [];
  const visibleTeams = isAdmin ? teams : teams.filter(t => teamIds.includes(t.id));

  const linkedTeams = useMemo(
    () => visibleTeams.filter(t => isLinked(t.id)),
    [visibleTeams, links] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Recent team = team with the most recent completed game
  const recentTeamId = useMemo(() => {
    const map = new Map();
    for (const g of completedGames || []) {
      if (!map.has(g.team_id)) map.set(g.team_id, g.game_date);
    }
    let best = null; let bestDate = '';
    for (const t of visibleTeams) {
      const d = map.get(t.id);
      if (d && d > bestDate) { bestDate = d; best = t.id; }
    }
    return best;
  }, [visibleTeams, completedGames]);

  // RotationPal saved lineups (all RotationPal records with any roster/games)
  const rpLineups = useMemo(() => {
    const rpAll = readRotationPalTeams();
    const byId = Object.fromEntries(visibleTeams.map(t => [t.id, t]));
    const visibleIds = new Set(visibleTeams.map(t => t.id));
    const saById = Object.fromEntries(standaloneTeams.map(t => [t.id, t]));
    const lineups = [];
    for (const rec of rpAll) {
      const roster = (rec.roster || []).length;
      const games = (rec.games || []).length;
      if (roster === 0 && games === 0) continue;
      if (visibleIds.has(rec.id)) {
        lineups.push({
          id: rec.id,
          name: byId[rec.id]?.name || rec.name,
          linked: !!links[rec.id],
          kind: 'team',
          roster, games,
        });
      } else if (saById[rec.id]) {
        lineups.push({
          id: rec.id,
          name: saById[rec.id].name,
          linked: false,
          kind: 'standalone',
          roster, games,
        });
      }
    }
    return lineups;
  }, [visibleTeams, standaloneTeams, links]);

  return (
    <div className="vp-home">
      {/* Top bar */}
      <header className="vp-home-topbar">
        <div className="vp-home-brand">
          <span className="vp-home-brand-name">
            Volleyball<span className="vp-home-brand-accent">Pal</span>
          </span>
        </div>

        {linkedTeams.length > 0 && (
          <div className="vp-home-status" title="These teams share roster between StatsPal and RotationPal">
            <span className="vp-home-status-dot" />
            <span className="vp-home-status-names">
              {linkedTeams.map(t => t.name).join(', ')}
            </span>
            <IconSwap size={14} className="vp-home-status-arrow" />
            <span className="vp-home-status-app">RotationPal linked</span>
          </div>
        )}

        <div className="vp-home-userbar">
          <span className="vp-home-username">{currentUser?.name || currentUser?.username}</span>
          <button className="vp-home-logout" onClick={logout}>Logout</button>
        </div>
      </header>

      {/* Two cards */}
      <main className="vp-home-body">
        <div className="vp-home-cards">
          {/* ── StatsPal card ── */}
          <section className="vp-app-card vp-app-stats">
            <div className="vp-app-card-header">
              <div className="vp-app-card-icon">
                <IconChart size={28} />
              </div>
              <div>
                <h2 className="vp-app-card-title">
                  Stats<span>Pal</span>
                </h2>
                <div className="vp-app-card-tag">Stats tracking and management</div>
              </div>
            </div>

            <div className="vp-app-card-list-label">
              Teams {visibleTeams.length > 0 && <span>· {visibleTeams.length}</span>}
            </div>

            {visibleTeams.length === 0 ? (
              <div className="vp-app-card-empty">No teams yet. Open StatsPal to create one.</div>
            ) : (
              <ul className="vp-team-list">
                {visibleTeams.map(team => {
                  const linked = isLinked(team.id);
                  const isRecent = team.id === recentTeamId;
                  return (
                    <li
                      key={team.id}
                      className={`vp-team-row ${linked ? 'linked' : ''} ${isRecent ? 'recent' : ''}`}
                    >
                      <span
                        className="vp-team-dot"
                        style={{ background: team.color || '#58a6ff' }}
                      />
                      <span className="vp-team-name">
                        {team.name}
                        {linked && <IconLink size={14} className="vp-linkicon" />}
                        {isRecent && <span className="vp-recent-chip">Recent</span>}
                      </span>
                      <button
                        type="button"
                        className={`vp-link-toggle ${linked ? 'on' : 'off'}`}
                        onClick={() => linked ? unlinkTeam(team.id) : linkTeam(team.id)}
                        aria-pressed={linked}
                        title={linked ? 'Unlink from RotationPal' : 'Link to RotationPal'}
                      >
                        <span className="vp-link-toggle-track">
                          <span className="vp-link-toggle-thumb" />
                        </span>
                        <span className="vp-link-toggle-label">
                          {linked ? 'Linked' : 'Link to RotationPal'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <button className="vp-app-card-cta vp-cta-stats" onClick={onOpenStatsPal}>
              Open StatsPal <IconArrowRight size={16} />
            </button>
          </section>

          {/* ── RotationPal card ── */}
          <section className="vp-app-card vp-app-rotation">
            <div className="vp-app-card-header">
              <div className="vp-app-card-icon">
                <IconRotate size={28} />
              </div>
              <div>
                <h2 className="vp-app-card-title">
                  Rotation<span>Pal</span>
                </h2>
                <div className="vp-app-card-tag">Live rotation and lineup tracking</div>
              </div>
            </div>

            <div className="vp-app-card-list-label">
              Saved lineups {rpLineups.length > 0 && <span>· {rpLineups.length}</span>}
            </div>

            {rpLineups.length === 0 ? (
              <div className="vp-app-card-empty">
                No saved lineups yet. Open RotationPal to set one up.
              </div>
            ) : (
              <ul className="vp-lineup-list">
                {rpLineups.map(l => (
                  <li
                    key={l.id}
                    className={`vp-lineup-row ${l.linked ? 'linked' : ''}`}
                  >
                    <span className="vp-lineup-name">
                      {l.name}
                      {l.linked && <IconLink size={14} className="vp-linkicon" />}
                      {l.kind === 'standalone' && (
                        <span className="vp-standalone-chip-small">Standalone</span>
                      )}
                    </span>
                    <span className="vp-lineup-meta">
                      {l.roster > 0 && <span>{l.roster} players</span>}
                      {l.games > 0 && <span>· {l.games} game{l.games === 1 ? '' : 's'}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <button className="vp-app-card-cta vp-cta-rotation" onClick={onOpenRotationPal}>
              Open RotationPal <IconArrowRight size={16} />
            </button>
          </section>
        </div>

        <div className="vp-home-hint">
          Toggle <span className="vp-home-hint-tag">Link to RotationPal</span> on any team to share its roster between the two apps.
        </div>
      </main>
    </div>
  );
}
