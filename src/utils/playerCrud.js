import { supabase } from '../supabase';
import { readSecondaryMap, writeSecondaryMap } from './playerSecondary';

// Removing a player, in the order the rest of the app already does it.
//
// This is the same sequence TeamDetails.deletePlayer and God Mode's
// deletePlayer run, plus the secondary-position cleanup PlayerManagementModal
// does — collected in one place so the dashboard's edit mode doesn't become a
// fourth, subtly different copy.
//
// Order matters and is NOT left to the database: `players` predates this app's
// migrations and its foreign keys aren't all cascading, so a bare delete can
// fail on a constraint or strand stats behind a player who no longer exists.
//
//   1. accounts.player_id → null   (a person's login outlives their roster row)
//   2. player_game_stats           (no cascade from players)
//   3. the players row
//   4. the localStorage secondary-position entry
export async function deletePlayerCompletely({ player, teamId }) {
  const id = player?.id;
  if (!id) return { error: new Error('No player given') };

  const detach = await supabase.from('accounts').update({ player_id: null }).eq('player_id', id);
  if (detach.error) return { error: detach.error };

  const stats = await supabase.from('player_game_stats').delete().eq('player_id', id);
  if (stats.error) return { error: stats.error };

  const del = await supabase.from('players').delete().eq('id', id);
  if (del.error) return { error: del.error };

  // localStorage, so it can't fail the operation — but a stale entry would show
  // up as a phantom secondary position if the jersey number is ever reused.
  if (teamId != null) {
    try {
      const map = readSecondaryMap(teamId);
      if (map[id]) {
        delete map[id];
        writeSecondaryMap(teamId, map);
      }
    } catch { /* localStorage unavailable — nothing to clean up */ }
  }

  return { error: null };
}
