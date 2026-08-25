import { useMemo, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import { supabase } from '../supabase';
import { teamRecord } from '../utils/stats';
import { readEvents, removeEvent } from '../utils/teamEvents';
import { deleteTournamentGame } from '../utils/tournaments';
import { deletePlayerCompletely } from '../utils/playerCrud';
import { isClubFormat } from '../utils/teamFormat';
import { IconChart, IconRotate, IconArrowRight, IconSwap, IconPencil, IconCheck } from '../components/Icons';
import StandingsWidget from '../components/dashboard/StandingsWidget';
import NextUpWidget from '../components/dashboard/NextUpWidget';
import ScheduleWidget from '../components/dashboard/ScheduleWidget';
import CalendarWidget from '../components/dashboard/CalendarWidget';
import RosterPositionWidget from '../components/dashboard/RosterPositionWidget';
import Fab from '../components/dashboard/Fab';
import TournamentHost from '../components/TournamentHost';
import { ConfirmDelete } from '../components/dashboard/EditModeKit';
import DayAddChooser from '../components/dashboard/DayAddChooser';
import AddPlayerModal from '../components/modals/AddPlayerModal';
import EditPlayerModal from '../components/modals/EditPlayerModal';
import AddGameModal from '../components/modals/AddGameModal';
import EditTournamentGameModal from '../components/modals/EditTournamentGameModal';
import AddCalendarEventModal from '../components/modals/AddCalendarEventModal';
import AddTournamentModal from '../components/modals/AddTournamentModal';

export default function TeamLaunch({
  team,
  canSwitchTeam,
  canOpenTeamDetails,
  onSwitchTeam,
  onLaunchStatsPal,
  onLaunchRotationPal,
  onOpenTeamDetails,
  onStartLive,
  onSelectGame,
}) {
  const { currentUser, logout } = useAuth();
  const { addToast } = useToast();
  const {
    completedGames, schedule, players, tournaments,
    leagueTeams, leagueResults, refresh,
  } = useData();

  // Tournament opened from the calendar or the schedule widget.
  const [openTournament, setOpenTournament] = useState(null);

  // ── Edit mode ────────────────────────────────────────────────────────────
  // One dashboard-wide flag. Every panel below reads it and nothing else in the
  // app does, so with it off the dashboard behaves exactly as it did before.
  const [editMode, setEditMode] = useState(false);

  // Which editor is open. All of these reuse the app's existing modals — edit
  // mode only decides WHEN they open, never how they save.
  const [addPlayerOpen, setAddPlayerOpen] = useState(false);
  const [playerBeingEdited, setPlayerBeingEdited] = useState(null);
  const [addGameOpen, setAddGameOpen] = useState(false);
  const [gameBeingEdited, setGameBeingEdited] = useState(null);   // row + _kind
  const [eventBeingEdited, setEventBeingEdited] = useState(null); // localStorage event
  // Tapping a calendar day opens the type chooser for that date; picking a type
  // moves the date into dayAdd, which decides WHICH creation flow opens. Both
  // hold the same date — chooserDate is "deciding", dayAdd is "decided".
  const [chooserDate, setChooserDate] = useState(null);
  const [dayAdd, setDayAdd] = useState(null);                     // { date, type }

  // A destructive tap parks here until it is confirmed: { title, detail, run, done }.
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Secondary positions live in localStorage, so the roster panel needs a nudge
  // to re-read them after an edit.
  const [rosterKey, setRosterKey] = useState(0);

  const color = team?.color || '#58a6ff';

  const [events, setEvents] = useState(() => readEvents(team?.id));
  const reloadEvents = useCallback(() => {
    setEvents(readEvents(team?.id));
  }, [team?.id]);

  const { w, l } = useMemo(() => {
    if (!team) return { w: 0, l: 0 };
    return teamRecord(completedGames.filter(g => g.team_id === team.id));
  }, [team, completedGames]);

  const teamPlayerCount = useMemo(
    () => (players || []).filter(p => p.team_id === team?.id).length,
    [players, team?.id]
  );

  if (!team) return null;

  const isCoachOrAdmin = currentUser?.role === 'admin' || currentUser?.role === 'coach';
  const isClub = isClubFormat(team);
  const teamStyle = { '--tc': color };

  // Editing is a coach/admin capability. A player viewing the dashboard never
  // gets the toggle, so never gets a delete badge either.
  const canEdit = isCoachOrAdmin;
  const editing = canEdit && editMode;

  function exitEdit() { setEditMode(false); }

  // Leaving for another team drops edit mode — the badges shouldn't carry over
  // onto a roster you didn't arm them on.
  function handleSwitchTeam() {
    exitEdit();
    onSwitchTeam && onSwitchTeam();
  }

  // ── Deletes ──────────────────────────────────────────────────────────────
  // Every delete badge routes through here, so nothing destructive happens on a
  // single stray tap.
  async function confirmPendingDelete() {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    const { error } = await pendingDelete.run();
    setDeleting(false);
    if (error) {
      addToast(error.message || 'Could not remove that');
      return;
    }
    const done = pendingDelete.done;
    setPendingDelete(null);
    if (done) addToast(done, 'success');
  }

  function askDeletePlayer(player) {
    setPendingDelete({
      title: `Remove ${player.name}?`,
      detail: 'This takes the player off the roster and deletes their recorded stats. '
        + 'Any login linked to them is kept and simply detached. This cannot be undone.',
      confirmLabel: 'Remove player',
      done: `${player.name} removed from the roster`,
      run: async () => {
        const res = await deletePlayerCompletely({ player, teamId: team.id });
        if (!res.error) { await refresh(); setRosterKey(k => k + 1); }
        return res;
      },
    });
  }

  // A game row, whichever table it currently lives in. deleteTournamentGame is
  // named for where it was first used but is generic: it picks the table from
  // _kind and clears a completed game's player_game_stats first.
  function askDeleteGame(row, kind) {
    const isCompleted = kind === 'completed' || kind === 'done';
    const label = row.opponent ? `vs ${row.opponent}` : 'this game';
    setPendingDelete({
      title: `Delete ${label}?`,
      detail: isCompleted
        ? 'The game and every stat recorded for it are deleted. This cannot be undone.'
        : 'The game is removed from the schedule. This cannot be undone.',
      confirmLabel: 'Delete game',
      done: 'Game deleted',
      run: async () => {
        const res = await deleteTournamentGame({
          ...row,
          _kind: isCompleted ? 'completed' : 'scheduled',
        });
        if (!res.error) await refresh();
        return res;
      },
    });
  }

  // Same contract as TournamentHost's delete: the grouping goes, the games stay
  // as standalone games. Nothing with stats is destroyed here.
  function askDeleteTournament(t) {
    setPendingDelete({
      title: `Delete “${t.name}”?`,
      detail: 'The tournament grouping is removed. Its games and all their stats are kept — '
        + 'they become standalone games on the schedule.',
      confirmLabel: 'Delete tournament',
      done: 'Tournament deleted. Its games are now standalone games.',
      run: async () => {
        const { error } = await supabase.from('tournaments').delete().eq('id', t.id);
        if (!error) await refresh();
        return { error };
      },
    });
  }

  // A calendar bar is either a game (carries the row) or a locally-stored
  // practice/event.
  function askDeleteCalendarItem(item) {
    if (item.raw) {
      askDeleteGame(item.raw, item._kind);
      return;
    }
    setPendingDelete({
      title: `Remove “${item.title || 'this event'}”?`,
      detail: 'The event is removed from the calendar.',
      confirmLabel: 'Remove event',
      done: 'Event removed',
      run: async () => {
        removeEvent(team.id, item.id);
        reloadEvents();
        return { error: null };
      },
    });
  }

  // ── Edits ────────────────────────────────────────────────────────────────
  function editCalendarItem(item) {
    if (item.raw) {
      setGameBeingEdited({ ...item.raw, _kind: item._kind });
      return;
    }
    setEventBeingEdited(item);
  }

  // A type was picked for a day. Every branch below is an existing flow — the
  // only thing added is the pre-seeded date.
  function pickDayAddType(type) {
    const date = chooserDate;
    setChooserDate(null);
    setDayAdd({ date, type });
  }

  function closeDayAdd() { setDayAdd(null); }

  function editScheduleGame(row, kind) {
    setGameBeingEdited({
      ...row,
      _kind: (kind === 'completed' || kind === 'done') ? 'completed' : 'scheduled',
    });
  }

  const myLeagueTeams = (leagueTeams || []).filter(lt => lt.team_id === team.id);
  const schoolType = team.school_type || 'high_school';

  return (
    <div className={`vp-home dash-page${editing ? ' dash-editing' : ''}`}>
      <header className="vp-home-topbar dash-topbar" style={teamStyle}>
        <div className="vp-home-brand dash-topbar-brand">
          <span className="vp-home-brand-name">
            Volleyball<span className="vp-home-brand-accent">Pal</span>
          </span>
        </div>

        <div className="dash-topbar-team">
          <button
            type="button"
            className="dash-topbar-team-name"
            onClick={canOpenTeamDetails ? onOpenTeamDetails : undefined}
            disabled={!canOpenTeamDetails}
            title={canOpenTeamDetails ? 'Open team details' : team.name}
          >
            {team.name}
          </button>
          <span className="dash-topbar-team-sep">—</span>
          <span className="dash-topbar-team-rec">
            <span className="dash-topbar-team-w" style={{ color }}>{w}</span>
            <span className="dash-topbar-team-dash">–</span>
            <span className="dash-topbar-team-l">{l}</span>
          </span>
        </div>

        {canSwitchTeam && (
          <button className="vp-tl-topbar-btn" onClick={handleSwitchTeam}>
            <IconSwap size={13} /> Switch team
          </button>
        )}

        {/* Sits immediately beside the + so the two dashboard-level actions —
            add something new, or rearrange what's there — read as a pair. */}
        {canEdit && (
          <button
            type="button"
            className={`dash-edit-toggle${editing ? ' is-active' : ''}`}
            onClick={() => setEditMode(v => !v)}
            aria-pressed={editing}
            title={editing ? 'Finish editing the dashboard' : 'Edit the dashboard inline'}
          >
            <span className="dash-edit-toggle-icon">
              {editing ? <IconCheck size={13} /> : <IconPencil size={12} />}
            </span>
            {editing ? 'Done' : 'Edit'}
          </button>
        )}

        <Fab
          team={team}
          leagueTeams={leagueTeams}
          onRefresh={refresh}
          onEventsChanged={reloadEvents}
        />
        <div className="vp-home-userbar">
          <span className="vp-home-username">{currentUser?.name || currentUser?.username}</span>
          <button className="vp-home-logout" onClick={logout}>Logout</button>
        </div>
      </header>

      <main className="dash-main" style={teamStyle}>
        {editing && (
          <div className="dash-edit-banner">
            <span className="dash-edit-banner-label">
              <span className="dash-edit-banner-dot" />
              Editing
            </span>
            <span className="dash-edit-banner-sep" aria-hidden="true" />
            <span className="dash-edit-banner-hint">
              Tap an item to change it, or its badge to remove it.
            </span>
            <button type="button" className="dash-edit-banner-done" onClick={exitEdit}>
              <IconCheck size={12} /> Done
            </button>
          </div>
        )}

        <section className="dash-modules">
          <button className="dash-module dash-module-rotation" onClick={onLaunchRotationPal}>
            <span className="dash-module-icon"><IconRotate size={24} /></span>
            <span className="dash-module-body">
              <span className="dash-module-title">RotationPal</span>
              <span className="dash-module-sub">Lineups &amp; rotations</span>
            </span>
            <span className="dash-module-arrow"><IconArrowRight size={14} /></span>
          </button>
          <button className="dash-module dash-module-stats" onClick={onLaunchStatsPal}>
            <span className="dash-module-icon"><IconChart size={24} /></span>
            <span className="dash-module-body">
              <span className="dash-module-title">StatsPal</span>
              <span className="dash-module-sub">Live games &amp; stats</span>
            </span>
            <span className="dash-module-arrow"><IconArrowRight size={14} /></span>
          </button>
        </section>

        <section className="dash-grid">
          {/* Top-left slot swaps on the team's format and nothing else does: a
              club has no league table, so it gets "what's next" instead of
              standings. isClubFormat() defaults to high school, so a team
              without the format column keeps the standings panel it has today. */}
          {isClub ? (
            <NextUpWidget
              team={team}
              schedule={schedule}
              completedGames={completedGames}
              tournaments={tournaments}
              onOpenTournament={setOpenTournament}
              onOpenGame={isCoachOrAdmin ? onStartLive : undefined}
            />
          ) : (
            <StandingsWidget
              team={team}
              leagueTeams={leagueTeams}
              leagueResults={leagueResults}
            />
          )}
          <ScheduleWidget
            team={team}
            schedule={schedule}
            completedGames={completedGames}
            onOpenInRotationPal={onLaunchRotationPal}
            onOpenTournament={setOpenTournament}
            editMode={editing}
            onEditGame={editScheduleGame}
            onDeleteGame={askDeleteGame}
            onDeleteTournament={askDeleteTournament}
            onAddGame={() => setAddGameOpen(true)}
          />
          <CalendarWidget
            key={team.id}
            team={team}
            schedule={schedule}
            completedGames={completedGames}
            tournaments={tournaments}
            events={events}
            onEventsChanged={reloadEvents}
            onOpenStatsPal={onLaunchStatsPal}
            onOpenRotationPal={onLaunchRotationPal}
            onOpenTournament={setOpenTournament}
            editMode={editing}
            onEditCalendarItem={editCalendarItem}
            onDeleteCalendarItem={askDeleteCalendarItem}
            onAddOnDate={date => setChooserDate(date)}
          />
          <RosterPositionWidget
            team={team}
            players={players}
            refreshKey={rosterKey}
            editMode={editing}
            onAddPlayer={editing ? () => setAddPlayerOpen(true) : undefined}
            onEditPlayer={editing ? (p => setPlayerBeingEdited(p)) : undefined}
            onDeletePlayer={editing ? askDeletePlayer : undefined}
          />
        </section>
      </main>

      <TournamentHost
        tournament={openTournament}
        team={team}
        isAdmin={isCoachOrAdmin}
        onClose={() => setOpenTournament(null)}
        onStartLive={onStartLive}
        onSelectGame={onSelectGame}
        refresh={refresh}
      />

      {/* ── Edit-mode editors. Each is the app's existing modal, so validation
             and persistence are unchanged; edit mode only opens them. ── */}
      {addPlayerOpen && (
        <AddPlayerModal
          teamId={team.id}
          playerCount={teamPlayerCount}
          schoolType={schoolType}
          onClose={() => setAddPlayerOpen(false)}
          onSaved={() => {
            setAddPlayerOpen(false);
            setRosterKey(k => k + 1);
            refresh();
          }}
        />
      )}

      {playerBeingEdited && (
        <EditPlayerModal
          player={playerBeingEdited}
          schoolType={schoolType}
          onClose={() => setPlayerBeingEdited(null)}
          onSaved={() => {
            setPlayerBeingEdited(null);
            setRosterKey(k => k + 1);
            refresh();
          }}
        />
      )}

      {addGameOpen && (
        <AddGameModal
          teamId={team.id}
          leagueTeams={myLeagueTeams}
          onClose={() => setAddGameOpen(false)}
          onSaved={() => { setAddGameOpen(false); refresh(); }}
        />
      )}

      {/* tournament={null} — this is the standalone-game editor. It carries its
          own delete, which is why a game row's badge and its editor agree. */}
      {gameBeingEdited && (
        <EditTournamentGameModal
          game={gameBeingEdited}
          tournament={null}
          onClose={() => setGameBeingEdited(null)}
          onSaved={() => { setGameBeingEdited(null); refresh(); }}
        />
      )}

      {eventBeingEdited && (
        <AddCalendarEventModal
          teamId={team.id}
          event={eventBeingEdited}
          onClose={() => setEventBeingEdited(null)}
          onSaved={() => { setEventBeingEdited(null); reloadEvents(); }}
        />
      )}

      {/* ── Day-add: pick a type, then that type's own creation flow ── */}
      <DayAddChooser
        date={chooserDate}
        onPick={pickDayAddType}
        onClose={() => setChooserDate(null)}
      />

      {/* GAME → schedule. Same modal the + menu and the schedule panel use. */}
      {dayAdd?.type === 'game' && (
        <AddGameModal
          teamId={team.id}
          leagueTeams={myLeagueTeams}
          initialDate={dayAdd.date}
          onClose={closeDayAdd}
          onSaved={() => { closeDayAdd(); refresh(); }}
        />
      )}

      {/* TOURNAMENT → tournaments. onSaved hands back the new row, so the event
          opens straight away — its games are added from its own view. */}
      {dayAdd?.type === 'tournament' && (
        <AddTournamentModal
          team={team}
          initialDate={dayAdd.date}
          onClose={closeDayAdd}
          onSaved={created => {
            closeDayAdd();
            refresh();
            if (created) setOpenTournament(created);
          }}
        />
      )}

      {/* PRACTICE / EVENT → the existing calendar-event flow, which keeps its
          full recurrence picker because this is an add, not an edit. */}
      {(dayAdd?.type === 'practice' || dayAdd?.type === 'event') && (
        <AddCalendarEventModal
          teamId={team.id}
          defaultType={dayAdd.type}
          initialDate={dayAdd.date}
          onClose={closeDayAdd}
          onSaved={() => { closeDayAdd(); reloadEvents(); }}
        />
      )}

      <ConfirmDelete
        open={!!pendingDelete}
        title={pendingDelete?.title}
        detail={pendingDelete?.detail}
        confirmLabel={pendingDelete?.confirmLabel}
        busy={deleting}
        onConfirm={confirmPendingDelete}
        onCancel={() => !deleting && setPendingDelete(null)}
      />
    </div>
  );
}
