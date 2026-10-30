import { useState, useEffect, useRef } from 'react';
// Line icons, not emoji — see DESIGN.md.
import {
  IconPlay, IconTrophy, IconClipboard, IconCalendar, IconChart, IconList, IconUsers,
} from '../Icons';
import AddGameModal from '../modals/AddGameModal';
import AddTournamentModal from '../modals/AddTournamentModal';
import AddResultModal from '../modals/AddResultModal';
import AddLeagueTeamModal from '../modals/AddLeagueTeamModal';
import AddCalendarEventModal from '../modals/AddCalendarEventModal';
import PlayerManagementModal from '../modals/PlayerManagementModal';

const OPTIONS = [
  {
    key: 'game',
    Icon: IconPlay,
    label: 'Add Game',
    desc: 'Schedule an upcoming match',
    accent: '#58a6ff',
  },
  {
    key: 'tournament',
    Icon: IconTrophy,
    label: 'Add Tournament',
    desc: 'Group a day of games under one event',
    accent: '#f0a500',
  },
  {
    key: 'practice',
    Icon: IconClipboard,
    label: 'Add Practice',
    desc: 'Plan a practice session',
    accent: '#3fb950',
  },
  {
    key: 'event',
    Icon: IconCalendar,
    label: 'Add Event',
    desc: 'Tournament, meeting or other',
    accent: '#f0a500',
  },
  {
    key: 'result',
    Icon: IconChart,
    label: 'Add Result',
    desc: 'Enter the score of a past game',
    accent: '#bc8cff',
  },
  {
    key: 'standing',
    Icon: IconList,
    label: 'Add Standing',
    desc: 'Add a team to the standings',
    accent: '#ff8a65',
  },
  {
    key: 'roster',
    Icon: IconUsers,
    label: 'Edit Roster / Players',
    desc: 'Manage your team roster',
    accent: '#22d3c5',
  },
];

export default function Fab({ team, leagueTeams, onRefresh, onEventsChanged }) {
  const [open, setOpen] = useState(false);
  const [activeModal, setActiveModal] = useState(null);
  const popupRef = useRef(null);
  const fabRef = useRef(null);

  // Close popup on outside click / Escape
  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (popupRef.current?.contains(e.target)) return;
      if (fabRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function handlePick(key) {
    setActiveModal(key);
    setOpen(false);
  }

  function closeModal() {
    setActiveModal(null);
  }

  function handleSavedSupabase() {
    setActiveModal(null);
    onRefresh && onRefresh();
  }

  function handleSavedEvent() {
    setActiveModal(null);
    onEventsChanged && onEventsChanged();
  }

  const myLeagueTeams = (leagueTeams || []).filter(lt => lt.team_id === team?.id);

  return (
    <>
      <div className={`dash-fab-wrap${open ? ' is-open' : ''}`}>
        <div className="dash-fab-popup" ref={popupRef} role="menu" aria-hidden={!open}>
          <div className="dash-fab-popup-head">
            <span className="dash-fab-popup-title">Quick Add</span>
            <span className="dash-fab-popup-sub">What would you like to add?</span>
          </div>
          <div className="dash-fab-popup-grid">
            {OPTIONS.map((opt, i) => (
              <button
                key={opt.key}
                type="button"
                className="dash-fab-option"
                onClick={() => handlePick(opt.key)}
                style={{
                  '--opt-accent': opt.accent,
                  '--opt-delay': `${i * 35}ms`,
                }}
                role="menuitem"
                tabIndex={open ? 0 : -1}
              >
                <span className="dash-fab-option-icon"><opt.Icon size={16} /></span>
                <span className="dash-fab-option-body">
                  <span className="dash-fab-option-label">{opt.label}</span>
                  <span className="dash-fab-option-desc">{opt.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* The dashboard's primary action, styled by the shared header. */}
        <button
          ref={fabRef}
          type="button"
          className="ah-btn is-primary"
          onClick={() => setOpen(v => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          + New
        </button>
      </div>

      {activeModal === 'game' && (
        <AddGameModal
          teamId={team.id}
          leagueTeams={myLeagueTeams}
          onClose={closeModal}
          onSaved={handleSavedSupabase}
        />
      )}
      {activeModal === 'tournament' && (
        <AddTournamentModal
          team={team}
          onClose={closeModal}
          onSaved={handleSavedSupabase}
        />
      )}
      {activeModal === 'result' && (
        <AddResultModal
          teamId={team.id}
          leagueTeams={myLeagueTeams}
          onClose={closeModal}
          onSaved={handleSavedSupabase}
        />
      )}
      {activeModal === 'standing' && (
        <AddLeagueTeamModal
          teamId={team.id}
          onClose={closeModal}
          onSaved={handleSavedSupabase}
        />
      )}
      {(activeModal === 'practice' || activeModal === 'event') && (
        <AddCalendarEventModal
          teamId={team.id}
          defaultType={activeModal}
          onClose={closeModal}
          onSaved={handleSavedEvent}
        />
      )}
      {activeModal === 'roster' && (
        <PlayerManagementModal
          team={team}
          onClose={closeModal}
        />
      )}
    </>
  );
}
