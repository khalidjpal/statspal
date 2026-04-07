// Sort upcoming games: earliest first
export function sortedUpcoming(games) {
  return [...games].sort((a, b) => new Date(a.game_date) - new Date(b.game_date));
}

// Sort completed games: most recent first
export function sortedCompleted(games) {
  return [...games].sort((a, b) => new Date(b.game_date) - new Date(a.game_date));
}

// Get next upcoming game
export function nextGame(games) {
  const upcoming = sortedUpcoming(games);
  return upcoming.length > 0 ? upcoming[0] : null;
}
