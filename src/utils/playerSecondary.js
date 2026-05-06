// Secondary position overrides for players, keyed by team.
// Stored separately from the StatsPal `players.position` (primary) field so we
// don't need a Supabase schema change. Saves: { [playerId]: 'OH' | ... }
//
// Edited inside RotationPal's RosterView; read by the dashboard's roster widget.

const KEY = (teamId) => `vp-player-role2:${teamId}`;

export const ROLE2_OPTIONS = [
  { code: '',   label: '—' },
  { code: 'S',  label: 'Setter' },
  { code: 'OH', label: 'Outside Hitter' },
  { code: 'MB', label: 'Middle Blocker' },
  { code: 'RS', label: 'Right Side' },
  { code: 'L',  label: 'Libero' },
  { code: 'DS', label: 'Defensive Specialist' },
];

export function readSecondaryMap(teamId) {
  if (teamId == null) return {};
  try {
    const raw = localStorage.getItem(KEY(teamId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writeSecondaryMap(teamId, map) {
  try {
    localStorage.setItem(KEY(teamId), JSON.stringify(map || {}));
  } catch { /* localStorage unavailable — secondary positions just won't persist */ }
}

export function setSecondary(teamId, playerId, code) {
  const map = readSecondaryMap(teamId);
  if (!code) {
    delete map[playerId];
  } else {
    map[playerId] = code;
  }
  writeSecondaryMap(teamId, map);
  return map;
}
