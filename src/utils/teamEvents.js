// Calendar events (practices + other events) persisted to localStorage per team.
// Games come from Supabase `schedule` and `completed_games` and aren't stored here.

const KEY = (teamId) => `vp-events:${teamId}`;

export function readEvents(teamId) {
  if (teamId == null) return [];
  try {
    const raw = localStorage.getItem(KEY(teamId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeEvents(teamId, events) {
  try {
    localStorage.setItem(KEY(teamId), JSON.stringify(events));
  } catch { /* localStorage unavailable — events just won't persist */ }
}

export function addEvent(teamId, event) {
  const id = event.id || `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const next = [...readEvents(teamId), { ...event, id }];
  writeEvents(teamId, next);
  return next;
}

export function removeEvent(teamId, eventId) {
  const next = readEvents(teamId).filter(e => e.id !== eventId);
  writeEvents(teamId, next);
  return next;
}
