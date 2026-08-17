import { supabase } from '../supabase';
import { PASS_FIELDS } from './stats';

// Insert player_game_stats rows.
//
// The graded-passing columns (pass_3 … pass_0) arrived with
// scripts/passing_stats_migration.sql. If that migration has not been run on
// this Supabase project yet, PostgREST rejects the whole insert because of the
// unknown columns — which would silently lose every stat for the game. So on
// that specific failure we retry once without the passing columns, the same
// shape of fallback handleEndMatch already uses for completed_games.
export async function insertPlayerStats(rows) {
  const res = await supabase.from('player_game_stats').insert(rows);
  if (!res.error) return res;

  const msg = res.error.message || '';
  if (!PASS_FIELDS.some(f => msg.includes(f))) return res;

  console.warn('[statsSave] passing-grade columns missing — retrying without them. Run scripts/passing_stats_migration.sql');
  const stripped = rows.map(r => {
    const copy = { ...r };
    PASS_FIELDS.forEach(f => delete copy[f]);
    return copy;
  });
  return supabase.from('player_game_stats').insert(stripped);
}
