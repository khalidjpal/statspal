import { useMemo, useState } from 'react';
import { sortByJersey } from '../../utils/sort';
import { readSecondaryMap } from '../../utils/playerSecondary';
import { IconUsers } from '../Icons';
import { DeleteBadge, EditHint, AddInline } from './EditModeKit';

// Position groups surfaced on the dashboard. classify() handles both the full
// names stored in StatsPal ("Outside Hitter") and the short codes used by
// secondary-position storage ("OH"), without using bare-letter substring
// matches — those caused "Outside Hitter" to bucket as Setter because the word
// "outside" contains an 's'.
const GROUPS = [
  { key: 'S',  label: 'Setters',               short: 'S',  codes: ['S'],         words: ['setter'] },
  { key: 'OH', label: 'Outside Hitters',       short: 'OH', codes: ['OH'],        words: ['outside hitter', 'outside'] },
  { key: 'MB', label: 'Middle Blockers',       short: 'MB', codes: ['MB', 'MH'],  words: ['middle blocker', 'middle hitter', 'middle'] },
  { key: 'RS', label: 'Right Side',            short: 'RS', codes: ['RS', 'OPP'], words: ['right side', 'opposite'] },
  { key: 'L',  label: 'Libero',                short: 'L',  codes: ['L', 'LIB'],  words: ['libero'] },
  { key: 'DS', label: 'Defensive Specialists', short: 'DS', codes: ['DS'],        words: ['defensive specialist', 'defensive'] },
];
const GROUP_BY_KEY = Object.fromEntries(GROUPS.map(g => [g.key, g]));

function classify(position) {
  if (position == null) return null;
  const trimmed = String(position).trim();
  if (!trimmed) return null;
  // Pass 1: exact short-code match, case-insensitive (e.g. "OH", "S", "ds")
  const upper = trimmed.toUpperCase();
  for (const g of GROUPS) {
    if (g.codes.includes(upper)) return g.key;
  }
  // Pass 2: whole-word match against full names (e.g. "Outside Hitter", "Setter")
  const lower = trimmed.toLowerCase();
  for (const g of GROUPS) {
    if (g.words.some(w => lower === w || lower.includes(w))) return g.key;
  }
  return null;
}

const VIEWS = [
  { key: 'primary',   label: 'Primary' },
  { key: 'secondary', label: 'Secondary' },
  { key: 'alpha',     label: 'A–Z' },
  { key: 'jersey',    label: 'Jersey' },
];

export default function RosterPositionWidget({
  team,
  players,
  // When true, renders an Add Player button in the header and an Edit button
  // on each row. Both delegate to the parent via the callbacks below.
  showEdit = false,
  onAddPlayer,
  onEditPlayer,
  // Bumping this counter forces the widget to re-read secondary positions from
  // localStorage — used when an external edit (e.g. PlayerManagementModal) has
  // closed and the parent wants the widget to refresh.
  refreshKey = 0,
  // Dashboard edit mode. When on, every player row wiggles, carries a remove
  // badge and becomes tap-to-edit, and the list ends in an inline add. This is
  // independent of showEdit, which is RotationPal's existing header/row buttons.
  editMode = false,
  onDeletePlayer,
}) {
  const [view, setView] = useState('primary');

  const teamPlayers = useMemo(
    () => players.filter(p => p.team_id === team.id),
    [players, team.id]
  );

  const secondaryMap = useMemo(
    () => { void refreshKey; return readSecondaryMap(team.id); },
    [team.id, refreshKey]
  );

  // Decorate every player with primary + secondary group keys
  const decorated = useMemo(() => {
    return teamPlayers.map(p => ({
      ...p,
      _primary: classify(p.position),
      _secondary: secondaryMap[p.id] || null,
    }));
  }, [teamPlayers, secondaryMap]);

  const sections = useMemo(() => {
    if (view === 'alpha') {
      const sorted = [...decorated].sort((a, b) =>
        (a.name || '').localeCompare(b.name || '')
      );
      return [{ key: 'all', label: 'All players', short: 'ALL', count: sorted.length, players: sorted }];
    }
    if (view === 'jersey') {
      return [{ key: 'all', label: 'All players · by jersey', short: '#', count: decorated.length, players: sortByJersey(decorated) }];
    }
    // primary or secondary
    const field = view === 'secondary' ? '_secondary' : '_primary';
    const buckets = {};
    for (const g of GROUPS) buckets[g.key] = [];
    const fallback = [];
    for (const p of decorated) {
      const k = p[field];
      if (k && buckets[k]) buckets[k].push(p);
      else fallback.push(p);
    }
    const out = GROUPS
      .map(g => ({
        key: g.key,
        label: g.label,
        short: g.short,
        players: sortByJersey(buckets[g.key]),
        count: buckets[g.key].length,
      }))
      .filter(s => s.count > 0);
    if (fallback.length > 0) {
      out.push({
        key: '__none',
        label: view === 'secondary' ? 'Primary Only' : 'Unassigned',
        short: '—',
        players: sortByJersey(fallback),
        count: fallback.length,
        muted: true,
      });
    }
    return out;
  }, [view, decorated]);

  return (
    <div className="dash-widget dash-widget-roster">
      <header className="dash-widget-head">
        <span className="dash-widget-title"><IconUsers size={13} /> Roster</span>
        <div className="dash-widget-head-actions">
          <span className="dash-widget-meta">{teamPlayers.length} players</span>
          {showEdit && onAddPlayer && (
            <button
              type="button"
              className="dash-widget-action"
              onClick={onAddPlayer}
            >
              + Add Player
            </button>
          )}
        </div>
      </header>

      <div className="dash-roster-toggle" role="tablist" aria-label="Roster view">
        {VIEWS.map(v => (
          <button
            key={v.key}
            type="button"
            role="tab"
            aria-selected={view === v.key}
            className={`dash-roster-toggle-btn${view === v.key ? ' active' : ''}`}
            onClick={() => setView(v.key)}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="dash-widget-body dash-roster-body">
        {teamPlayers.length === 0 ? (
          <div className="dash-empty">
            <div className="dash-empty-title">No players on roster yet</div>
            <div className="dash-empty-sub">
              {editMode
                ? 'Use "Add Player" below to build your roster.'
                : showEdit
                  ? 'Click "+ Add Player" above to build your roster.'
                  : 'Add players from Team Details to see them here.'}
            </div>
          </div>
        ) : (
          sections.map(s => (
            <RosterSection
              key={s.key}
              section={s}
              secondaryMap={secondaryMap}
              showEdit={showEdit}
              onEditPlayer={onEditPlayer}
              editMode={editMode}
              onDeletePlayer={onDeletePlayer}
            />
          ))
        )}

        {editMode && onAddPlayer && (
          <AddInline onClick={onAddPlayer} label="ADD PLAYER" />
        )}
      </div>
    </div>
  );
}

function RosterSection({ section, secondaryMap, showEdit, onEditPlayer, editMode, onDeletePlayer }) {
  return (
    <div className={`dash-roster-group${section.muted ? ' dash-roster-group-muted' : ''}`}>
      <div className="dash-roster-grp-head">
        <span className="dash-roster-grp-label">{section.label}</span>
        <span className="dash-roster-grp-count">{section.count}</span>
      </div>
      <ul className="dash-roster-grp-list">
        {section.players.map(p => {
          const primary = p._primary ? GROUP_BY_KEY[p._primary]?.short : null;
          const secondary = p._secondary || secondaryMap[p.id];
          const roleText = [primary, secondary].filter(Boolean).join(' / ');
          return (
            <li
              key={p.id}
              className={[
                'dash-roster-grp-item',
                showEdit ? 'dash-roster-grp-item-edit' : '',
                editMode ? 'dash-edit-item' : '',
                editMode && onEditPlayer ? 'dash-edit-item-tap' : '',
              ].filter(Boolean).join(' ')}
              onClick={editMode && onEditPlayer ? () => onEditPlayer(p) : undefined}
              title={editMode && onEditPlayer ? `Edit ${p.name}` : undefined}
            >
              {editMode && onDeletePlayer && (
                <DeleteBadge
                  onDelete={() => onDeletePlayer(p)}
                  label={`Remove ${p.name} from the roster`}
                />
              )}
              <span className="dash-roster-jersey">
                {p.jersey_number ? `#${p.jersey_number}` : '—'}
              </span>
              <span className="dash-roster-name" title={p.name}>{p.name}</span>
              <span className="dash-roster-role-text" title={roleText || 'No position'}>
                {roleText || '—'}
              </span>
              {/* In edit mode the whole row is the tap target, so the standing
                  Edit button would be a second, redundant one. */}
              {showEdit && onEditPlayer && !editMode && (
                <button
                  type="button"
                  className="dash-roster-edit-btn"
                  onClick={() => onEditPlayer(p)}
                  aria-label={`Edit ${p.name}`}
                >
                  Edit
                </button>
              )}
              {editMode && onEditPlayer && <EditHint />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
