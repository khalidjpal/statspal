import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// =============================================================================
// VolleyballPalContext — shared state layer between StatsPal and RotationPal
// =============================================================================
// Holds:
//   - links[]              persistent: which StatsPal teams the user has
//                          explicitly marked as "linked" (gold badge).
//   - standaloneTeams[]    persistent: RotationPal standalone lineups that
//                          aren't tied to any StatsPal team.
//   - lastMode             persistent: last mode used per module
//                          ({ statspal: 'linked'|'standalone', rotationpal: ... })
//   - activeSession        in-memory: what RotationPal is currently tracking
//                          (teamId, score, rotation, lineup, serving, etc.) —
//                          read by StatsPal when starting a linked live game.
// =============================================================================

const LINKS_KEY = 'vbpal-linked-teams-v1';
const STANDALONE_KEY = 'vbpal-standalone-teams-v1';
const LAST_MODE_KEY = 'vbpal-last-mode-v1';

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {}
  return fallback;
}

function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

const VolleyballPalContext = createContext(null);

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

export function VolleyballPalProvider({ children }) {
  const [links, setLinks] = useState(() => loadJSON(LINKS_KEY, {}));
  const [standaloneTeams, setStandaloneTeams] = useState(() => loadJSON(STANDALONE_KEY, []));
  const [lastMode, setLastMode] = useState(() => loadJSON(LAST_MODE_KEY, { statspal: null, rotationpal: null }));
  const [activeSession, setActiveSession] = useState(null);

  // Persist slices when they change
  useEffect(() => { saveJSON(LINKS_KEY, links); }, [links]);
  useEffect(() => { saveJSON(STANDALONE_KEY, standaloneTeams); }, [standaloneTeams]);
  useEffect(() => { saveJSON(LAST_MODE_KEY, lastMode); }, [lastMode]);

  // ---------- Link management ----------
  const linkTeam = useCallback((statsPalTeamId) => {
    setLinks(prev => ({ ...prev, [statsPalTeamId]: { linkedAt: Date.now() } }));
  }, []);

  const unlinkTeam = useCallback((statsPalTeamId) => {
    setLinks(prev => {
      const next = { ...prev };
      delete next[statsPalTeamId];
      return next;
    });
  }, []);

  const isLinked = useCallback((statsPalTeamId) => !!links[statsPalTeamId], [links]);

  // ---------- Standalone RotationPal teams ----------
  const createStandaloneTeam = useCallback((name) => {
    const t = {
      id: 'sa-' + uid(),
      name: (name || '').trim() || 'Standalone Team',
      createdAt: Date.now(),
    };
    setStandaloneTeams(prev => [...prev, t]);
    return t;
  }, []);

  const renameStandaloneTeam = useCallback((id, name) => {
    setStandaloneTeams(prev => prev.map(t => t.id === id ? { ...t, name } : t));
  }, []);

  const deleteStandaloneTeam = useCallback((id) => {
    setStandaloneTeams(prev => prev.filter(t => t.id !== id));
    // Also wipe its RotationPal record
    try {
      const raw = localStorage.getItem('rotationpal-teams-v2');
      if (raw) {
        const list = JSON.parse(raw).filter(t => t.id !== id);
        localStorage.setItem('rotationpal-teams-v2', JSON.stringify(list));
      }
    } catch {}
  }, []);

  // ---------- Clear RotationPal config for a team (linked or standalone) ----------
  // Wipes rotationpal-teams-v2 entry for this team id (keeps StatsPal roster).
  const clearRotationPalConfig = useCallback((teamId) => {
    try {
      const raw = localStorage.getItem('rotationpal-teams-v2');
      if (raw) {
        const list = JSON.parse(raw).filter(t => t.id !== teamId);
        localStorage.setItem('rotationpal-teams-v2', JSON.stringify(list));
      }
    } catch {}
  }, []);

  // ---------- Last-used mode ----------
  const setLastModeFor = useCallback((module, mode) => {
    setLastMode(prev => ({ ...prev, [module]: mode }));
  }, []);

  // ---------- Active live session (publish/consume) ----------
  // RotationPal calls publishSession() while a live game is running on a linked
  // team. StatsPal reads the current session when starting its own live game
  // to pre-load lineup/score/rotation. Session state lives in memory only.
  const publishSession = useCallback((partial) => {
    setActiveSession(prev => {
      const next = { ...(prev || {}), ...partial, updatedAt: Date.now() };
      return next;
    });
  }, []);

  const clearSession = useCallback(() => setActiveSession(null), []);

  // Count helpers exposed for the home screen
  const linkedCount = Object.keys(links).length;
  const standaloneCount = standaloneTeams.length;

  const value = useMemo(() => ({
    links, standaloneTeams, lastMode, activeSession,
    linkTeam, unlinkTeam, isLinked,
    createStandaloneTeam, renameStandaloneTeam, deleteStandaloneTeam, clearRotationPalConfig,
    setLastModeFor,
    publishSession, clearSession,
    linkedCount, standaloneCount,
  }), [
    links, standaloneTeams, lastMode, activeSession,
    linkTeam, unlinkTeam, isLinked,
    createStandaloneTeam, renameStandaloneTeam, deleteStandaloneTeam, clearRotationPalConfig,
    setLastModeFor,
    publishSession, clearSession,
    linkedCount, standaloneCount,
  ]);

  return (
    <VolleyballPalContext.Provider value={value}>
      {children}
    </VolleyballPalContext.Provider>
  );
}

export function useVolleyballPal() {
  const ctx = useContext(VolleyballPalContext);
  if (!ctx) throw new Error('useVolleyballPal must be used within VolleyballPalProvider');
  return ctx;
}
