// Player color palette
const PLAYER_COLORS = [
  { bg: '#1a3a8f', text: '#ffffff' },
  { bg: '#C0392B', text: '#ffffff' },
  { bg: '#27AE60', text: '#ffffff' },
  { bg: '#E67E22', text: '#ffffff' },
  { bg: '#8E44AD', text: '#ffffff' },
  { bg: '#2980B9', text: '#ffffff' },
  { bg: '#D4AC0D', text: '#000000' },
  { bg: '#1ABC9C', text: '#ffffff' },
  { bg: '#E74C3C', text: '#ffffff' },
  { bg: '#3498DB', text: '#ffffff' },
  { bg: '#F39C12', text: '#000000' },
  { bg: '#16A085', text: '#ffffff' },
  { bg: '#9B59B6', text: '#ffffff' },
  { bg: '#E05A2B', text: '#ffffff' },
  { bg: '#2C3E50', text: '#ffffff' },
  { bg: '#D35400', text: '#ffffff' },
];

export function pColors(index) {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}

// Generate initials from name
export function mkInit(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
