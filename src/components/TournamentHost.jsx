import { useState } from 'react';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import { supabase } from '../supabase';
import Modal from './Modal';
import TournamentDetail from './TournamentDetail';
import EditTournamentGameModal from './modals/EditTournamentGameModal';
import TournamentStatsModal from './modals/TournamentStatsModal';
import GameplanBuilderModal from './modals/GameplanBuilderModal';
import { tournamentRoster, isTBD } from '../utils/tournaments';
import { resetGame } from '../utils/resetGame';
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
  // The completed game whose stats are pending a wipe.
  const [resetTarget, setResetTarget] = useState(null);
  const [resetting, setResetting] = useState(false);

  if (!tournament) return null;

  // The tournament view is a `.pop-overlay` (z-index 9999); every modal it opens
  // is a `.modal-overlay` (z-index 1000), so a child would otherwise mount
  // *behind* an opaque backdrop and read as a dead button. Step the tournament
  // view aside while a child is up, and it comes back when the child closes.
  const childOpen = showStats || !!editGame || !!planGame || confirmDelete || !!resetTarget;

  // RotationPal gets the tournament's shared roster, not the whole team, so a
  // gameplan for a tournament game only offers the players who are on the trip.
  const planPlayers = tournamentRoster(
    tournament,
    sortByJersey((players || []).filter(p => p.team_id === team.id))
  );

  // Wipe one game's stats and put it back to untracked, WITHOUT deleting it.
  //
  // resetGame() is the same routine the standalone schedule and the game
  // summary already use: it deletes this game's player_game_stats rows, drops
  // the completed_games row, and re-inserts the game into `schedule` carrying
  // its opponent, date, time, court, tournament and game number. So the game
  // keeps its identity and its slot in the tournament, loses its score and
  // result, and gets its StatsPal button back for a fresh track.
  //
  // Scoped by game.id throughout — no other game's stats are touched.
  async function handleResetStats() {
    if (!resetTarget || resetting) return;
    setResetting(true);
    const { error } = await resetGame({ game: resetTarget, teamId: team.id });
    setResetting(false);
    if (error) {
      addToast('Could not reset stats: ' + error.message);
      return;
    }
    const label = resetTarget.tournament_game_no ? `Game ${resetTarget.tournament_game_no}` : 'Game';
    setResetTarget(null);
    addToast(`${label} stats cleared. You can track it again from StatsPal.`, 'success');
    // Refetches schedule, completed_games AND player_game_stats, so the card,
    // the box score and the tournament roll-up all recompute together.
    refresh();
  }

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
      {/* Near-full-screen. maxWidth has to come through this prop: Modal applies
          it as an INLINE style, which outranks any stylesheet rule, so a
          max-width in .pop-card-xl would be dead on arrival. A viewport unit
          rather than a pixel cap is the whole point — the tournament view is
          the app's densest surface (roster rail + games list + stats header)
          and wants the screen. pop-card-xl supplies the matching height. */}
      <Modal open={!childOpen} onClose={onClose} maxWidth="95vw" className="pop-card-xl">
        <TournamentDetail
          tournament={tournament}
          team={team}
          isAdmin={isAdmin}
          onStartLive={g => { onClose(); onStartLive && onStartLive(g); }}
          onGameplan={g => setPlanGame(g)}
          onSelectGame={g => { onClose(); onSelectGame && onSelectGame(g); }}
          onEditGame={g => setEditGame(g)}
          onResetStats={isAdmin ? (g => setResetTarget(g)) : null}
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

      {/* Reset-stats confirm. A `.modal-overlay` like the delete confirm below,
          and resetTarget is in `childOpen`, so the tournament view steps aside
          and this lands on top rather than behind it. */}
      {resetTarget && (
        <div className="modal-overlay" onClick={() => !resetting && setResetTarget(null)}>
          <div className="modal-content" style={{ textAlign: 'center', maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <h2>
              Reset all stats for{' '}
              {resetTarget.tournament_game_no ? `Game ${resetTarget.tournament_game_no}` : 'this game'}
              {!isTBD(resetTarget.opponent) && ` vs ${resetTarget.opponent}`}?
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>
              This clears every recorded stat for this game and cannot be undone.
              The game itself is kept — opponent, date, time, court and game number
              stay exactly as they are, and it goes back to untracked so you can
              run it through StatsPal again. No other game is affected.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={handleResetStats}
                disabled={resetting}
                style={{ background: '#f0a500', color: '#231a02', padding: '12px 16px', borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none', cursor: resetting ? 'default' : 'pointer', opacity: resetting ? 0.6 : 1 }}
              >
                {resetting ? 'Resetting…' : 'Reset stats'}
              </button>
              <button
                onClick={() => setResetTarget(null)}
                disabled={resetting}
                style={{ background: 'transparent', color: 'var(--text-secondary)', padding: '12px 16px', borderRadius: 10, fontSize: 14, fontWeight: 600, border: '1px solid var(--border)', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
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
