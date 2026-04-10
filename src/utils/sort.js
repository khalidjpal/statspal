// Sort upcoming games: earliest first
export function sortedUpcoming(games) {
  return [...games].sort((a, b) => new Date(a.game_date) - new Date(b.game_date));
}

// Sort completed games: newest game date first; ties broken by most-recently
// created (so a game added after another on the same date floats to the top).
//
// game_date is stored as a Postgres date / YYYY-MM-DD ISO string, which sorts
// identically lexicographically and chronologically — so we string-compare
// instead of round-tripping through Date(), which silently produces NaN for
// any unexpected format and would corrupt the order.
export function sortedCompleted(games) {
  return [...games].sort((a, b) => {
    const sa = String(a.game_date || '');
    const sb = String(b.game_date || '');
    if (sa !== sb) return sa < sb ? 1 : -1; // descending: bigger ISO string first
    const ca = new Date(a.created_at || 0).getTime() || 0;
    const cb = new Date(b.created_at || 0).getTime() || 0;
    return cb - ca;
  });
}

// Get next upcoming game
export function nextGame(games) {
  const upcoming = sortedUpcoming(games);
  return upcoming.length > 0 ? upcoming[0] : null;
}

// Parse a jersey number from any shape: number, "12", "#12", null
function jerseyNum(p) {
  if (p == null) return Infinity;
  const raw = p.jersey_number;
  if (raw == null || raw === '') return Infinity;
  const n = parseInt(String(raw).replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(n) ? n : Infinity;
}

// Last name fallback for tiebreaker
function lastName(p) {
  const name = (p?.name || '').trim();
  const parts = name.split(/\s+/);
  return (parts[parts.length - 1] || '').toLowerCase();
}

// Sort players by jersey number ascending, then last name. Returns a new array.
export function sortByJersey(players) {
  return [...(players || [])].sort((a, b) => {
    const ja = jerseyNum(a);
    const jb = jerseyNum(b);
    if (ja !== jb) return ja - jb;
    return lastName(a).localeCompare(lastName(b));
  });
}
