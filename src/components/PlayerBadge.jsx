// Team-colored circle showing the player's jersey number.
// Replaces the old random-colored badge with initials.
export default function PlayerBadge({ player, team, size = 40 }) {
  const raw = player?.jersey_number;
  const num = raw == null ? '' : String(raw).replace(/[^0-9-]/g, '');
  const display = num || '—';
  const teamColor = team?.color || '#1a3a8f';

  // Single-digit numbers a bit larger than double-digit
  const fontSize = display.length >= 2 ? Math.round(size * 0.42) : Math.round(size * 0.5);

  return (
    <span
      className="player-badge"
      style={{
        background: teamColor,
        color: '#fff',
        width: size,
        height: size,
        fontSize,
        lineHeight: 1,
      }}
    >
      {display}
    </span>
  );
}
