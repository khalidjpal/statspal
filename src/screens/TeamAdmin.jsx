import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { supabase } from '../supabase';
import AccountsTab from '../components/AccountsTab';
import EditTeamModal from '../components/modals/EditTeamModal';
import AddPlayerModal from '../components/modals/AddPlayerModal';
import EditPlayerModal from '../components/modals/EditPlayerModal';
import QuickLoginModal from '../components/modals/QuickLoginModal';
import EditAccountModal from '../components/modals/EditAccountModal';
import AddGameModal from '../components/modals/AddGameModal';
import ManualResultModal from '../components/modals/ManualResultModal';
import GodStatsModal from '../components/modals/GodStatsModal';
import { sortByJersey, sortedCompleted, sortedUpcoming } from '../utils/sort';

export default function TeamAdmin({ team, onBack, onExport }) {
  const { currentUser } = useAuth();
  const { accounts, players, schedule, completedGames, playerGameStats, leagueTeams, refresh } = useData();

  const isCoach = currentUser?.role === 'coach';

  const TABS = isCoach
    ? ['Roster', 'Schedule', 'Stats', 'Accounts']
    : ['Accounts', 'Schedule', 'Roster', 'Stats', 'Danger'];

  const [tab, setTab] = useState(isCoach ? 'Roster' : 'Accounts');
  const [showEditTeam, setShowEditTeam] = useState(false);

  // Roster state
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [assignLoginPlayer, setAssignLoginPlayer] = useState(null);
  const [manageAccount, setManageAccount] = useState(null);

  // Schedule state
  const [showAddGame, setShowAddGame] = useState(false);
  const [manualGame, setManualGame] = useState(null);

  // Stats state
  const [editStatsGame, setEditStatsGame] = useState(null);

  useEffect(() => { refresh(); }, [refresh]);

  const myLeagueTeams = (leagueTeams || []).filter(lt => lt.team_id === team.id);
  const teamSchedule = sortedUpcoming(schedule.filter(s => s.team_id === team.id));
  const teamGames = sortedCompleted(completedGames.filter(g => g.team_id === team.id));
  const teamPlayers = sortByJersey(players.filter(p => p.team_id === team.id));

  function playerAccount(playerId) {
    return accounts.find(a => a.player_id === playerId) || null;
  }

  async function deleteScheduleGame(id) {
    if (!confirm('Delete this scheduled game?')) return;
    await supabase.from('schedule').delete().eq('id', id);
    refresh();
  }

  async function deleteCompletedGame(id) {
    if (!confirm('Delete this completed game and all its stats?')) return;
    await supabase.from('player_game_stats').delete().eq('game_id', id);
    await supabase.from('completed_games').delete().eq('id', id);
    refresh();
  }

  async function deletePlayer(id) {
    if (!confirm('Delete this player? This will remove all their stats.')) return;
    await supabase.from('accounts').update({ player_id: null }).eq('player_id', id);
    await supabase.from('player_game_stats').delete().eq('player_id', id);
    await supabase.from('players').delete().eq('id', id);
    refresh();
  }

  async function deleteTeam() {
    if (!confirm('DELETE THIS ENTIRE TEAM? This cannot be undone!')) return;
    if (!confirm('Are you really sure? All games, stats, and players will be lost.')) return;
    await supabase.from('accounts').update({ team_id: null }).eq('team_id', team.id);
    await supabase.from('teams').delete().eq('id', team.id);
    refresh();
    onBack();
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{
        background: `linear-gradient(135deg, ${team.color || '#0d1f5c'}, ${team.color || '#1a3a8f'})`,
        color: '#fff', padding: '16px 20px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            Back
          </button>
          {/* Edit Team and Export are admin-only — coaches manage their team but don't edit its identity */}
          {!isCoach && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowEditTeam(true)} style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                Edit Team
              </button>
              <button onClick={() => onExport(team)} style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                Export
              </button>
            </div>
          )}
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginTop: 8 }}>{team.name} — {isCoach ? 'Team Admin' : 'Admin'}</h1>
      </div>

      <div className="page-wrap">
        <div className="tab-bar">
          {TABS.map(t => (
            <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}
              style={t === 'Danger' ? { color: tab === t ? '#ef4444' : '#8892a4' } : undefined}>
              {t}
            </button>
          ))}
        </div>

        {tab === 'Accounts' && (
          <AccountsTab
            team={team}
            accounts={accounts}
            players={players}
            refresh={refresh}
            hideCoachLogin={isCoach}
          />
        )}

        {tab === 'Schedule' && (
          <div>
            <div style={{ marginBottom: 12 }}>
              <button className="modal-btn-primary" onClick={() => setShowAddGame(true)} style={{ width: '100%' }}>
                + Add Game to Schedule
              </button>
            </div>

            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>Upcoming Games</h3>
            {teamSchedule.map(g => (
              <div key={g.id} className="game-row">
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text)' }}>{g.opponent}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {new Date(g.game_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {g.location}
                  </div>
                </div>
                <button onClick={() => deleteScheduleGame(g.id)}
                  style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                  Delete
                </button>
              </div>
            ))}
            {teamSchedule.length === 0 && <div className="empty-state">No scheduled games</div>}

            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, marginTop: 20, color: 'var(--text)' }}>Completed Games</h3>
            {teamGames.map(g => (
              <div key={g.id} className="game-row">
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text)' }}>{g.opponent}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {g.result} {g.home_sets}-{g.away_sets} · {new Date(g.game_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setManualGame(g)}
                    style={{ background: 'rgba(26,58,143,0.1)', color: 'var(--accent)', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                    Edit
                  </button>
                  <button onClick={() => deleteCompletedGame(g.id)}
                    style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {teamGames.length === 0 && <div className="empty-state">No completed games</div>}
          </div>
        )}

        {tab === 'Roster' && (
          <div>
            <div style={{ marginBottom: 12 }}>
              <button className="modal-btn-primary" onClick={() => setShowAddPlayer(true)} style={{ width: '100%' }}>
                + Add Player
              </button>
            </div>
            {teamPlayers.map(p => {
              const acct = playerAccount(p.id);
              return (
                <div key={p.id} className="game-row" style={{ alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {[p.jersey_number ? `#${p.jersey_number}` : null, p.position, p.height, p.grade].filter(Boolean).join(' · ')}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                      <span style={{
                        width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                        background: acct ? '#3fb950' : '#6b7280',
                        display: 'inline-block',
                      }} />
                      <span style={{ fontSize: 11, color: acct ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                        {acct ? `@${acct.username}` : 'No login'}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => setEditingPlayer(p)}
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--accent)', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => acct ? setManageAccount(acct) : setAssignLoginPlayer(p)}
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: acct ? 'var(--text-muted)' : 'var(--accent)', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: acct ? 400 : 600, cursor: 'pointer' }}
                    >
                      {acct ? 'Login' : 'Assign Login'}
                    </button>
                    <button
                      onClick={() => deletePlayer(p.id)}
                      style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}
                    >
                      Del
                    </button>
                  </div>
                </div>
              );
            })}
            {teamPlayers.length === 0 && <div className="empty-state">No players on roster yet</div>}
          </div>
        )}

        {tab === 'Stats' && (
          <div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
              Select a completed game to edit player stats.
            </p>
            {teamGames.length === 0 && <div className="empty-state">No completed games</div>}
            {teamGames.map(g => (
              <div key={g.id} className="game-row">
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text)' }}>{g.opponent}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {g.result} {g.home_sets}-{g.away_sets} · {new Date(g.game_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
                <button
                  onClick={() => setEditStatsGame(g)}
                  style={{ background: 'rgba(26,58,143,0.1)', color: 'var(--accent)', padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}
                >
                  Edit Stats
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === 'Danger' && (
          <div className="card" style={{ textAlign: 'center' }}>
            <h3 style={{ color: '#ef4444', marginBottom: 8 }}>Danger Zone</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Permanently delete this team and all associated data.
            </p>
            <button onClick={deleteTeam}
              style={{ background: '#ef4444', color: '#fff', padding: '12px 32px', borderRadius: 8, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
              Delete Entire Team
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      {showEditTeam && (
        <EditTeamModal team={team} onClose={() => setShowEditTeam(false)} onSaved={() => { setShowEditTeam(false); refresh(); onBack(); }} />
      )}

      {showAddPlayer && (
        <AddPlayerModal
          teamId={team.id}
          playerCount={teamPlayers.length}
          schoolType={team.school_type || 'high_school'}
          onClose={() => setShowAddPlayer(false)}
          onSaved={() => { setShowAddPlayer(false); refresh(); }}
        />
      )}

      {editingPlayer && (
        <EditPlayerModal
          player={editingPlayer}
          schoolType={team.school_type || 'high_school'}
          onClose={() => setEditingPlayer(null)}
          onSaved={() => { setEditingPlayer(null); refresh(); }}
        />
      )}

      {assignLoginPlayer && (
        <QuickLoginModal
          player={assignLoginPlayer}
          teamId={team.id}
          onClose={() => setAssignLoginPlayer(null)}
          onCreated={() => { setAssignLoginPlayer(null); refresh(); }}
        />
      )}

      {manageAccount && (
        <EditAccountModal
          account={manageAccount}
          onClose={() => setManageAccount(null)}
          onSaved={() => { setManageAccount(null); refresh(); }}
        />
      )}

      {showAddGame && (
        <AddGameModal
          teamId={team.id}
          leagueTeams={myLeagueTeams}
          onClose={() => setShowAddGame(false)}
          onSaved={() => { setShowAddGame(false); refresh(); }}
        />
      )}

      {manualGame && (
        <ManualResultModal
          game={manualGame}
          team={team}
          players={players}
          existingStats={(playerGameStats || []).filter(s => s.game_id === manualGame.id)}
          onClose={() => setManualGame(null)}
          onSaved={() => { setManualGame(null); refresh(); }}
        />
      )}

      {editStatsGame && (
        <GodStatsModal
          game={editStatsGame}
          players={teamPlayers}
          existingStats={(playerGameStats || []).filter(s => s.game_id === editStatsGame.id)}
          onClose={() => setEditStatsGame(null)}
          onSaved={() => { setEditStatsGame(null); refresh(); }}
        />
      )}
    </div>
  );
}
