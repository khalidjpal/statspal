import { useState } from 'react';
import { computeStandings } from '../utils/stats';
import AddLeagueTeamModal from './modals/AddLeagueTeamModal';
import AddResultModal from './modals/AddResultModal';
import EditLeagueTeamModal from './modals/EditLeagueTeamModal';

export default function StandingsTab({ team, leagueTeams, leagueResults, isAdmin, refresh }) {
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [showAddResult, setShowAddResult] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);

  const myLeagueTeams = leagueTeams.filter(lt => lt.team_id === team.id);
  const myLeagueResults = leagueResults.filter(lr => lr.team_id === team.id);
  const standings = computeStandings(myLeagueTeams, myLeagueResults);

  return (
    <div>
      {isAdmin && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button className="modal-btn-primary" onClick={() => setShowAddTeam(true)} style={{ flex: 1 }}>
            + League Team
          </button>
          <button className="modal-btn-primary" onClick={() => setShowAddResult(true)} style={{ flex: 1 }}>
            + Result
          </button>
        </div>
      )}

      {team.league_name && (
        <div style={{ fontSize: 14, fontWeight: 600, color: '#888', marginBottom: 12 }}>
          {team.league_name}
        </div>
      )}

      {standings.length === 0 ? (
        <div className="empty-state">No league teams added yet</div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8f9fa', textAlign: 'left' }}>
                <th style={{ padding: '10px 12px', fontWeight: 600 }}>#</th>
                <th style={{ padding: '10px 12px', fontWeight: 600 }}>Team</th>
                <th style={{ padding: '10px 8px', fontWeight: 600, textAlign: 'center' }}>W</th>
                <th style={{ padding: '10px 8px', fontWeight: 600, textAlign: 'center' }}>L</th>
                <th style={{ padding: '10px 8px', fontWeight: 600, textAlign: 'center' }}>Sets</th>
                {isAdmin && <th style={{ padding: '10px 8px', fontWeight: 600, textAlign: 'center' }}></th>}
              </tr>
            </thead>
            <tbody>
              {standings.map((t, i) => (
                <tr key={t.id} style={{ borderTop: '1px solid #eee', fontWeight: t.is_us ? 700 : 400 }}>
                  <td style={{ padding: '10px 12px' }}>{i + 1}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: t.dot_color, marginRight: 8 }} />
                    <span style={{ color: t.text_color }}>{t.name}</span>
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'center' }}>{t.wins}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'center' }}>{t.losses}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'center' }}>{t.setsWon}-{t.setsLost}</td>
                  {isAdmin && (
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                      <button
                        onClick={() => {
                          const full = myLeagueTeams.find(lt => lt.id === t.id);
                          if (full) setEditingTeam(full);
                        }}
                        style={{ background: '#f0f2f5', color: '#555', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer' }}
                      >
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddTeam && (
        <AddLeagueTeamModal
          teamId={team.id}
          onClose={() => setShowAddTeam(false)}
          onSaved={() => { setShowAddTeam(false); refresh(); }}
        />
      )}
      {showAddResult && (
        <AddResultModal
          teamId={team.id}
          leagueTeams={myLeagueTeams}
          onClose={() => setShowAddResult(false)}
          onSaved={() => { setShowAddResult(false); refresh(); }}
        />
      )}
      {editingTeam && (
        <EditLeagueTeamModal
          leagueTeam={editingTeam}
          onClose={() => setEditingTeam(null)}
          onSaved={() => { setEditingTeam(null); refresh(); }}
        />
      )}
    </div>
  );
}
