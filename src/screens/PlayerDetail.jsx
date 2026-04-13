import { useEffect, useMemo, useState } from 'react';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import { hpct, n3, hcol, hlbl, playerTotals } from '../utils/stats';
import { sortedCompleted } from '../utils/sort';
import PlayerBadge from '../components/PlayerBadge';
import ManualResultModal from '../components/modals/ManualResultModal';

const BAR_MIN = -0.05, BAR_MAX = 0.40;

function StatCell({ value, label, color, muted, accent }) {
  return (
    <div className={`pd-stat${muted ? ' pd-stat-muted' : ''}${accent ? ' pd-stat-accent' : ''}`}>
      <div className={`pd-stat-value${muted ? ' pd-stat-value-sm' : ''}`} style={color ? { color } : undefined}>
        {value}
      </div>
      <div className="pd-stat-label">{label}</div>
    </div>
  );
}

export default function PlayerDetail({ player, team, onBack, onSelectGame, asModal = false }) {
  const { completedGames, playerGameStats, players, refresh } = useData();
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const [editGame, setEditGame] = useState(null);
  const [leagueOnly, setLeagueOnly] = useState(false);

  useEffect(() => { refresh(); }, [refresh]);

  // League game IDs
  const leagueGameIds = useMemo(
    () => new Set(completedGames.filter(g => g.is_league).map(g => g.id)),
    [completedGames]
  );

  const allMyStats = playerGameStats.filter(s => s.player_id === player.id);
  const myStats = leagueOnly
    ? allMyStats.filter(s => leagueGameIds.has(s.game_id))
    : allMyStats;
  const leagueGameCount = allMyStats.filter(s => leagueGameIds.has(s.game_id)).length;

  const totals = playerTotals(myStats);
  const sp = totals.sets_played || 0;

  const h        = hpct(totals.kills, totals.errors, totals.attempts);
  const effColor = hcol(totals.kills, totals.errors, totals.attempts);
  const effLabel = hlbl(totals.kills, totals.errors, totals.attempts);

  const totalBlocks = totals.blocks + totals.block_assists;
  const digsPerSet  = sp > 0 ? (totals.digs    / sp).toFixed(1) : '—';
  const astsPerSet  = sp > 0 ? (totals.assists  / sp).toFixed(1) : '—';

  const barPct = h == null
    ? null
    : Math.min(100, Math.max(0, ((h - BAR_MIN) / (BAR_MAX - BAR_MIN)) * 100));

  // Game log — always show all games, but filter to ones with stats
  const allGameIds = new Set(allMyStats.map(s => s.game_id));
  const myGames = sortedCompleted(completedGames.filter(g => allGameIds.has(g.id)));

  const subInfo = [
    player.position,
    player.height,
    player.grade ? `Gr. ${player.grade}` : null,
    team.name,
  ].filter(Boolean).join(' · ');

  const body = (
    <div className="pgd-body">

      {/* ── Header ── */}
      <div className="pgd-head">
        <PlayerBadge player={player} team={team} size={60} />
        <div className="pgd-head-text">
          <div className="pgd-name">{player.name}</div>
          {player.jersey_number != null && (
            <div style={{ fontSize: 11, color: team.color || '#58a6ff', fontWeight: 700, marginBottom: 2 }}>
              #{player.jersey_number}
            </div>
          )}
          <div className="pgd-sub">{subInfo}</div>
        </div>
      </div>

      {/* ── Toggle ── */}
      <div className="pd-toggle-bar">
        <div className="avg-seg pd-scope-seg">
          <button className={`avg-seg-btn${!leagueOnly ? ' on' : ''}`} onClick={() => setLeagueOnly(false)}>
            All Games
          </button>
          <button className={`avg-seg-btn${leagueOnly ? ' on' : ''}`} onClick={() => setLeagueOnly(true)}>
            League Only
          </button>
        </div>
        {leagueOnly && (
          <span className="pd-league-note">
            {leagueGameCount} league game{leagueGameCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── Hitting Efficiency Hero ── */}
      <div className="pgd-card pgd-eff pd-eff-hero pd-cat-card" style={{ borderLeftColor: effColor }}>
        <div className="pgd-section-label">Hitting Efficiency</div>
        <div className="pd-eff-main">
          <span className="pgd-eff-num" style={{ color: effColor }}>{n3(h)}</span>
          <span className="pgd-eff-tier" style={{ color: effColor, borderColor: effColor, background: `${effColor}22` }}>
            {effLabel}
          </span>
        </div>
        <div className="pgd-eff-formula">
          ({totals.kills}K − {totals.errors}E) ÷ {totals.attempts} TA
        </div>
        {barPct !== null && (
          <div className="pd-eff-bar-wrap">
            <div className="pd-eff-bar">
              <div className="pd-eff-bar-dot" style={{ left: `${barPct}%`, background: effColor }} />
            </div>
            <div className="pd-eff-bar-labels">
              <span>Poor</span><span>Avg</span><span>Excellent</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Attack ── */}
      <div className="pgd-card pd-cat-card" style={{ borderLeftColor: '#58a6ff' }}>
        <div className="pgd-section-label" style={{ color: '#58a6ff' }}>Attack</div>
        <div className="pd-cat-grid pd-cat-4">
          <StatCell value={sp}             label="SP" />
          <StatCell value={totals.kills}   label="K" />
          <StatCell value={totals.errors}  label="E"  color={totals.errors > 0 ? '#f85149' : undefined} />
          <StatCell value={totals.attempts} label="TA" />
        </div>
      </div>

      {/* ── Ball Handling ── */}
      <div className="pgd-card pd-cat-card" style={{ borderLeftColor: '#fb923c' }}>
        <div className="pgd-section-label" style={{ color: '#fb923c' }}>Ball Handling</div>
        <div className="pd-cat-grid pd-cat-3">
          <StatCell value={totals.assists}                      label="A" />
          <StatCell value={astsPerSet}                          label="Per Set" muted />
          <StatCell value={totals.ball_handling_errors || 0}   label="BHE" color={totals.ball_handling_errors > 0 ? '#f85149' : undefined} />
        </div>
      </div>

      {/* ── Serve ── */}
      <div className="pgd-card pd-cat-card" style={{ borderLeftColor: '#f5c95a' }}>
        <div className="pgd-section-label" style={{ color: '#f5c95a' }}>Serve</div>
        <div className="pd-cat-grid pd-cat-2">
          <StatCell value={totals.aces}         label="SA" color="#3fb950" />
          <StatCell value={totals.serve_errors} label="SE" color={totals.serve_errors > 0 ? '#f85149' : undefined} />
        </div>
      </div>

      {/* ── Reception & Defense ── */}
      <div className="pgd-card pd-cat-card" style={{ borderLeftColor: '#2dd4bf' }}>
        <div className="pgd-section-label" style={{ color: '#2dd4bf' }}>Reception & Defense</div>
        <div className="pd-cat-grid pd-cat-3">
          <StatCell value={totals.receives || 0}       label="R" />
          <StatCell value={totals.digs}                label="Digs" />
          <StatCell value={totals.digging_errors || 0} label="DE" color={totals.digging_errors > 0 ? '#f85149' : undefined} />
        </div>
        <div className="pd-cat-grid pd-cat-2" style={{ marginTop: 6 }}>
          <StatCell value={digsPerSet} label="Digs / Set" muted />
        </div>
      </div>

      {/* ── Blocking ── */}
      <div className="pgd-card pd-cat-card" style={{ borderLeftColor: '#a78bfa' }}>
        <div className="pgd-section-label" style={{ color: '#a78bfa' }}>Blocking</div>
        <div className="pd-cat-grid pd-cat-4">
          <StatCell value={totals.blocks}                   label="BS" />
          <StatCell value={totals.block_assists}            label="BA" />
          <StatCell value={totalBlocks}                     label="Total" color="#a78bfa" accent />
          <StatCell value={totals.blocking_errors || 0}    label="BE" color={totals.blocking_errors > 0 ? '#f85149' : undefined} />
        </div>
      </div>

      {/* ── Game Log ── */}
      <div style={{ marginTop: 4 }}>
        <div className="pgd-section-label">Game Log</div>
        {myGames.length === 0 && <div className="empty-state">No games played yet</div>}
        {myGames.map(g => {
          const gs = allMyStats.find(s => s.game_id === g.id);
          const gameH      = gs ? hpct(gs.kills, gs.errors, gs.attempts) : null;
          const gameHColor = gs ? hcol(gs.kills, gs.errors, gs.attempts) : '#888';
          const gameDate   = new Date(g.game_date + 'T00:00:00')
            .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          return (
            <div key={g.id} className="pd-game-row" onClick={() => onSelectGame(player, g)}>
              <div className="pd-game-left">
                <div className="pd-game-opp">
                  vs {g.opponent}
                  {g.is_league && <span className="pd-league-badge">League</span>}
                </div>
                <div className="pd-game-date">{gameDate}</div>
              </div>
              <div className="pd-game-right">
                {gs && (
                  <span className="pd-game-stats">
                    <span>{gs.kills}K</span>
                    <span className="pd-game-sep">·</span>
                    <span>{gs.digs}D</span>
                    <span className="pd-game-sep">·</span>
                    <span style={{ color: gameHColor, fontWeight: 700 }}>{n3(gameH)}</span>
                  </span>
                )}
                <span className={`game-result-badge ${g.result === 'W' ? 'win' : 'loss'}`}>{g.result}</span>
                {isAdmin && (
                  <button
                    className="pd-edit-btn"
                    onClick={e => { e.stopPropagation(); setEditGame(g); }}
                  >Edit</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editGame && (
        <ManualResultModal
          game={editGame}
          team={team}
          players={players}
          existingStats={playerGameStats.filter(s => s.game_id === editGame.id)}
          onClose={() => setEditGame(null)}
          onSaved={() => { setEditGame(null); refresh(); }}
        />
      )}
    </div>
  );

  if (asModal) return body;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{
        background: `linear-gradient(135deg, ${team.color || '#0d1f5c'}, ${team.color || '#1a3a8f'})`,
        color: '#fff', padding: '16px 20px',
      }}>
        <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
          Back
        </button>
      </div>
      <div style={{ padding: '16px 20px', maxWidth: 600, margin: '0 auto' }}>
        {body}
      </div>
    </div>
  );
}
