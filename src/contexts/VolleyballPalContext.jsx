import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// =============================================================================
// VolleyballPalContext — shared state layer between StatsPal and RotationPal
// =============================================================================
// Holds:
//   - standaloneTeams[]    persistent: RotationPal standalone lineups that
//                          aren't tied to any StatsPal team (ids prefixed
//                          with 'sa-'). StatsPal teams are *always* shared
//                          with RotationPal via the Supabase `players` table,
//                          so there is no per-team "link" flag to track.
//   - lastMode             persistent: last mode used per module.
//   - activeSession        in-memory: what RotationPal is currently tracking
//                          (teamId, score, rotation, lineup, serving, etc.) —
//                          read by StatsPal when starting a live game.
// =============================================================================

const STANDALONE_KEY = 'vbpal-standalone-teams-v1';
const LAST_MODE_KEY = 'vbpal-last-mode-v1';

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch { /* localStorage unavailable — fall back */ }
  return fallback;
}

function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
}

const VolleyballPalContext = createContext(null);

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

export function VolleyballPalProvider({ children }) {
  const [standaloneTeams, setStandaloneTeams] = useState(() => loadJSON(STANDALONE_KEY, []));
  const [lastMode, setLastMode] = useState(() => loadJSON(LAST_MODE_KEY, { statspal: null, rotationpal: null }));
  const [activeSession, setActiveSession] = useState(null);

  useEffect(() => { saveJSON(STANDALONE_KEY, standaloneTeams); }, [standaloneTeams]);
  useEffect(() => { saveJSON(LAST_MODE_KEY, lastMode); }, [lastMode]);

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
    try {
      const raw = localStorage.getItem('rotationpal-teams-v2');
      if (raw) {
        const list = JSON.parse(raw).filter(t => t.id !== id);
        localStorage.setItem('rotationpal-teams-v2', JSON.stringify(list));
      }
    } catch { /* noop */ }
  }, []);

  // Wipes rotationpal-teams-v2 entry for this team id (keeps StatsPal roster).
  const clearRotationPalConfig = useCallback((teamId) => {
    try {
      const raw = localStorage.getItem('rotationpal-teams-v2');
      if (raw) {
        const list = JSON.parse(raw).filter(t => t.id !== teamId);
        localStorage.setItem('rotationpal-teams-v2', JSON.stringify(list));
      }
    } catch { /* noop */ }
  }, []);

  // ---------- Last-used mode ----------
  const setLastModeFor = useCallback((module, mode) => {
    setLastMode(prev => ({ ...prev, [module]: mode }));
  }, []);

  // ---------- Active live session (publish/consume) ----------
  const publishSession = useCallback((partial) => {
    setActiveSession(prev => ({ ...(prev || {}), ...partial, updatedAt: Date.now() }));
  }, []);

  const clearSession = useCallback(() => setActiveSession(null), []);

  const standaloneCount = standaloneTeams.length;

  const value = useMemo(() => ({
    standaloneTeams, lastMode, activeSession,
    createStandaloneTeam, renameStandaloneTeam, deleteStandaloneTeam, clearRotationPalConfig,
    setLastModeFor,
    publishSession, clearSession,
    standaloneCount,
  }), [
    standaloneTeams, lastMode, activeSession,
    createStandaloneTeam, renameStandaloneTeam, deleteStandaloneTeam, clearRotationPalConfig,
    setLastModeFor,
    publishSession, clearSession,
    standaloneCount,
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
