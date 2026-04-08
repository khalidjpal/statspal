import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import StatsStrip from '../components/StatsStrip';
import ScheduleTab from '../components/ScheduleTab';
import StandingsTab from '../components/StandingsTab';
import AveragesTab from '../components/AveragesTab';
import RosterTab from '../components/RosterTab';

const TABS = ['Schedule', 'Standings', 'Averages', 'Roster'];

export default function TeamDashboard({ team, onBack, onSelectGame, onSelectPlayer, onPreGame, onStartLive, onTeamAdmin }) {
  const { currentUser } = useAuth();
  const data = useData();
  const { players, schedule, completedGames, playerGameStats, leagueTeams, leagueResults, refresh } = data;
  const [tab, setTab] = useState('Schedule');

  useEffect(() => { refresh(); }, [refresh]);

  const isAdmin = currentUser?.role === 'admin';
  const isCoachOrAdmin = isAdmin || currentUser?.role === 'coach';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
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
        <StatsStrip
          players={players}
          playerGameStats={playerGameStats}
          completedGames={completedGames}
          teamId={team.id}
          currentUser={currentUser}
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
            onSelectGame={onSelectGame}
            onStartLive={onStartLive}
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
            onSelectPlayer={onSelectPlayer}
          />
        )}
        {tab === 'Roster' && (
          <RosterTab
            team={team}
            players={players}
            isAdmin={isAdmin}
            refresh={refresh}
            onSelectPlayer={onSelectPlayer}
          />
        )}
      </div>
    </div>
  );
}
