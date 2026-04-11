import { useData } from '../contexts/DataContext';
import GameDetailBody from './GameDetailBody';

export default function PlayerGameDetailPlayer({ player, game, onBack }) {
  const { teams } = useData();
  const team = teams.find(t => t.id === player.team_id);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{
        background: `linear-gradient(135deg, ${team?.color || '#0d1f5c'}, ${team?.color || '#1a3a8f'})`,
        color: '#fff', padding: '16px 20px',
      }}>
        <button
          onClick={onBack}
          style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}
        >
          Back
        </button>
      </div>
      <div style={{ padding: '16px 20px', maxWidth: 600, margin: '0 auto' }}>
        <GameDetailBody player={player} game={game} team={team} />
      </div>
    </div>
  );
}
