import { useState, useEffect } from 'react';
import { useData } from '../contexts/DataContext';
import { supabase } from '../supabase';
import AccountsTab from '../components/AccountsTab';
import EditTeamModal from '../components/modals/EditTeamModal';
import { sortByJersey, sortedCompleted, sortedUpcoming } from '../utils/sort';

const TABS = ['Accounts', 'Schedule', 'Players', 'Danger'];

export default function TeamAdmin({ team, onBack, onExport }) {
  const { accounts, players, schedule, completedGames, playerGameStats, refresh } = useData();
  const [tab, setTab] = useState('Accounts');
  const [showEditTeam, setShowEditTeam] = useState(false);

  useEffect(() => { refresh(); }, [refresh]);

  const teamSchedule = sortedUpcoming(schedule.filter(s => s.team_id === team.id));
  const teamGames = sortedCompleted(completedGames.filter(g => g.team_id === team.id));
  const teamPlayers = sortByJersey(players.filter(p => p.team_id === team.id));

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
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowEditTeam(true)} style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
              Edit Team
            </button>
            <button onClick={() => onExport(team)} style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
              Export
            </button>
          </div>
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginTop: 8 }}>{team.name} — Admin</h1>
      </div>

      <div style={{ padding: '16px 20px', maxWidth: 800, margin: '0 auto' }}>
        <div className="tab-bar">
          {TABS.map(t => (
            <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}
              style={t === 'Danger' ? { color: tab === t ? '#ef4444' : '#8892a4' } : undefined}>
              {t}
            </button>
          ))}
        </div>

        {tab === 'Accounts' && (
          <AccountsTab team={team} accounts={accounts} players={players} refresh={refresh} />
        )}

        {tab === 'Schedule' && (
          <div>
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
                <button onClick={() => deleteCompletedGame(g.id)}
                  style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                  Delete
                </button>
              </div>
            ))}
            {teamGames.length === 0 && <div className="empty-state">No completed games</div>}
          </div>
        )}

        {tab === 'Players' && (
          <div>
            {teamPlayers.map(p => (
              <div key={p.id} className="game-row">
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text)' }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {[p.jersey_number ? `#${p.jersey_number}` : null, p.position].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <button onClick={() => deletePlayer(p.id)}
                  style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                  Delete
                </button>
              </div>
            ))}
            {teamPlayers.length === 0 && <div className="empty-state">No players</div>}
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

      {showEditTeam && (
        <EditTeamModal team={team} onClose={() => setShowEditTeam(false)} onSaved={() => { setShowEditTeam(false); refresh(); onBack(); }} />
      )}
    </div>
  );
}
