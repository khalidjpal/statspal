import { supabase } from '../supabase';
import { PASS_FIELDS, SERVE_FIELDS } from './stats';

// Insert player_game_stats rows.
//
// Two sets of columns arrived after the original table: the graded-passing ones
// (pass_3 … pass_0) with scripts/passing_stats_migration.sql, and
// serve_attempts with scripts/statspal_serve_attempts_migration.sql. If a
// migration has not been run on this Supabase project yet, PostgREST rejects
// the WHOLE insert over the unknown column — which would silently lose every
// stat for the match. So on that specific failure we drop the columns the error
// names and retry, the same shape of fallback handleEndMatch already uses for
// completed_games.
//
// Retrying is a loop rather than a single pass because a project can be behind
// on both migrations, and the first error only ever names the first column
// PostgREST tripped over.
const LATE_COLUMNS = [
  { fields: PASS_FIELDS, script: 'scripts/passing_stats_migration.sql' },
  { fields: SERVE_FIELDS, script: 'scripts/statspal_serve_attempts_migration.sql' },
];

export async function insertPlayerStats(rows) {
  let payload = rows;
  const dropped = new Set();

  for (let attempt = 0; attempt <= LATE_COLUMNS.length; attempt++) {
    const res = await supabase.from('player_game_stats').insert(payload);
    if (!res.error) return res;

    const msg = res.error.message || '';
    const missing = LATE_COLUMNS.find(
      c => !dropped.has(c.script) && c.fields.some(f => msg.includes(f)));
    if (!missing) return res;

    dropped.add(missing.script);
    console.warn('[statsSave] columns missing — retrying without them. Run ' + missing.script);
    payload = payload.map(r => {
      const copy = { ...r };
      missing.fields.forEach(f => delete copy[f]);
      return copy;
    });
  }
  return supabase.from('player_game_stats').insert(payload);
}
