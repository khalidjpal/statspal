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
          <button className="modal-btn-primary" onClick={() => setShowAddTeam(true)} style={{ flex: 1 }}>+ League Team</button>
          <button className="modal-btn-primary" onClick={() => setShowAddResult(true)} style={{ flex: 1 }}>+ Result</button>
        </div>
      )}

      {standings.length === 0 ? (
        <div className="empty-state">No league teams added yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {standings.map((t, i) => {
            const total = t.wins + t.losses;
            const pct = total > 0 ? t.wins / total : 0;
            const barColor = t.dot_color || '#58a6ff';
            return (
              <div key={t.id} className="stb-row" style={t.is_us ? { border: `1px solid ${barColor}40`, background: '#0d1117' } : undefined}>
                <div className="stb-rank">{i + 1}</div>
                <div className="stb-info">
                  <div className="stb-name-row">
                    <span className="stb-dot" style={{ background: barColor }} />
                    <span className="stb-name" style={{ color: t.text_color || 'var(--text)', fontWeight: t.is_us ? 700 : 500 }}>{t.name}</span>
                    {isAdmin && (
                      <button className="stb-edit" onClick={() => {
                        const full = myLeagueTeams.find(lt => lt.id === t.id);
                        if (full) setEditingTeam(full);
                      }}>Edit</button>
                    )}
                  </div>
                  <div className="stb-bar-track">
                    <div className="stb-bar-fill" style={{
                      width: `${Math.max(pct * 100, 2)}%`,
                      background: `linear-gradient(90deg, ${barColor}, ${barColor}80)`,
                      boxShadow: pct > 0 ? `0 0 12px ${barColor}30` : 'none',
                    }} />
                  </div>
                  <div className="stb-stats">
                    <span><b>{t.wins}</b>W</span>
                    <span><b>{t.losses}</b>L</span>
                    <span className="stb-sets">{t.setsWon}-{t.setsLost} sets</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAddTeam && <AddLeagueTeamModal teamId={team.id} onClose={() => setShowAddTeam(false)} onSaved={() => { setShowAddTeam(false); refresh(); }} />}
      {showAddResult && <AddResultModal teamId={team.id} leagueTeams={myLeagueTeams} onClose={() => setShowAddResult(false)} onSaved={() => { setShowAddResult(false); refresh(); }} />}
      {editingTeam && <EditLeagueTeamModal leagueTeam={editingTeam} onClose={() => setEditingTeam(null)} onSaved={() => { setEditingTeam(null); refresh(); }} />}
    </div>
  );
}
