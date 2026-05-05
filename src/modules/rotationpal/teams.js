// RotationPal team/game storage — localStorage-only. RotationPal-specific data
// (games with rotation state, custom formations, drag positions, etc.) lives in
// localStorage under these keys. Team IDs are StatsPal team UUIDs, so the two
// modules stay aligned on which team is which.
//
// Roster is NOT stored here — it's sourced live from StatsPal's `players` table
// via mapStatsPalRoster() in App bindings.

const TEAMS_KEY = 'rotationpal-teams-v2';

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

function loadAll() {
  try {
    const raw = localStorage.getItem(TEAMS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveAll(list) {
  localStorage.setItem(TEAMS_KEY, JSON.stringify(list));
}

export function listTeamsRaw() {
  return loadAll();
}

export function ensureTeamRecord(statsPalTeam, ownerUsername) {
  const all = loadAll();
  let t = all.find(x => x.id === statsPalTeam.id);
  if (!t) {
    t = {
      id: statsPalTeam.id,
      owner: ownerUsername || null,
      name: statsPalTeam.name,
      roster: [],
      games: [],
      customFormations: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    all.push(t);
    saveAll(all);
  } else if (t.name !== statsPalTeam.name) {
    t.name = statsPalTeam.name;
    t.updatedAt = Date.now();
    saveAll(all);
  }
  return t;
}

export function getTeam(id) {
  return loadAll().find(t => t.id === id) || null;
}

export function updateTeam(id, patch) {
  const all = loadAll();
  const idx = all.findIndex(t => t.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...patch, id, updatedAt: Date.now() };
  saveAll(all);
  return all[idx];
}

export function setRoster(teamId, roster) {
  return updateTeam(teamId, { roster });
}

// ===== Games =====

function emptyGameState() {
  return {
    startingRotation: 1,
    startServing: true,
    baseLineup: { P1: null, P2: null, P3: null, P4: null, P5: null, P6: null },
    currentRotation: 1,
    ourScore: 0,
    oppScore: 0,
    serving: true,
    setNum: 1,
    finishedSets: [],
    subs: [],
    liveLineup: null,       // kept for backward compat, ignored in new code
    activeSubs: {},         // persistent subs across rotations { [starterId]: subId }
    subPairs: {},           // pair tracking { [starterId]: { subId, state: 'active'|'done' } }
    backRowSubs: {},        // front-row starters → back-row replacement { [starterId]: subId }
    frontRowSubs: {},       // back-row starters → front-row replacement { [starterId]: subId }
    liberoCovers: [],       // player IDs the libero is attached to (replaces MB role auto-detect)
    subLimit: 12,           // subs per set
    formations: null,       // per-rotation { serve, receive } position maps; null = use defaults
  };
}

export function createGame(teamId, { opponent, date, format, scheduleId }) {
  const team = getTeam(teamId);
  if (!team) return null;
  const game = {
    id: uid(),
    opponent: (opponent || '').trim() || 'Opponent',
    date: date || new Date().toISOString().slice(0, 10),
    format: parseInt(format) || 3,
    ...(scheduleId ? { scheduleId } : {}),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...emptyGameState(),
  };
  const games = [...(team.games || []), game];
  updateTeam(teamId, { games });
  return game;
}

export function getGame(teamId, gameId) {
  const team = getTeam(teamId);
  if (!team) return null;
  return (team.games || []).find(g => g.id === gameId) || null;
}

export function updateGame(teamId, gameId, patch) {
  const team = getTeam(teamId);
  if (!team) return null;
  const games = (team.games || []).map(g =>
    g.id === gameId ? { ...g, ...patch, id: gameId, updatedAt: Date.now() } : g
  );
  const all = loadAll();
  const idx = all.findIndex(t => t.id === teamId);
  if (idx >= 0) {
    all[idx] = { ...all[idx], games, updatedAt: Date.now() };
    saveAll(all);
  }
  return games.find(g => g.id === gameId) || null;
}

export function deleteGame(teamId, gameId) {
  const team = getTeam(teamId);
  if (!team) return;
  const games = (team.games || []).filter(g => g.id !== gameId);
  updateTeam(teamId, { games });
}

export function resetGameState(teamId, gameId) {
  return updateGame(teamId, gameId, emptyGameState());
}

// ===== Gameplans =====

export function listGameplans(teamId) {
  const t = getTeam(teamId)
  return (t && t.gameplans) || []
}

export function saveGameplan(teamId, gp) {
  const all = loadAll()
  const tidx = all.findIndex(t => t.id === teamId)
  if (tidx < 0) return null
  const list = [...(all[tidx].gameplans || [])]
  const idx = list.findIndex(g => g.id === gp.id)
  const now = Date.now()
  const stamped = idx >= 0
    ? { ...gp, updatedAt: now }
    : { ...gp, id: gp.id || uid(), createdAt: now, updatedAt: now }
  if (idx >= 0) list[idx] = stamped; else list.push(stamped)
  all[tidx] = { ...all[tidx], gameplans: list, updatedAt: now }
  saveAll(all)
  return stamped
}

export function deleteGameplan(teamId, gpId) {
  const t = getTeam(teamId)
  if (!t) return
  updateTeam(teamId, { gameplans: (t.gameplans || []).filter(g => g.id !== gpId) })
}

// ===== Custom formations =====

export function listCustomFormations(teamId) {
  const t = getTeam(teamId);
  return (t && t.customFormations) || [];
}

export function saveCustomFormation(teamId, formation) {
  const team = getTeam(teamId);
  if (!team) return null;
  const list = [...(team.customFormations || [])];
  const idx = list.findIndex(f => f.id === formation.id);
  const stamped = { ...formation, builtin: false, updatedAt: Date.now() };
  if (idx >= 0) list[idx] = stamped;
  else list.push({ ...stamped, createdAt: Date.now() });
  updateTeam(teamId, { customFormations: list });
  return stamped;
}

export function deleteCustomFormation(teamId, formationId) {
  const team = getTeam(teamId);
  if (!team) return;
  const list = (team.customFormations || []).filter(f => f.id !== formationId);
  updateTeam(teamId, { customFormations: list });
}

// ===== Match attachments =====
// Per-game prep data the coach attaches to a specific opponent + date:
// gameplan, formation, free-form notes, and an optional lineup. Keyed by a
// stable opponent+date composite so the record survives the schedule row
// being deleted when StatsPal commits a final score (the same pair can be
// looked up against the resulting completed_games row to render a read-only
// "what we planned" view of past games).

export function matchKey(opponent, gameDate) {
  return `${String(opponent || '').trim().toLowerCase()}__${gameDate || ''}`;
}

export function getMatchAttachments(teamId) {
  const t = getTeam(teamId);
  return (t && t.matchAttachments) || {};
}

export function setMatchAttachment(teamId, key, patch) {
  const team = getTeam(teamId);
  if (!team) return null;
  const current = team.matchAttachments || {};
  const existing = current[key] || {};
  const merged = { ...existing, ...patch };
  for (const k of Object.keys(merged)) if (merged[k] == null) delete merged[k];
  const next = { ...current };
  if (Object.keys(merged).length === 0) delete next[key];
  else next[key] = merged;
  updateTeam(teamId, { matchAttachments: next });
  return merged;
}

// ===== Calendar notes =====
// Free-form per-team, per-date events the coach can drop on the calendar
// (e.g. "Film review", "Captain's practice"). Each note carries a color.

export function getCalendarNotes(teamId) {
  const t = getTeam(teamId);
  return (t && t.calendarNotes) || {};
}

export function setCalendarNote(teamId, dateStr, patch) {
  const team = getTeam(teamId);
  if (!team) return null;
  const current = team.calendarNotes || {};
  const next = { ...current };
  if (patch == null) {
    delete next[dateStr];
  } else {
    const merged = { ...(current[dateStr] || {}), ...patch };
    if (!merged.text) delete next[dateStr];
    else next[dateStr] = merged;
  }
  updateTeam(teamId, { calendarNotes: next });
  return next[dateStr] || null;
}

// ===== Match plans =====
// Multiple named gameplans per match. Each plan owns a P1..P6 lineup map.
// Stored under team.matchAttachments[matchKey].plans = [{ id, name, lineup }].

function _attForKey(team, key) {
  const all = team.matchAttachments || {};
  return all[key] || {};
}

export function getMatchPlans(teamId, key) {
  const t = getTeam(teamId);
  if (!t) return [];
  return (_attForKey(t, key).plans || []);
}

export function saveMatchPlan(teamId, key, plan) {
  const team = getTeam(teamId);
  if (!team) return null;
  const att = _attForKey(team, key);
  const list = [...(att.plans || [])];
  const stamp = Date.now();
  let stamped;
  if (plan.id) {
    const idx = list.findIndex(p => p.id === plan.id);
    stamped = { ...list[idx], ...plan, updatedAt: stamp };
    if (idx >= 0) list[idx] = stamped; else list.push(stamped);
  } else {
    stamped = { ...plan, id: uid(), createdAt: stamp, updatedAt: stamp };
    list.push(stamped);
  }
  setMatchAttachment(teamId, key, { plans: list });
  return stamped;
}

export function deleteMatchPlan(teamId, key, planId) {
  const team = getTeam(teamId);
  if (!team) return;
  const att = _attForKey(team, key);
  const list = (att.plans || []).filter(p => p.id !== planId);
  setMatchAttachment(teamId, key, { plans: list.length === 0 ? null : list });
}

// ===== Mapping StatsPal players → RotationPal roster =====

// StatsPal position codes → RotationPal role codes
const POSITION_MAP = {
  OH: 'OH',
  MB: 'MB',
  MH: 'MB',
  RS: 'RS',
  OPP: 'RS',
  S: 'S',
  L: 'L',
  DS: 'DS',
};

function splitName(name) {
  if (!name) return { firstName: '', lastName: '' };
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export function mapStatsPalRoster(statsPalPlayers) {
  return (statsPalPlayers || []).map(p => {
    const { firstName, lastName } = splitName(p.name || '');
    const role = POSITION_MAP[(p.position || '').toUpperCase()] || 'O';
    return {
      id: p.id,
      number: p.jersey_number || '',
      firstName,
      lastName,
      role,
    };
  });
}
