import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import FullscreenButton from './FullscreenButton';
import { IconArrowLeft, IconRotate, IconChart, IconClipboard, IconCheck } from './Icons';
import './AppHeader.css';

// The one top header used by the Dashboard, RotationPal, StatsPal and
// PracticePal. Layout, left to right:
//
//   [wordmark | ← back | leading]  │  Team name ▾ (+ record)    [tabs]    [actions] ⛶ (user ▾)
//                                     ◆ Section
//
// Props
//   brand          show the "VolleyballPal" wordmark (Dashboard) instead of a back button
//   onBack         back button handler; backLabel defaults to "Dashboard"
//   leading        custom node in the back-button spot (overrides onBack)
//   teamName       the team's name
//   record         small muted pill after the name, e.g. "1-0"
//   teams, currentTeamId, onSelectTeam
//                  several teams → the chevron opens a team list
//   onSwitchTeam   or: the chevron hands off to an existing switcher screen
//   section        'rotationpal' | 'statspal' | 'practicepal'
//   tabs           [{ key, label }] in the centre; activeTab, onTabChange
//   actions        the page's own buttons, right side, before fullscreen
//   menuItems      extra user-menu rows: [{ key, label, onClick }]
//   user, onLogout default to the signed-in account from AuthContext
//
// Phones (<768px) keep the team + section on the left and fold the actions,
// fullscreen and account into a ⋯ menu; tabs become a scrolling row below.

const SECTIONS = {
  rotationpal: { label: 'RotationPal', color: '#a78bfa', Icon: IconRotate },
  statspal:    { label: 'StatsPal',    color: '#58a6ff', Icon: IconChart },
  practicepal: { label: 'PracticePal', color: '#4ade80', Icon: IconClipboard },
};

function Chevron({ size = 10 }) {
  return (
    <svg className="ah-chev" width={size} height={size} viewBox="0 0 10 10" aria-hidden="true">
      <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Dots() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" fill="currentColor" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      <circle cx="19" cy="12" r="1.8" fill="currentColor" />
    </svg>
  );
}

// Close a popover on a press outside `ref` or on Escape.
function useDismiss(open, ref, close) {
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, ref, close]);
}

export default function AppHeader({
  brand = false,
  onBack,
  backLabel = 'Dashboard',
  leading,
  teamName,
  record,
  teams,
  currentTeamId,
  onSelectTeam,
  onSwitchTeam,
  section,
  tabs,
  activeTab,
  onTabChange,
  actions,
  menuItems = [],
  user,
  onLogout,
}) {
  const auth = useAuth();
  const account = user || (auth?.currentUser
    ? { name: auth.currentUser.name || auth.currentUser.username, role: auth.currentUser.role }
    : null);
  const logout = onLogout || auth?.logout;

  const [teamOpen, setTeamOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const teamRef = useRef(null);
  const userRef = useRef(null);
  const rootRef = useRef(null);
  useDismiss(teamOpen, teamRef, () => setTeamOpen(false));
  useDismiss(userOpen, userRef, () => setUserOpen(false));
  useDismiss(moreOpen, rootRef, () => setMoreOpen(false));

  const sec = SECTIONS[section];
  const canPickTeam = Array.isArray(teams) && teams.length > 1 && !!onSelectTeam;
  const canSwitch = canPickTeam || !!onSwitchTeam;

  function openSwitcher() {
    setUserOpen(false);
    if (canPickTeam) setTeamOpen(o => !o);
    else onSwitchTeam?.();
  }

  const name = account?.name || 'Account';
  const roleLabel = account?.role === 'admin' ? 'Admin'
    : account?.role ? account.role[0].toUpperCase() + account.role.slice(1) : null;

  // The account rows — shared by the desktop dropdown and the phone ⋯ menu.
  const accountRows = (
    <>
      <div className="ah-menu-who">
        <span className="ah-menu-name">{name}</span>
        {roleLabel && <span className="ah-badge">{roleLabel}</span>}
      </div>
      {canSwitch && (
        <button type="button" role="menuitem" className="ah-menu-item" onClick={() => { setMoreOpen(false); openSwitcher(); }}>
          Switch team
        </button>
      )}
      {menuItems.map(it => (
        <button
          key={it.key}
          type="button"
          role="menuitem"
          className="ah-menu-item"
          onClick={() => { setUserOpen(false); setMoreOpen(false); it.onClick(); }}
        >{it.label}</button>
      ))}
      {logout && (
        <button type="button" role="menuitem" className="ah-menu-item" onClick={() => { setUserOpen(false); setMoreOpen(false); logout(); }}>
          Log out
        </button>
      )}
    </>
  );

  return (
    <header className={`ah${tabs?.length ? ' has-tabs' : ''}${moreOpen ? ' is-more-open' : ''}`} ref={rootRef}>
      <div className="ah-left">
        {brand ? (
          <span className="ah-wordmark">Volleyball<span>Pal</span></span>
        ) : leading ? leading : onBack ? (
          <button type="button" className="ah-btn ah-back" onClick={onBack}>
            <IconArrowLeft size={15} />
            <span className="ah-back-lbl">{backLabel}</span>
          </button>
        ) : null}
        {(brand || leading || onBack) && <span className="ah-divider" aria-hidden="true" />}

        <div className="ah-team" ref={teamRef}>
          <div className="ah-team-line">
            {canSwitch ? (
              <button
                type="button"
                className="ah-team-btn"
                onClick={openSwitcher}
                aria-haspopup={canPickTeam ? 'menu' : undefined}
                aria-expanded={canPickTeam ? teamOpen : undefined}
                title="Switch team"
              >
                <span className="ah-team-name">{teamName}</span>
                <Chevron />
              </button>
            ) : (
              <span className="ah-team-name">{teamName}</span>
            )}
            {record && <span className="ah-record">{record}</span>}
          </div>
          {sec && (
            <span className="ah-section" style={{ '--sec': sec.color }}>
              <sec.Icon size={13} />
              {sec.label}
            </span>
          )}
          {teamOpen && canPickTeam && (
            <div className="ah-menu ah-team-menu" role="menu">
              {teams.map(t => (
                <button
                  key={t.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={t.id === currentTeamId}
                  className={`ah-menu-item${t.id === currentTeamId ? ' is-current' : ''}`}
                  onClick={() => { setTeamOpen(false); if (t.id !== currentTeamId) onSelectTeam(t); }}
                >
                  <span className="ah-menu-check">{t.id === currentTeamId && <IconCheck size={13} />}</span>
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {tabs?.length > 0 && (
        <nav className="ah-tabs" aria-label="Sections">
          {tabs.map(t => (
            <button
              key={t.key}
              type="button"
              className={`ah-tab${t.key === activeTab ? ' is-active' : ''}`}
              aria-current={t.key === activeTab ? 'page' : undefined}
              onClick={() => onTabChange?.(t.key)}
            >{t.label}</button>
          ))}
        </nav>
      )}

      <button
        type="button"
        className="ah-btn ah-icon ah-more"
        onClick={() => setMoreOpen(o => !o)}
        aria-expanded={moreOpen}
        aria-label="More"
      >
        <Dots />
      </button>

      {/* Desktop: a row. Phone: the ⋯ panel. Rendered once either way, so a
          page's dropdowns and the modals they open keep their state. */}
      <div className="ah-right">
        {actions}
        <FullscreenButton className="ah-btn ah-icon" size={16} />
        {account && (
          <div className="ah-user" ref={userRef}>
            <button
              type="button"
              className={`ah-btn ah-userbtn${userOpen ? ' is-open' : ''}`}
              onClick={() => setUserOpen(o => !o)}
              aria-haspopup="menu"
              aria-expanded={userOpen}
              aria-label={`Account: ${name}`}
            >
              <span className="ah-avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
              <span className="ah-username">{name}</span>
              <Chevron />
            </button>
            {userOpen && <div className="ah-menu ah-user-menu" role="menu">{accountRows}</div>}
          </div>
        )}
        {account && <div className="ah-user-inline">{accountRows}</div>}
      </div>
    </header>
  );
}
