import { useMemo, useState } from 'react';
import { useData } from '../contexts/DataContext';
import { hpct, n3, hcol, hlbl, playerTotals } from '../utils/stats';
import PlayerBadge from '../components/PlayerBadge';

const EMPTY = { kills: 0, aces: 0, digs: 0, assists: 0, blocks: 0, errors: 0, attempts: 0, sets_played: 0, block_assists: 0, serve_errors: 0 };
const BAR_MIN = -0.05, BAR_MAX = 0.40;

function barPos(h) {
  if (h == null) return null;
  return Math.min(100, Math.max(0, ((h - BAR_MIN) / (BAR_MAX - BAR_MIN)) * 100));
}

function cmp(a, b, higherIsBetter = true) {
  if (a == null || b == null || isNaN(a) || isNaN(b)) return 0;
  if (Math.abs(a - b) < 0.001) return 0;
  return (a > b) === higherIsBetter ? 1 : -1;
}

function cmpColor(dir) {
  if (dir > 0) return '#3fb950';
  if (dir < 0) return '#f85149';
  return '#f0f6fc';
}

function ps(val, sp) { return (val / Math.max(sp, 1)).toFixed(2); }

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

export default function GameDetailBody({ player, game, team }) {
  const { playerGameStats, completedGames } = useData();
  const [leagueOnly, setLeagueOnly] = useState(false);

  const stats = playerGameStats.find(s => s.player_id === player.id && s.game_id === game.id) || EMPTY;

  // League game IDs for filtering season averages
  const leagueGameIds = useMemo(
    () => new Set(completedGames.filter(g => g.is_league).map(g => g.id)),
    [completedGames]
  );

  const allMyStats = playerGameStats.filter(s => s.player_id === player.id);
  const seasonStats = leagueOnly
    ? allMyStats.filter(s => leagueGameIds.has(s.game_id))
    : allMyStats;
  const season = playerTotals(seasonStats);
  const leagueGameCount = allMyStats.filter(s => leagueGameIds.has(s.game_id)).length;

  // This game raw values
  const sp   = Math.max(stats.sets_played || 0, 1);
  const k    = stats.kills         || 0;
  const e    = stats.errors        || 0;
  const ta   = stats.attempts      || 0;
  const digs = stats.digs          || 0;
  const aces = stats.aces          || 0;
  const se   = stats.serve_errors  || 0;
  const bs   = stats.blocks        || 0;
  const ba   = stats.block_assists || 0;
  const ast  = stats.assists       || 0;
  const totalBlocks = bs + ba;

  const h        = hpct(k, e, ta);
  const effColor = hcol(k, e, ta);
  const effLabel = hlbl(k, e, ta);
  const barPct   = barPos(h);

  const seasonSP = Math.max(season.sets_played || 0, 1);
  const seasonH  = hpct(season.kills, season.errors, season.attempts);

  const digsPerSet = ps(digs, sp);
  const astsPerSet = ps(ast, sp);

  const gameDate = new Date(game.game_date + 'T00:00:00')
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const scoreStr = (game.home_sets != null && game.away_sets != null)
    ? `${game.home_sets}–${game.away_sets}` : '';
  const subInfo = [player.position, player.height, player.grade ? `Gr. ${player.grade}` : null]
    .filter(Boolean).join(' · ');

  // Full 10-stat comparison
  const comparisons = [
    { label: 'K%',        game: n3(h),         season: n3(seasonH),                            dir: cmp(h, seasonH, true) },
    { label: 'K / Set',   game: ps(k, sp),      season: ps(season.kills, seasonSP),             dir: cmp(k/sp, season.kills/seasonSP, true) },
    { label: 'E / Set',   game: ps(e, sp),      season: ps(season.errors, seasonSP),            dir: cmp(e/sp, season.errors/seasonSP, false) },
    { label: 'TA / Set',  game: ps(ta, sp),     season: ps(season.attempts, seasonSP),          dir: cmp(ta/sp, season.attempts/seasonSP, true) },
    { label: 'A / Set',   game: ps(ast, sp),    season: ps(season.assists, seasonSP),           dir: cmp(ast/sp, season.assists/seasonSP, true) },
    { label: 'SA / Set',  game: ps(aces, sp),   season: ps(season.aces, seasonSP),              dir: cmp(aces/sp, season.aces/seasonSP, true) },
    { label: 'SE / Set',  game: ps(se, sp),     season: ps(season.serve_errors, seasonSP),      dir: cmp(se/sp, season.serve_errors/seasonSP, false) },
    { label: 'Digs / Set',game: ps(digs, sp),   season: ps(season.digs, seasonSP),              dir: cmp(digs/sp, season.digs/seasonSP, true) },
    { label: 'BS / Set',  game: ps(bs, sp),     season: ps(season.blocks, seasonSP),            dir: cmp(bs/sp, season.blocks/seasonSP, true) },
    { label: 'BA / Set',  game: ps(ba, sp),     season: ps(season.block_assists, seasonSP),     dir: cmp(ba/sp, season.block_assists/seasonSP, true) },
  ];

  return (
    <div className="pgd-body">

      {/* ── Header ── */}
      <div className="pgd-head">
        <PlayerBadge player={player} team={team} size={56} />
        <div className="pgd-head-text">
          <div className="pgd-name">{player.name}</div>
          {subInfo && <div className="pgd-sub" style={{ marginBottom: 4 }}>{subInfo}</div>}
          <div className="pgd-sub">vs {game.opponent} · {gameDate}</div>
          {scoreStr && (
            <div className="pd-game-result-line">
              <span className={`game-result-badge ${game.result === 'W' ? 'win' : 'loss'}`}>{game.result}</span>
              <span className="pd-game-score" style={{ color: game.result === 'W' ? '#3fb950' : '#f85149' }}>
                {scoreStr}
              </span>
            </div>
          )}
        </div>
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
        <div className="pgd-eff-formula">({k}K − {e}E) ÷ {ta} TA</div>
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
          <StatCell value={stats.sets_played || 0} label="SP" />
          <StatCell value={k}  label="K" />
          <StatCell value={e}  label="E"  color={e > 0 ? '#f85149' : undefined} />
          <StatCell value={ta} label="TA" />
        </div>
      </div>

      {/* ── Serve ── */}
      <div className="pgd-card pd-cat-card" style={{ borderLeftColor: '#f5c95a' }}>
        <div className="pgd-section-label" style={{ color: '#f5c95a' }}>Serve</div>
        <div className="pd-cat-grid pd-cat-2">
          <StatCell value={aces} label="SA" color="#3fb950" />
          <StatCell value={se}   label="SE" color={se > 0 ? '#f85149' : undefined} />
        </div>
      </div>

      {/* ── Reception & Defense ── */}
      <div className="pgd-card pd-cat-card" style={{ borderLeftColor: '#2dd4bf' }}>
        <div className="pgd-section-label" style={{ color: '#2dd4bf' }}>Reception & Defense</div>
        <div className="pd-cat-grid pd-cat-2">
          <StatCell value={digs}    label="Digs" />
          <StatCell value={digsPerSet} label="Per Set" muted />
        </div>
      </div>

      {/* ── Blocking ── */}
      <div className={`pgd-card pd-cat-card${totalBlocks === 0 ? ' pd-cat-card-dim' : ''}`} style={{ borderLeftColor: '#a78bfa' }}>
        <div className="pgd-section-label" style={{ color: '#a78bfa' }}>Blocking</div>
        <div className="pd-cat-grid pd-cat-3">
          <StatCell value={bs}          label="BS" />
          <StatCell value={ba}          label="BA" />
          <StatCell value={totalBlocks} label="Total" color="#a78bfa" accent />
        </div>
      </div>

      {/* ── Ball Handling ── */}
      <div className="pgd-card pd-cat-card" style={{ borderLeftColor: '#fb923c' }}>
        <div className="pgd-section-label" style={{ color: '#fb923c' }}>Ball Handling</div>
        <div className="pd-cat-grid pd-cat-2">
          <StatCell value={ast}        label="A — Assists" />
          <StatCell value={astsPerSet} label="Per Set" muted />
        </div>
      </div>

      {/* ── This Game vs Season Average ── */}
      {allMyStats.length > 0 && (
        <div className="pgd-card pd-cmp-card">
          {/* Toggle */}
          <div className="pd-cmp-top">
            <div className="pgd-section-label" style={{ marginBottom: 0 }}>
              This Game vs {leagueOnly ? 'League' : 'Season'} Average
            </div>
            <div className="avg-seg pd-scope-seg">
              <button className={`avg-seg-btn${!leagueOnly ? ' on' : ''}`} onClick={() => setLeagueOnly(false)}>All</button>
              <button className={`avg-seg-btn${leagueOnly ? ' on' : ''}`}  onClick={() => setLeagueOnly(true)}>League</button>
            </div>
          </div>
          {leagueOnly && (
            <div className="pd-cmp-league-note">
              Based on {leagueGameCount} league game{leagueGameCount !== 1 ? 's' : ''}
            </div>
          )}
          {/* Legend */}
          <div className="pd-cmp-legend">
            <span style={{ color: '#3fb950' }}>●</span> Better &nbsp;
            <span style={{ color: '#f85149' }}>●</span> Below average
          </div>
          <div className="pd-cmp-header">
            <span />
            <span className="pd-cmp-col-label">This Game</span>
            <span className="pd-cmp-col-label">Season Avg</span>
          </div>
          {comparisons.map(row => (
            <div key={row.label} className="pd-cmp-row">
              <span className="pd-cmp-label">{row.label}</span>
              <span className="pd-cmp-game" style={{ color: cmpColor(row.dir) }}>{row.game}</span>
              <span className="pd-cmp-season">{row.season}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
