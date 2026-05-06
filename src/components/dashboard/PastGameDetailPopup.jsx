import { useMemo, useState } from 'react';
import { useData } from '../../contexts/DataContext';
import { hfmt } from '../../utils/stats';
import { getTeam, getMatchAttachments, matchKey } from '../../modules/rotationpal/teams';
import { findFormation } from '../../modules/rotationpal/formations';

const SLOTS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];

const STAT_COLS = [
  { field: 'kills',     label: 'K',    test: r => (r.kills || 0) > 0 },
  { field: 'errors',    label: 'E',    test: r => (r.errors || 0) > 0 },
  { field: 'attempts',  label: 'Att',  test: r => (r.attempts || 0) > 0 },
  // pct is derived; show whenever any row has attempts
  { field: 'pct',       label: 'Pct',  test: r => (r.attempts || 0) > 0,
    render: r => hfmt(r.kills || 0, r.errors || 0, r.attempts || 0) },
  { field: 'assists',   label: 'A',    test: r => (r.assists || 0) > 0 },
  { field: 'digs',      label: 'D',    test: r => (r.digs || 0) > 0 },
  { field: 'aces',      label: 'Aces', test: r => (r.aces || 0) > 0 },
  { field: 'blocks',    label: 'Blk',  test: r => (r.blocks || 0) > 0 },
];

function formatLongDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

export default function PastGameDetailPopup({
  event,
  team,
  onClose,
  onOpenStatsPal,
  onOpenRotationPal,
}) {
  const { completedGames, players, playerGameStats } = useData();
  const [tab, setTab] = useState('summary');

  // Find the underlying completed_games row for this calendar event.
  // Calendar events from completed games use id `done-${g.id}`.
  const game = useMemo(() => {
    const idStr = String(event?.id || '');
    if (idStr.startsWith('done-')) {
      const gid = idStr.slice(5);
      return completedGames.find(g => String(g.id) === gid) || null;
    }
    // Fallback: match by opponent + date
    return completedGames.find(g =>
      g.team_id === team.id &&
      g.opponent === event.opponent &&
      g.game_date === event.date
    ) || null;
  }, [event, completedGames, team.id]);

  const teamPlayers = useMemo(
    () => players.filter(p => p.team_id === team.id),
    [players, team.id]
  );
  const playerById = useMemo(() => {
    const m = {};
    for (const p of teamPlayers) m[p.id] = p;
    return m;
  }, [teamPlayers]);

  const stats = useMemo(() => {
    if (!game) return [];
    const rows = playerGameStats.filter(s => s.game_id === game.id);
    return rows
      .map(s => ({ ...s, player: playerById[s.player_id] }))
      .filter(r => r.player)
      .sort((a, b) => {
        // Sort by jersey number ascending
        const ja = parseInt(a.player.jersey_number) || 9999;
        const jb = parseInt(b.player.jersey_number) || 9999;
        return ja - jb;
      });
  }, [game, playerGameStats, playerById]);

  // Determine which stat columns to show — only those with non-zero data
  const visibleCols = useMemo(() => {
    return STAT_COLS.filter(col => stats.some(col.test));
  }, [stats]);

  // Pull RotationPal local state for this team to find a saved gameplan
  const gameplanData = useMemo(() => {
    if (!game) return null;
    const t = getTeam(team.id);
    if (!t) return null;
    const key = matchKey(game.opponent, game.game_date);
    const att = (getMatchAttachments(team.id) || {})[key] || {};
    const gameplan = att.gameplanId
      ? (t.gameplans || []).find(g => g.id === att.gameplanId)
      : null;
    const formation = att.formationId
      ? findFormation(att.formationId, t.customFormations || [])
      : null;
    // Live game (substitution data) — match by scheduleId fallback opponent+date
    const liveGame = (t.games || []).find(g =>
      g.opponent === game.opponent && g.date === game.game_date
    ) || null;

    const lineup = att.lineup || gameplan?.baseLineup || liveGame?.baseLineup || null;
    const subPairs = liveGame?.subPairs || {};

    const hasContent = !!(
      lineup ||
      gameplan ||
      formation ||
      (att.notes && att.notes.length > 0) ||
      (Object.keys(subPairs).length > 0)
    );
    if (!hasContent) return null;

    return {
      lineup,
      gameplan,
      formation,
      notes: att.notes || gameplan?.notes || null,
      subPairs,
    };
  }, [game, team.id]);

  if (!game) {
    // Fallback if we couldn't resolve the underlying completed game record
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content past-game-popup" onClick={e => e.stopPropagation()}>
          <button className="past-game-close" onClick={onClose} aria-label="Close">×</button>
          <h2>Game not found</h2>
          <p style={{ color: 'var(--text-secondary)' }}>
            This game's record could not be loaded.
          </p>
          <div className="modal-actions">
            <button className="modal-btn-primary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content past-game-popup" onClick={e => e.stopPropagation()}>
        <button className="past-game-close" onClick={onClose} aria-label="Close">×</button>

        <div className="past-game-head">
          <div className="past-game-head-top">
            <h2 className="past-game-title">vs {game.opponent}</h2>
            <ResultBadge result={game.result} />
          </div>
          <div className="past-game-head-meta">
            <span>{formatLongDate(game.game_date)}</span>
            {game.location && <span>· {game.location}</span>}
            {game.is_league && <span className="past-game-league">League</span>}
          </div>
        </div>

        <nav className="past-game-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'summary'}
            className={`past-game-tab${tab === 'summary' ? ' active' : ''}`}
            onClick={() => setTab('summary')}
          >Summary</button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'stats'}
            className={`past-game-tab${tab === 'stats' ? ' active' : ''}`}
            onClick={() => setTab('stats')}
          >Player Stats</button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'gameplan'}
            className={`past-game-tab${tab === 'gameplan' ? ' active' : ''}`}
            onClick={() => setTab('gameplan')}
          >Rotation Gameplan</button>
        </nav>

        <div className="past-game-body">
          {tab === 'summary' && <SummaryTab game={game} />}
          {tab === 'stats' && (
            <StatsTab
              stats={stats}
              cols={visibleCols}
              onOpenStatsPal={onOpenStatsPal}
            />
          )}
          {tab === 'gameplan' && (
            <GameplanTab
              data={gameplanData}
              playerById={playerById}
              onOpenRotationPal={onOpenRotationPal}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ResultBadge({ result }) {
  if (!result) return <span className="past-game-result past-game-result-none">No Result</span>;
  return (
    <span className={`past-game-result past-game-result-${result === 'W' ? 'w' : 'l'}`}>
      {result === 'W' ? 'Win' : 'Loss'}
    </span>
  );
}

function SummaryTab({ game }) {
  return (
    <div className="past-game-summary">
      <div className="past-game-score">
        <div className="past-game-score-cell">
          <span className="past-game-score-label">FOR</span>
          <span className="past-game-score-num">{game.home_sets ?? '—'}</span>
        </div>
        <span className="past-game-score-vs">SETS</span>
        <div className="past-game-score-cell">
          <span className="past-game-score-label">AGAINST</span>
          <span className="past-game-score-num">{game.away_sets ?? '—'}</span>
        </div>
      </div>

      <div className="past-game-meta-grid">
        <div className="past-game-meta-row">
          <span className="past-game-meta-lbl">Opponent</span>
          <span className="past-game-meta-val">{game.opponent}</span>
        </div>
        <div className="past-game-meta-row">
          <span className="past-game-meta-lbl">Date</span>
          <span className="past-game-meta-val">{formatLongDate(game.game_date)}</span>
        </div>
        {game.location && (
          <div className="past-game-meta-row">
            <span className="past-game-meta-lbl">Location</span>
            <span className="past-game-meta-val">{game.location}</span>
          </div>
        )}
      </div>

      {Array.isArray(game.set_scores) && game.set_scores.length > 0 && (
        <div className="past-game-sets">
          <div className="past-game-sets-title">Set Scores</div>
          <div className="past-game-sets-grid">
            {game.set_scores.map((s, i) => {
              const home = s.home ?? s.us ?? '—';
              const away = s.away ?? s.them ?? '—';
              const won = (Number(home) || 0) > (Number(away) || 0);
              return (
                <div
                  key={i}
                  className={`past-game-set-card${won ? ' past-game-set-won' : ' past-game-set-lost'}`}
                >
                  <span className="past-game-set-num">SET {i + 1}</span>
                  <span className="past-game-set-score">{home}–{away}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatsTab({ stats, cols, onOpenStatsPal }) {
  if (stats.length === 0) {
    return (
      <div className="past-game-empty">
        <p>No stats recorded for this game</p>
        {onOpenStatsPal && (
          <button className="modal-btn-primary" onClick={onOpenStatsPal}>
            Open StatsPal
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="past-game-stats-wrap">
      <table className="past-game-stats-tbl">
        <thead>
          <tr>
            <th className="past-game-col-name">Player</th>
            <th className="past-game-col-pos">Pos</th>
            {cols.map(c => <th key={c.field}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {stats.map(s => (
            <tr key={s.id}>
              <td className="past-game-col-name">
                {s.player.jersey_number != null
                  ? <span className="past-game-jersey">#{s.player.jersey_number}</span>
                  : null}
                <span>{s.player.name}</span>
              </td>
              <td className="past-game-col-pos">{s.player.position || '—'}</td>
              {cols.map(c => (
                <td key={c.field}>
                  {c.render ? c.render(s) : (s[c.field] || 0)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GameplanTab({ data, playerById, onOpenRotationPal }) {
  if (!data || (!data.lineup && !data.gameplan && !data.formation && Object.keys(data.subPairs || {}).length === 0)) {
    return (
      <div className="past-game-empty">
        <p>No rotation gameplan recorded</p>
        {onOpenRotationPal && (
          <button className="modal-btn-primary" onClick={onOpenRotationPal}>
            Open RotationPal
          </button>
        )}
      </div>
    );
  }

  const lineupRows = SLOTS.map(slot => {
    const playerId = data.lineup?.[slot];
    const player = playerId ? playerById[playerId] : null;
    return { slot, player };
  });

  const subEntries = Object.entries(data.subPairs || {})
    .map(([starterId, info]) => ({
      starter: playerById[starterId],
      sub: info?.subId ? playerById[info.subId] : null,
    }))
    .filter(p => p.starter && p.sub);

  return (
    <div className="past-game-gameplan">
      {(data.gameplan || data.formation) && (
        <div className="past-game-gp-meta">
          {data.gameplan && (
            <div className="past-game-gp-meta-row">
              <span className="past-game-meta-lbl">Gameplan</span>
              <span className="past-game-meta-val">{data.gameplan.name || 'Unnamed'}</span>
            </div>
          )}
          {data.formation && (
            <div className="past-game-gp-meta-row">
              <span className="past-game-meta-lbl">Formation</span>
              <span className="past-game-meta-val">{data.formation.name || data.formation.id}</span>
            </div>
          )}
        </div>
      )}

      <div className="past-game-gp-section">
        <div className="past-game-gp-section-title">Starting Lineup</div>
        {lineupRows.every(r => !r.player) ? (
          <div className="past-game-empty-line">No lineup saved</div>
        ) : (
          <div className="past-game-lineup-grid">
            {lineupRows.map(({ slot, player }) => (
              <div key={slot} className="past-game-lineup-cell">
                <span className="past-game-lineup-slot">{slot}</span>
                {player ? (
                  <>
                    <span className="past-game-lineup-jersey">
                      {player.jersey_number ? `#${player.jersey_number}` : ''}
                    </span>
                    <span className="past-game-lineup-name">{player.name}</span>
                    <span className="past-game-lineup-pos">{player.position || '—'}</span>
                  </>
                ) : (
                  <span className="past-game-lineup-empty">—</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="past-game-gp-section">
        <div className="past-game-gp-section-title">Substitution Pairings</div>
        {subEntries.length === 0 ? (
          <div className="past-game-empty-line">No subs recorded</div>
        ) : (
          <ul className="past-game-subs-list">
            {subEntries.map((p, i) => (
              <li key={i} className="past-game-sub-row">
                <span className="past-game-sub-side">
                  {p.starter.jersey_number ? `#${p.starter.jersey_number} ` : ''}{p.starter.name}
                </span>
                <span className="past-game-sub-arrow">↔</span>
                <span className="past-game-sub-side">
                  {p.sub.jersey_number ? `#${p.sub.jersey_number} ` : ''}{p.sub.name}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {data.notes && (
        <div className="past-game-gp-section">
          <div className="past-game-gp-section-title">Notes</div>
          <div className="past-game-gp-notes">{data.notes}</div>
        </div>
      )}
    </div>
  );
}
