import { useState } from 'react';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import { supabase } from '../supabase';
import Modal from './Modal';
import TournamentDetail from './TournamentDetail';
import EditTournamentGameModal from './modals/EditTournamentGameModal';
import TournamentStatsModal from './modals/TournamentStatsModal';
import GameplanBuilderModal from './modals/GameplanBuilderModal';
import { tournamentRoster } from '../utils/tournaments';
import { sortByJersey } from '../utils/sort';

// Everything that hangs off an open tournament — the detail view plus its edit,
// stats, gameplan and delete modals — in one mountable unit.
//
// Both entry points (the StatsPal schedule card and the main dashboard's
// calendar / schedule widget) render this, so the tournament behaves
// identically wherever it was opened from.
export default function TournamentHost({
  tournament,
  team,
  isAdmin,
  onClose,
  onStartLive,    // schedule row → StatsPal PreGame; provided by whoever can navigate
  onSelectGame,   // completed game → box score
  refresh,
}) {
  const { players } = useData();
  const { addToast } = useToast();
  const [editGame, setEditGame] = useState(null);
  const [showStats, setShowStats] = useState(false);
  const [planGame, setPlanGame] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!tournament) return null;

  // The tournament view is a `.pop-overlay` (z-index 9999); every modal it opens
  // is a `.modal-overlay` (z-index 1000), so a child would otherwise mount
  // *behind* an opaque backdrop and read as a dead button. Step the tournament
  // view aside while a child is up, and it comes back when the child closes.
  const childOpen = showStats || !!editGame || !!planGame || confirmDelete;

  // RotationPal gets the tournament's shared roster, not the whole team, so a
  // gameplan for a tournament game only offers the players who are on the trip.
  const planPlayers = tournamentRoster(
    tournament,
    sortByJersey((players || []).filter(p => p.team_id === team.id))
  );

  async function handleDeleteTournament() {
    if (deleting) return;
    setDeleting(true);
    const { error } = await supabase.from('tournaments').delete().eq('id', tournament.id);
    setDeleting(false);
    if (error) {
      addToast('Could not delete tournament: ' + error.message);
      return;
    }
    setConfirmDelete(false);
    addToast('Tournament deleted. Its games are now standalone games.', 'success');
    onClose();
    refresh();
  }

  return (
    <>
      {/* 820 gives the roster rail + games columns room without the games
          list stretching to an uncomfortable line length. */}
      <Modal open={!childOpen} onClose={onClose} maxWidth={820}>
        <TournamentDetail
          tournament={tournament}
          team={team}
          isAdmin={isAdmin}
          onStartLive={g => { onClose(); onStartLive && onStartLive(g); }}
          onGameplan={g => setPlanGame(g)}
          onSelectGame={g => { onClose(); onSelectGame && onSelectGame(g); }}
          onEditGame={g => setEditGame(g)}
          onOpenStats={() => setShowStats(true)}
          onDeleteTournament={isAdmin ? () => setConfirmDelete(true) : null}
          refresh={refresh}
        />
      </Modal>

      {editGame && (
        <EditTournamentGameModal
          game={editGame}
          tournament={tournament}
          onClose={() => setEditGame(null)}
          onSaved={() => { setEditGame(null); refresh(); }}
        />
      )}

      {showStats && (
        <TournamentStatsModal
          tournament={tournament}
          team={team}
          onClose={() => setShowStats(false)}
          onSelectGame={g => { setShowStats(false); onClose(); onSelectGame && onSelectGame(g); }}
        />
      )}

      {planGame && (
        <GameplanBuilderModal
          team={team}
          game={planGame}
          players={planPlayers}
          onClose={() => setPlanGame(null)}
        />
      )}

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => !deleting && setConfirmDelete(false)}>
          <div className="modal-content" style={{ textAlign: 'center', maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <h2>Delete “{tournament.name}”?</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>
              The tournament grouping is removed. Its games and all their stats are kept —
              they become standalone games on the schedule.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={handleDeleteTournament}
                disabled={deleting}
                style={{ background: '#f85149', color: '#fff', padding: '12px 16px', borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none', cursor: deleting ? 'default' : 'pointer', opacity: deleting ? 0.6 : 1 }}
              >
                {deleting ? 'Deleting…' : 'Delete tournament'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                style={{ background: 'transparent', color: 'var(--text-secondary)', padding: '12px 16px', borderRadius: 10, fontSize: 14, fontWeight: 600, border: '1px solid var(--border)', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
