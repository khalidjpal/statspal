import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import { supabase } from '../supabase';
import { levelsFor } from '../utils/schoolType';
import AccountsTab from '../components/AccountsTab';
import AddPlayerModal from '../components/modals/AddPlayerModal';
import EditPlayerModal from '../components/modals/EditPlayerModal';
import QuickLoginModal from '../components/modals/QuickLoginModal';
import EditAccountModal from '../components/modals/EditAccountModal';
import AddGameModal from '../components/modals/AddGameModal';
import ManualResultModal from '../components/modals/ManualResultModal';
import GodStatsModal from '../components/modals/GodStatsModal';
import { sortByJersey, sortedCompleted, sortedUpcoming } from '../utils/sort';

export default function TeamDetails({ team, onBack, onExport }) {
  const { currentUser } = useAuth();
  const { accounts, players, schedule, completedGames, playerGameStats, leagueTeams, refresh } = useData();
  const { addToast } = useToast();

  const isCoach = currentUser?.role === 'coach';

  const TABS = isCoach
    ? ['Roster', 'Schedule', 'Team Info', 'Stats', 'Accounts']
    : ['Team Info', 'Roster', 'Schedule', 'Stats', 'Accounts', 'Danger'];

  const [tab, setTab] = useState(isCoach ? 'Roster' : 'Team Info');

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

  // Team Info form state — mirrors the old EditTeamModal
  const [name, setName]             = useState(team.name || '');
  const [gender, setGender]         = useState(team.gender || 'Girls');
  const [schoolType, setSchoolType] = useState(team.school_type || 'high_school');
  const [level, setLevel]           = useState(team.level || 'Varsity');
  const [color, setColor]           = useState(team.color || '#1a3a8f');
  const [season, setSeason]         = useState(team.season || '2025-26');
  const [leagueName, setLeagueName] = useState(team.league_name || '');
  const [savingInfo, setSavingInfo] = useState(false);

  useEffect(() => { refresh(); }, [refresh]);

  const levels = levelsFor(schoolType);

  function handleSchoolTypeChange(val) {
    setSchoolType(val);
    const newLevels = levelsFor(val);
    if (!newLevels.includes(level)) setLevel(newLevels[0]);
  }

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

  async function saveTeamInfo() {
    if (!name.trim()) return;
    setSavingInfo(true);
    const payload = {
      name: name.trim(),
      gender,
      level,
      color,
      season,
      league_name: leagueName.trim() || null,
      school_type: schoolType,
    };
    let { error } = await supabase.from('teams').update(payload).eq('id', team.id);
    if (error && error.message?.includes('school_type')) {
      const { school_type: _st, ...rest } = payload;
      const res = await supabase.from('teams').update(rest).eq('id', team.id);
      error = res.error;
    }
    setSavingInfo(false);
    if (error) {
      addToast('Failed to save: ' + error.message);
    } else {
      addToast('Team info saved', 'success');
      refresh();
    }
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
          {!isCoach && onExport && (
            <button onClick={() => onExport(team)} style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
              Export
            </button>
          )}
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginTop: 8 }}>{team.name} — Team Details</h1>
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

        {tab === 'Team Info' && (
          <div className="card" style={{ maxWidth: 520 }}>
            <label>Team Name</label>
            <input value={name} onChange={e => setName(e.target.value)} />

            <label>School Type</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {[
                { val: 'high_school',   label: 'High School' },
                { val: 'middle_school', label: 'Middle School' },
              ].map(opt => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => handleSchoolTypeChange(opt.val)}
                  style={{
                    flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    border: schoolType === opt.val ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: schoolType === opt.val ? 'var(--accent)' : 'var(--surface)',
                    color: schoolType === opt.val ? '#fff' : 'var(--text)',
                    cursor: 'pointer',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <label>Gender</label>
            <select value={gender} onChange={e => setGender(e.target.value)}>
              <option>Girls</option>
              <option>Boys</option>
              <option>Coed</option>
            </select>

            <label>Level</label>
            <select value={level} onChange={e => setLevel(e.target.value)}>
              {levels.map(l => <option key={l}>{l}</option>)}
            </select>

            <label>Team Color</label>
            <input type="color" value={color} onChange={e => setColor(e.target.value)} />

            <label>Season</label>
            <input value={season} onChange={e => setSeason(e.target.value)} />

            <label>League Name</label>
            <input value={leagueName} onChange={e => setLeagueName(e.target.value)} />

            <button
              className="modal-btn-primary"
              onClick={saveTeamInfo}
              disabled={savingInfo || !name.trim()}
              style={{ width: '100%', marginTop: 16 }}
            >
              {savingInfo ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}

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
