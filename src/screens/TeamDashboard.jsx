import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { supabase } from '../supabase';
import ScheduleTab from '../components/ScheduleTab';
import StandingsTab from '../components/StandingsTab';
import AveragesTab from '../components/AveragesTab';
import RosterTab from '../components/RosterTab';
import Modal from '../components/Modal';
import PlayerDetail from './PlayerDetail';
import GameSummary from './GameSummary';
import PlayerGameDetail from './PlayerGameDetail';
import InboxModal from '../components/modals/InboxModal';

const TABS = ['Schedule', 'Standings', 'Averages', 'Roster'];

export default function TeamDashboard({ team, onBack, onPreGame, onStartLive, onResumeGame, onTeamAdmin }) {
  const { currentUser } = useAuth();
  const data = useData();
  const { players, schedule, completedGames, playerGameStats, leagueTeams, leagueResults, accounts, coachAssignments, refresh } = data;
  const [tab, setTab] = useState('Schedule');

  // Drill-down popup state
  const [popupPlayer, setPopupPlayer] = useState(null);
  const [popupGame, setPopupGame] = useState(null);
  const [popupPlayerGame, setPopupPlayerGame] = useState(null);

  // Inbox
  const [showInbox, setShowInbox] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  function openPlayer(player) { setPopupPlayer(player); }
  function openGame(game) { setPopupGame(game); }
  function openPlayerGame(player, game) { setPopupPlayerGame({ player, game }); }

  useEffect(() => { refresh(); }, [refresh]);

  // Fetch unread count for coaches/admins
  useEffect(() => {
    if (!currentUser?.id) return;
    supabase
      .from('message_recipients')
      .select('id', { count: 'exact' })
      .eq('account_id', currentUser.id)
      .eq('read', false)
      .then(({ count }) => setUnreadCount(count || 0));
  }, [currentUser?.id]);

  const isAdmin = currentUser?.role === 'admin';
  const isCoachOrAdmin = isAdmin || currentUser?.role === 'coach';
  const isTeamAdmin = isAdmin || (currentUser?.role === 'coach' && (currentUser?.teamIds || []).includes(team.id));

  const teamColor = team.color || '#1a3a8f';
  const headerBg = `linear-gradient(135deg, ${teamColor}, ${teamColor}CC)`;

  return (
    <div
      className="screen-shell"
      style={{
        '--team-color': teamColor,
        '--team-color-06': teamColor + '0F',
        '--team-color-12': teamColor + '1F',
        '--team-color-30': teamColor + '4D',
      }}
    >
      {/* ── Compact top bar (44px) ── */}
      <div className="app-header" style={{ background: headerBg }}>
        <button className="app-header-back" onClick={onBack} title="Back">‹</button>

        <span className="app-header-title">{team.name}</span>

        <div className="app-header-actions">
          {/* Refresh */}
          <button
            className="app-header-btn"
            onClick={() => refresh()}
            title="Refresh"
          >
            ↻
          </button>

          {/* Inbox (coaches + admins) */}
          {isCoachOrAdmin && (
            <button
              className="app-header-btn"
              onClick={() => setShowInbox(true)}
              title="Inbox"
            >
              ✉
              {unreadCount > 0 && (
                <span className="header-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </button>
          )}

          {/* Start Game (coaches + admins) */}
          {isCoachOrAdmin && (
            <button
              className="app-header-btn app-header-btn-gold"
              onClick={() => onPreGame(team)}
              title="Start Game"
            >
              ▶ Start
            </button>
          )}

          {/* Admin — coaches see this for their own team, admins always see it */}
          {isTeamAdmin && (
            <button
              className="app-header-btn"
              onClick={() => onTeamAdmin(team)}
              title="Admin"
            >
              ⚙
            </button>
          )}
        </div>
      </div>

      {/* ── Scrollable content area ── */}
      <div className="app-content">
        <div className="page-wrap">

          {/* Top tab bar */}
          <div className="tab-bar">
            {TABS.map(t => (
              <button
                key={t}
                className={`tab-btn${tab === t ? ' active' : ''}`}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === 'Schedule' && (
            <ScheduleTab
              team={team}
              schedule={schedule}
              completedGames={completedGames}
              players={players}
              playerGameStats={playerGameStats}
              leagueTeams={leagueTeams}
              isAdmin={isCoachOrAdmin}
              onSelectGame={openGame}
              onStartLive={isCoachOrAdmin ? onStartLive : undefined}
              onResumeGame={isCoachOrAdmin ? onResumeGame : undefined}
              refresh={refresh}
            />
          )}
          {tab === 'Standings' && (
            <StandingsTab
              team={team}
              leagueTeams={leagueTeams}
              leagueResults={leagueResults}
              isAdmin={isTeamAdmin}
              refresh={refresh}
            />
          )}
          {tab === 'Averages' && (
            <AveragesTab
              players={players}
              playerGameStats={playerGameStats}
              completedGames={completedGames}
              teamId={team.id}
              onSelectPlayer={openPlayer}
              onSelectPlayerGame={openPlayerGame}
            />
          )}
          {tab === 'Roster' && (
            <RosterTab
              team={team}
              players={players}
              accounts={accounts}
              coachAssignments={coachAssignments}
              isAdmin={isTeamAdmin}
              currentUser={currentUser}
              refresh={refresh}
              onSelectPlayer={openPlayer}
              onOpenInbox={isCoachOrAdmin ? () => setShowInbox(true) : undefined}
              unreadCount={unreadCount}
            />
          )}
        </div>
      </div>

      {/* ── Drill-down modals ── */}
      <Modal open={!!popupPlayer} onClose={() => setPopupPlayer(null)} maxWidth={520}>
        {popupPlayer && (
          <PlayerDetail
            asModal
            player={popupPlayer}
            team={team}
            onSelectGame={(p, g) => openPlayerGame(p, g)}
          />
        )}
      </Modal>

      <Modal open={!!popupGame} onClose={() => setPopupGame(null)} maxWidth={760}>
        {popupGame && (
          <GameSummary
            asModal
            game={popupGame}
            team={team}
            onSelectPlayer={(p, g) => openPlayerGame(p, g)}
          />
        )}
      </Modal>

      <Modal open={!!popupPlayerGame} onClose={() => setPopupPlayerGame(null)} maxWidth={520}>
        {popupPlayerGame && (
          <PlayerGameDetail
            asModal
            player={popupPlayerGame.player}
            game={popupPlayerGame.game}
            team={team}
          />
        )}
      </Modal>

      {showInbox && currentUser && (
        <InboxModal
          currentUser={currentUser}
          onClose={() => setShowInbox(false)}
          onUnreadChange={setUnreadCount}
        />
      )}
    </div>
  );
}
