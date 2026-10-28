// Stand-in for src/supabase.js, used only by the RotationPal layout harness.
// Every query resolves locally: the playground session read returns a fixed
// session with six players on court, everything else returns empty/ok.
import { SESSION_ROW } from './fixtures';

function query(table) {
  const state = { table, op: 'select', single: false };
  const q = {
    select() { return q; },
    eq() { return q; },
    order() { return q; },
    limit() { return q; },
    update() { state.op = 'update'; return q; },
    upsert() { state.op = 'upsert'; return q; },
    insert() { state.op = 'insert'; return q; },
    delete() { state.op = 'delete'; return q; },
    single() { state.single = true; return q; },
    maybeSingle() { state.single = true; return q; },
    then(resolve, reject) {
      let data = state.single ? null : [];
      if (state.table === 'playground_sessions' && state.op === 'select') {
        data = state.single ? SESSION_ROW : [SESSION_ROW];
      } else if (state.op !== 'select') {
        data = state.single ? {} : [];
      }
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    },
  };
  return q;
}

export const supabase = {
  from: query,
  channel() { return { on() { return this; }, subscribe() { return this; } }; },
  removeChannel() {},
  auth: { getSession: async () => ({ data: { session: null } }) },
};
