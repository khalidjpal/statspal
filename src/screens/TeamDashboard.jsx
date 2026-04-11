import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import NextGameBar from '../components/NextGameBar';
import ScheduleTab from '../components/ScheduleTab';
import StandingsTab from '../components/StandingsTab';
import AveragesTab from '../components/AveragesTab';
import RosterTab from '../components/RosterTab';
import Modal from '../components/Modal';
import PlayerDetail from './PlayerDetail';
import GameSummary from './GameSummary';
import PlayerGameDetail from './PlayerGameDetail';

const TABS = ['Schedule', 'Standings', 'Averages', 'Roster'];

export default function TeamDashboard({ team, onBack, onPreGame, onStartLive, onResumeGame, onTeamAdmin }) {
  const { currentUser } = useAuth();
  const data = useData();
  const { players, schedule, completedGames, playerGameStats, leagueTeams, leagueResults, refresh } = data;
  const [tab, setTab] = useState('Schedule');

  // Popup modal state — keeps drill-downs in-place instead of routing
  const [popupPlayer, setPopupPlayer] = useState(null);
  const [popupGame, setPopupGame] = useState(null);
  const [popupPlayerGame, setPopupPlayerGame] = useState(null); // { player, game }

  function openPlayer(player) { setPopupPlayer(player); }
  function openGame(game) { setPopupGame(game); }
  function openPlayerGame(player, game) { setPopupPlayerGame({ player, game }); }

  useEffect(() => { refresh(); }, [refresh]);

  const isAdmin = currentUser?.role === 'admin';
  const isCoachOrAdmin = isAdmin || currentUser?.role === 'coach';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', '--team-color': team.color || '#1a3a8f', '--team-color-06': (team.color || '#1a3a8f') + '0F', '--team-color-12': (team.color || '#1a3a8f') + '1F', '--team-color-30': (team.color || '#1a3a8f') + '4D' }}>
      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, ${team.color || '#0d1f5c'}, ${team.color || '#1a3a8f'})`,
        color: '#fff',
        padding: '16px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <button
            onClick={onBack}
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}
          >
            Back
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => { refresh(); }}
              style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '6px 10px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}
            >
              ↻
            </button>
            {isCoachOrAdmin && (
              <button
                onClick={() => onPreGame(team)}
                style={{ background: '#c9a84c', color: '#000', padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}
              >
                Start Game
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => onTeamAdmin(team)}
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}
              >
                Admin
              </button>
            )}
          </div>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>{team.name}</h1>
        <div style={{ fontSize: 13, opacity: 0.7 }}>
          {[team.gender, team.level, team.season].filter(Boolean).join(' · ')}
        </div>
      </div>

      <div style={{ padding: '16px 20px', maxWidth: 800, margin: '0 auto' }}>
        <NextGameBar
          team={team}
          schedule={schedule}
          completedGames={completedGames}
          onResumeGame={isCoachOrAdmin ? onResumeGame : undefined}
        />

        {/* Tab bar */}
        <div className="tab-bar">
          {TABS.map(t => (
            <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>

        {/* Tab content */}
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
            isAdmin={isAdmin}
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
            isAdmin={isAdmin}
            refresh={refresh}
            onSelectPlayer={openPlayer}
          />
        )}
      </div>

      {/* Drill-down popups */}
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
    </div>
  );
}
