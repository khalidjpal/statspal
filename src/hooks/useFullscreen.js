import { useState, useEffect, useCallback } from 'react';

// Browser fullscreen for the whole document — the same thing F11 does, so the
// tabs and address bar go away, not just the app's own header.
//
// This started as the private toggle inside StatsPal's live scoreboard; it is
// the same three calls, lifted out so every screen shares one implementation
// and one source of truth for the state.
//
// The state is always read back from the DOM rather than tracked locally,
// because fullscreen can end without us: Esc, F11, or the browser deciding to
// drop out of it. `fullscreenchange` is the only reliable signal, so the icon
// stays correct however the user got in or out.

// Safari still ships the prefixed names. Standard first, prefix as a fallback —
// enough for Safari without turning this into a prefix table.
function fullscreenEl() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

export function isFullscreenSupported() {
  if (typeof document === 'undefined') return false;
  // fullscreenEnabled is false when a permissions policy forbids it (e.g. an
  // iframe without allow="fullscreen"), which is exactly when we want to hide
  // the control rather than offer a button that cannot work.
  return !!(
    document.fullscreenEnabled ||
    document.webkitFullscreenEnabled ||
    document.documentElement.requestFullscreen ||
    document.documentElement.webkitRequestFullscreen
  );
}

async function enter() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) return false;
  // requestFullscreen rejects rather than throws synchronously: outside a user
  // gesture, when a permissions policy blocks it, and on iPhone Safari, which
  // has no element fullscreen at all. None of those should reach the user as an
  // unhandled rejection — the control simply does nothing.
  try {
    await req.call(el);
    return true;
  } catch {
    return false;
  }
}

async function leave() {
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  if (!exit) return false;
  try {
    await exit.call(document);
    return true;
  } catch {
    return false;
  }
}

// `shortcut: true` binds the global "F" key. Pass it from ONE place (App) —
// every other caller just wants the state and the toggle, and binding the key
// in each of them would fire the toggle once per mounted button.
export function useFullscreen({ shortcut = false } = {}) {
  const [isFullscreen, setIsFullscreen] = useState(() => !!fullscreenEl());

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!fullscreenEl());
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    // The initial read can already be stale if fullscreen was entered before
    // this mounted (e.g. F11 on the login screen, then navigating).
    onChange();
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  const toggle = useCallback(async () => {
    if (fullscreenEl()) await leave();
    else await enter();
  }, []);

  useEffect(() => {
    if (!shortcut) return;
    function onKey(e) {
      if (e.key !== 'f' && e.key !== 'F') return;
      // Leave every modified combination alone — Ctrl+F is find, Cmd+F is find,
      // and Alt+F opens a menu on some platforms.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.repeat) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      // A keydown is a user gesture, so requestFullscreen is allowed here.
      if (fullscreenEl()) leave();
      else enter();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcut]);

  return { isFullscreen, toggle, supported: isFullscreenSupported() };
}

// A bare "F" must never steal a keystroke from someone typing a player's name,
// a note, or a score. Covers the obvious fields plus anything the page has
// marked editable, and anything that has opted into keyboard handling via a
// role — a listbox or a combobox treats letters as type-ahead.
export function isTypingTarget(target) {
  const el = target;
  if (!el || typeof el !== 'object') return false;
  const tag = (el.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (el.isContentEditable) return true;
  const role = typeof el.getAttribute === 'function' ? el.getAttribute('role') : null;
  if (role === 'textbox' || role === 'searchbox' || role === 'combobox' || role === 'listbox') return true;
  return false;
}
