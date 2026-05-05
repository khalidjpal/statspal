import { useState, useEffect, useMemo } from 'react';
import { useData } from '../contexts/DataContext';
import { useToast } from '../contexts/ToastContext';
import { supabase } from '../supabase';
import { hpct, n3, hcol, teamRecord } from '../utils/stats';
import { sortByJersey, sortedCompleted } from '../utils/sort';
import { levelsFor } from '../utils/schoolType';
import PlayerBadge from '../components/PlayerBadge';
import { IconUsers, IconCalendar, IconChart, IconClipboard, IconArrowRight, IconArrowLeft } from '../components/Icons';
import GodStatsModal from '../components/modals/GodStatsModal';
import AddPlayerModal from '../components/modals/AddPlayerModal';
import EditPlayerModal from '../components/modals/EditPlayerModal';
import ManualResultModal from '../components/modals/ManualResultModal';
import EditLeagueResultModal from '../components/modals/EditLeagueResultModal';

const SPORT = 'Volleyball';

const SECTIONS = [
  { id: 'roster',   label: 'Roster',    Icon: IconUsers },
  { id: 'schedule', label: 'Schedule',  Icon: IconCalendar },
  { id: 'stats',    label: 'Stats',     Icon: IconChart },
  { id: 'coaches',  label: 'Coaches',   Icon: IconClipboard },
  { id: 'info',     label: 'Team Info', Icon: IconClipboard },
];

function teamInitials(name) {
  if (!name) return '?';
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export default function GodMode({ onBack }) {
  const data = useData();
  const { teams, refresh } = data;
  const { addToast } = useToast();

  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [systemView, setSystemView] = useState(null); // 'accounts' | 'league' | null
  const [section, setSection] = useState('roster');

  useEffect(() => { refresh(); }, [refresh]);

  const selectedTeam = teams.find(t => t.id === selectedTeamId) || null;

  // Quick add team (used on the picker view)
  const [newTeam, setNewTeam] = useState('');
  async function addTeam() {
    if (!newTeam.trim()) return;
    const r = await supabase.from('teams').insert({ name: newTeam.trim() });
    if (r.error) addToast('Failed to add team: ' + r.error.message);
    else addToast('Team added', 'success');
    setNewTeam('');
    await refresh();
  }

  // ── SYSTEM PANEL ────────────────────────────────────────
  if (systemView) {
    return (
      <SystemPanel
        view={systemView}
        onChangeView={setSystemView}
        onBack={() => setSystemView(null)}
        data={data}
        addToast={addToast}
      />
    );
  }

  // ── PICKER ──────────────────────────────────────────────
  if (!selectedTeam) {
    return (
      <div className="god-page">
        <GodHeader onBack={onBack} title="God Mode" subtitle="Pick a team to manage" />

        <div className="god-body">
          <div className="god-quickadd">
            <input
              value={newTeam}
              onChange={e => setNewTeam(e.target.value)}
              placeholder="Add a new team…"
              onKeyDown={e => e.key === 'Enter' && addTeam()}
              className="god-quickadd-input"
            />
            <button onClick={addTeam} className="god-btn-primary">+ Add Team</button>
          </div>

          {teams.length === 0 ? (
            <div className="god-empty">No teams yet. Add one above.</div>
          ) : (
            <div className="god-team-grid">
              {teams.map(t => (
                <TeamCard
                  key={t.id}
                  team={t}
                  data={data}
                  onSelect={() => { setSelectedTeamId(t.id); setSection('roster'); }}
                />
              ))}
            </div>
          )}

          <div className="god-system-bar">
            <button className="god-system-btn" onClick={() => setSystemView('accounts')}>
              Accounts <IconArrowRight size={12} />
            </button>
            <button className="god-system-btn" onClick={() => setSystemView('league')}>
              League Results <IconArrowRight size={12} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── PER-TEAM WORKSPACE ──────────────────────────────────
  return (
    <div className="god-page">
      <GodHeader
        onBack={() => setSelectedTeamId(null)}
        backLabel="Teams"
        title={selectedTeam.name}
        subtitle={[SPORT, selectedTeam.season].filter(Boolean).join(' · ')}
        accentColor={selectedTeam.color}
      />

      <div className="god-workspace">
        <aside className="god-sidebar">
          {SECTIONS.map(s => {
            const Icon = s.Icon;
            return (
              <button
                key={s.id}
                className={`god-side-btn${section === s.id ? ' active' : ''}`}
                onClick={() => setSection(s.id)}
              >
                <span className="god-side-icon"><Icon size={16} /></span>
                <span className="god-side-label">{s.label}</span>
              </button>
            );
          })}
        </aside>

        <main className="god-main">
          {section === 'roster'   && <RosterSection   team={selectedTeam} data={data} addToast={addToast} />}
          {section === 'schedule' && <ScheduleSection team={selectedTeam} data={data} addToast={addToast} />}
          {section === 'stats'    && <StatsSection    team={selectedTeam} data={data} addToast={addToast} />}
          {section === 'coaches'  && <CoachesSection  team={selectedTeam} data={data} addToast={addToast} />}
          {section === 'info'     && <TeamInfoSection team={selectedTeam} data={data} addToast={addToast} />}
        </main>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Header
// ──────────────────────────────────────────────────────────
function GodHeader({ onBack, backLabel = 'Back', title, subtitle, accentColor }) {
  const tcStyle = accentColor ? { '--god-tc': accentColor } : {};
  return (
    <header className="god-header" style={tcStyle}>
      <div className="god-header-glow" aria-hidden="true" />
      <div className="god-header-grid" aria-hidden="true" />
      <div className="god-header-inner">
        <button className="god-back" onClick={onBack}>
          <IconArrowLeft size={13} /> {backLabel}
        </button>
        <div className="god-header-title-block">
          <span className="god-header-eyebrow">God Mode</span>
          <h1 className="god-header-title">{title}</h1>
          {subtitle && <div className="god-header-sub">{subtitle}</div>}
        </div>
      </div>
    </header>
  );
}

// ──────────────────────────────────────────────────────────
// Team card on the landing
// ──────────────────────────────────────────────────────────
function TeamCard({ team, data, onSelect }) {
  const { players, completedGames, schedule, accounts, coachAssignments } = data;
  const playerCount = players.filter(p => p.team_id === team.id).length;
  const gameCount = completedGames.filter(g => g.team_id === team.id).length
                   + schedule.filter(s => s.team_id === team.id).length;
  const record = teamRecord(completedGames.filter(g => g.team_id === team.id));

  // Coaches for this team — direct via accounts.team_id and via coach_team_assignments
  const coachIds = new Set([
    ...accounts.filter(a => a.role === 'coach' && a.team_id === team.id).map(a => a.id),
    ...coachAssignments.filter(ca => ca.team_id === team.id).map(ca => ca.account_id),
  ]);
  const coachNames = accounts.filter(a => coachIds.has(a.id)).map(a => a.name || a.username);
  const color = team.color || '#bc8cff';

  return (
    <button type="button" className="god-team-card" style={{ '--god-tc': color }} onClick={onSelect}>
      <div className="god-team-card-glow" aria-hidden="true" />
      <div className="god-team-card-grid" aria-hidden="true" />
      <div className="god-team-card-inner">
        <div className="god-team-card-top">
          <span className="god-team-card-sport">{SPORT}</span>
          {team.season && <span className="god-team-card-season">{team.season}</span>}
        </div>

        <div className="god-team-card-mid">
          <div className="god-team-card-logo" style={{ background: color }}>
            {teamInitials(team.name)}
          </div>
          <div className="god-team-card-id">
            <div className="god-team-card-name">{team.name}</div>
            {[team.gender, team.level].filter(Boolean).join(' · ') && (
              <div className="god-team-card-meta">{[team.gender, team.level].filter(Boolean).join(' · ')}</div>
            )}
          </div>
        </div>

        <div className="god-team-card-stats">
          <div className="god-team-card-stat">
            <div className="god-team-card-stat-val">{playerCount}</div>
            <div className="god-team-card-stat-lbl">Players</div>
          </div>
          <div className="god-team-card-stat">
            <div className="god-team-card-stat-val">{gameCount}</div>
            <div className="god-team-card-stat-lbl">Games</div>
          </div>
          <div className="god-team-card-stat">
            <div className="god-team-card-stat-val god-team-card-rec">
              <span style={{ color }}>{record.w}</span>
              <span className="god-team-card-rec-dash">–</span>
              <span className="god-team-card-rec-l">{record.l}</span>
            </div>
            <div className="god-team-card-stat-lbl">Record</div>
          </div>
        </div>

        <div className="god-team-card-bottom">
          <div className="god-team-card-coaches">
            <span className="god-team-card-coaches-lbl">Coach{coachNames.length > 1 ? 'es' : ''}</span>
            <span className="god-team-card-coaches-val">
              {coachNames.length > 0 ? coachNames.join(', ') : '—'}
            </span>
          </div>
          <span className="god-team-card-cta">
            Manage <IconArrowRight size={13} />
          </span>
        </div>
      </div>
    </button>
  );
}

// ──────────────────────────────────────────────────────────
// Roster section — add/edit/remove players
// ──────────────────────────────────────────────────────────
function RosterSection({ team, data, addToast }) {
  const { players, refresh } = data;
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);

  const teamPlayers = sortByJersey(players.filter(p => p.team_id === team.id));

  async function deletePlayer(p) {
    if (!confirm(`Delete ${p.name}? This also deletes all their stats.`)) return;
    await supabase.from('player_game_stats').delete().eq('player_id', p.id);
    const r = await supabase.from('players').delete().eq('id', p.id);
    if (r.error) addToast('Failed: ' + r.error.message);
    else addToast('Player deleted', 'success');
    await refresh();
  }

  return (
    <SectionShell
      title="Roster"
      count={teamPlayers.length}
      action={<button className="god-btn-primary" onClick={() => setAdding(true)}>+ Add Player</button>}
    >
      {teamPlayers.length === 0 ? (
        <div className="god-empty-row">No players yet — click Add Player to start.</div>
      ) : (
        <div className="god-list">
          {teamPlayers.map(p => (
            <div key={p.id} className="god-row">
              <PlayerBadge player={p} team={team} size={34} />
              <div className="god-row-id">
                <div className="god-row-name">{p.name}</div>
                <div className="god-row-meta">
                  {[p.jersey_number ? `#${p.jersey_number}` : null, p.position, p.grade, p.height].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div className="god-row-actions">
                <button className="god-btn-secondary" onClick={() => setEditing(p)}>Edit</button>
                <button className="god-btn-danger" onClick={() => deletePlayer(p)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <AddPlayerModal
          teamId={team.id}
          playerCount={teamPlayers.length}
          schoolType={team.school_type || 'high_school'}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); refresh(); }}
        />
      )}
      {editing && (
        <EditPlayerModal
          player={editing}
          schoolType={team.school_type || 'high_school'}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
        />
      )}
    </SectionShell>
  );
}

// ──────────────────────────────────────────────────────────
// Schedule section — completed + scheduled, with manual scoring
// ──────────────────────────────────────────────────────────
function ScheduleSection({ team, data, addToast }) {
  const { completedGames, schedule, players, playerGameStats, refresh } = data;
  const [editGame, setEditGame] = useState(null);

  // Quick-add fields for scheduled (upcoming) games
  const [opp, setOpp] = useState('');
  const [date, setDate] = useState('');
  const [loc, setLoc] = useState('Home');

  const teamCompleted = useMemo(
    () => sortedCompleted(completedGames.filter(g => g.team_id === team.id)),
    [completedGames, team.id]
  );
  const teamScheduled = useMemo(
    () => schedule.filter(s => s.team_id === team.id).slice().sort((a, b) => (a.game_date || '').localeCompare(b.game_date || '')),
    [schedule, team.id]
  );

  async function addScheduled() {
    if (!opp.trim() || !date) return;
    const r = await supabase.from('schedule').insert({
      team_id: team.id, opponent: opp.trim(), game_date: date, location: loc,
    });
    if (r.error) addToast('Failed: ' + r.error.message); else addToast('Game added', 'success');
    setOpp(''); setDate('');
    await refresh();
  }

  async function deleteScheduled(g) {
    if (!confirm(`Remove ${g.opponent} from schedule?`)) return;
    const r = await supabase.from('schedule').delete().eq('id', g.id);
    if (r.error) addToast('Failed: ' + r.error.message); else addToast('Removed', 'success');
    await refresh();
  }

  async function deleteCompleted(g) {
    if (!confirm('Delete game? This also deletes all player stats for this game.')) return;
    await supabase.from('player_game_stats').delete().eq('game_id', g.id);
    if (g.is_league && g.league_team_id) {
      await supabase.from('league_results').delete()
        .eq('team_id', g.team_id).eq('game_date', g.game_date)
        .or(`home_league_team_id.eq.${g.league_team_id},away_league_team_id.eq.${g.league_team_id}`);
    }
    const r = await supabase.from('completed_games').delete().eq('id', g.id);
    if (r.error) addToast('Failed: ' + r.error.message); else addToast('Game deleted', 'success');
    await refresh();
  }

  // Promote a scheduled row → completed_games via the manual-result modal.
  async function logScheduled(g) {
    const payload = { team_id: team.id, opponent: g.opponent, game_date: g.game_date, location: g.location || 'Home' };
    if (g.is_league) { payload.is_league = true; payload.league_team_id = g.league_team_id || null; }
    let { data: created, error } = await supabase.from('completed_games').insert(payload).select().single();
    if (error) {
      const r = await supabase.from('completed_games').insert({ team_id: team.id, opponent: g.opponent, game_date: g.game_date, location: g.location || 'Home' }).select().single();
      created = r.data; error = r.error;
    }
    if (error) { addToast('Failed: ' + error.message); return; }
    await supabase.from('schedule').delete().eq('id', g.id);
    await refresh();
    setEditGame(created);
  }

  return (
    <SectionShell
      title="Schedule"
      count={teamCompleted.length + teamScheduled.length}
    >
      <div className="god-quickadd god-quickadd-grid">
        <input className="god-quickadd-input" placeholder="Opponent" value={opp} onChange={e => setOpp(e.target.value)} />
        <input className="god-quickadd-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
        <select className="god-quickadd-input" value={loc} onChange={e => setLoc(e.target.value)}>
          <option value="Home">Home</option>
          <option value="Away">Away</option>
        </select>
        <button className="god-btn-primary" onClick={addScheduled}>+ Add Game</button>
      </div>

      <div className="god-subsection-label">Upcoming ({teamScheduled.length})</div>
      {teamScheduled.length === 0 ? (
        <div className="god-empty-row">No upcoming games.</div>
      ) : (
        <div className="god-list">
          {teamScheduled.map(g => (
            <div key={g.id} className="god-row">
              <div className="god-row-id">
                <div className="god-row-name">vs {g.opponent}</div>
                <div className="god-row-meta">{g.game_date} · {g.location || 'Home'}{g.is_league ? ' · League' : ''}</div>
              </div>
              <div className="god-row-actions">
                <button className="god-btn-secondary" onClick={() => logScheduled(g)}>Log Result</button>
                <button className="god-btn-danger" onClick={() => deleteScheduled(g)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="god-subsection-label">Completed ({teamCompleted.length})</div>
      {teamCompleted.length === 0 ? (
        <div className="god-empty-row">No completed games yet.</div>
      ) : (
        <div className="god-list">
          {teamCompleted.map(g => (
            <div key={g.id} className="god-row">
              <div className="god-row-id">
                <div className="god-row-name">vs {g.opponent}</div>
                <div className="god-row-meta">
                  {g.game_date} · {g.result} {g.home_sets}–{g.away_sets}
                  {g.is_league ? ' · League' : ''}
                </div>
              </div>
              <div className="god-row-actions">
                <button className="god-btn-secondary" onClick={() => setEditGame(g)}>Edit</button>
                <button className="god-btn-danger" onClick={() => deleteCompleted(g)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editGame && (
        <ManualResultModal
          game={editGame}
          team={team}
          players={players}
          existingStats={playerGameStats.filter(s => s.game_id === editGame.id)}
          onClose={() => setEditGame(null)}
          onSaved={() => { setEditGame(null); refresh(); }}
        />
      )}
    </SectionShell>
  );
}

// ──────────────────────────────────────────────────────────
// Stats — per-game stat editing
// ──────────────────────────────────────────────────────────
function StatsSection({ team, data, addToast: _addToast }) {
  const { completedGames, players, playerGameStats, refresh } = data;
  const [editStatsGame, setEditStatsGame] = useState(null);

  const teamGames = useMemo(
    () => sortedCompleted(completedGames.filter(g => g.team_id === team.id)),
    [completedGames, team.id]
  );

  return (
    <SectionShell title="Stats" count={teamGames.length}>
      {teamGames.length === 0 ? (
        <div className="god-empty-row">No completed games yet — log one in the Schedule section.</div>
      ) : (
        <div className="god-list">
          {teamGames.map(g => {
            const gameStats = playerGameStats.filter(s => s.game_id === g.id);
            return (
              <div key={g.id} className="god-stats-card">
                <div className="god-stats-card-head">
                  <div className="god-row-id">
                    <div className="god-row-name">vs {g.opponent}</div>
                    <div className="god-row-meta">{g.game_date} · {g.result} {g.home_sets}–{g.away_sets}</div>
                  </div>
                  <button className="god-btn-secondary" onClick={() => setEditStatsGame(g)}>Edit Stats</button>
                </div>
                {gameStats.length === 0 ? (
                  <div className="god-stats-empty">No stats logged for this game.</div>
                ) : (
                  <div className="god-stats-rows">
                    {gameStats.map(s => {
                      const p = players.find(p => p.id === s.player_id);
                      return (
                        <div key={s.id} className="god-stats-row">
                          <span className="god-stats-name">{p?.name || 'Unknown'}</span>
                          <span className="god-stats-numbers">
                            {s.kills}K {s.aces}A {s.digs}D {s.assists}AST {s.blocks}B {s.errors}E
                            <span style={{ color: hcol(s.kills, s.errors, s.attempts), fontWeight: 600, marginLeft: 8 }}>
                              {n3(hpct(s.kills, s.errors, s.attempts))}
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editStatsGame && (
        <GodStatsModal
          game={editStatsGame}
          players={players}
          existingStats={playerGameStats.filter(s => s.game_id === editStatsGame.id)}
          onClose={() => setEditStatsGame(null)}
          onSaved={() => { setEditStatsGame(null); refresh(); }}
        />
      )}
    </SectionShell>
  );
}

// ──────────────────────────────────────────────────────────
// Coaches — manage assignments for THIS team only
// ──────────────────────────────────────────────────────────
function CoachesSection({ team, data, addToast }) {
  const { accounts, coachAssignments, refresh } = data;

  const directIds = accounts.filter(a => a.role === 'coach' && a.team_id === team.id).map(a => a.id);
  const assignedIds = coachAssignments.filter(ca => ca.team_id === team.id).map(ca => ca.account_id);
  const assignedSet = new Set([...directIds, ...assignedIds]);
  const teamCoaches = accounts.filter(a => assignedSet.has(a.id));
  const otherCoaches = accounts.filter(a => a.role === 'coach' && !assignedSet.has(a.id));

  async function assignCoach(accountId) {
    if (!accountId) return;
    const { error } = await supabase.from('coach_team_assignments').insert({ account_id: accountId, team_id: team.id });
    if (error) {
      if (error.message.includes('duplicate')) addToast('Already assigned');
      else addToast('Failed: ' + error.message);
    } else {
      addToast('Coach assigned', 'success');
    }
    await refresh();
  }

  async function removeCoach(acc) {
    if (!confirm(`Remove ${acc.name} from ${team.name}?`)) return;
    await supabase.from('coach_team_assignments').delete()
      .eq('account_id', acc.id).eq('team_id', team.id);
    if (acc.team_id === team.id) {
      await supabase.from('accounts').update({ team_id: null }).eq('id', acc.id);
    }
    addToast('Coach removed', 'success');
    await refresh();
  }

  return (
    <SectionShell title="Coaches" count={teamCoaches.length}>
      {teamCoaches.length === 0 ? (
        <div className="god-empty-row">No coaches assigned to this team yet.</div>
      ) : (
        <div className="god-list">
          {teamCoaches.map(acc => (
            <div key={acc.id} className="god-row">
              <div className="god-coach-avatar">{(acc.name || acc.username).charAt(0).toUpperCase()}</div>
              <div className="god-row-id">
                <div className="god-row-name">{acc.name}</div>
                <div className="god-row-meta">@{acc.username} · Coach</div>
              </div>
              <div className="god-row-actions">
                <button className="god-btn-danger" onClick={() => removeCoach(acc)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="god-subsection-label">Add an existing coach</div>
      {otherCoaches.length === 0 ? (
        <div className="god-empty-row">All coach accounts are already assigned. Create one in the Accounts panel.</div>
      ) : (
        <select
          className="god-quickadd-input"
          value=""
          onChange={(e) => { const v = e.target.value; if (v) assignCoach(v); }}
        >
          <option value="">+ Assign a coach…</option>
          {otherCoaches.map(c => (
            <option key={c.id} value={c.id}>{c.name} (@{c.username})</option>
          ))}
        </select>
      )}
    </SectionShell>
  );
}

// ──────────────────────────────────────────────────────────
// Team Info — name, sport (read-only), season, level, etc.
// ──────────────────────────────────────────────────────────
function TeamInfoSection({ team, data, addToast }) {
  const { refresh } = data;

  const [name, setName] = useState(team.name || '');
  const [gender, setGender] = useState(team.gender || 'Girls');
  const [schoolType, setSchoolType] = useState(team.school_type || 'high_school');
  const [level, setLevel] = useState(team.level || 'Varsity');
  const [season, setSeason] = useState(team.season || '');
  const [color, setColor] = useState(team.color || '#bc8cff');
  const [leagueName, setLeagueName] = useState(team.league_name || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(team.name || '');
    setGender(team.gender || 'Girls');
    setSchoolType(team.school_type || 'high_school');
    setLevel(team.level || 'Varsity');
    setSeason(team.season || '');
    setColor(team.color || '#bc8cff');
    setLeagueName(team.league_name || '');
  }, [team]);

  const levels = levelsFor(schoolType);

  function handleSchoolTypeChange(val) {
    setSchoolType(val);
    const next = levelsFor(val);
    if (!next.includes(level)) setLevel(next[0]);
  }

  async function save() {
    if (!name.trim()) { addToast('Name is required'); return; }
    setSaving(true);
    const r = await supabase.from('teams').update({
      name: name.trim(),
      gender,
      school_type: schoolType,
      level,
      season: season || null,
      color,
      league_name: leagueName || null,
    }).eq('id', team.id);
    setSaving(false);
    if (r.error) addToast('Failed: ' + r.error.message);
    else addToast('Team info saved', 'success');
    await refresh();
  }

  async function deleteTeam() {
    if (!confirm(`Delete ${team.name}? This is permanent and removes all players, games, and stats.`)) return;
    const r = await supabase.from('teams').delete().eq('id', team.id);
    if (r.error) { addToast('Failed: ' + r.error.message); return; }
    addToast('Team deleted', 'success');
    await refresh();
  }

  return (
    <SectionShell title="Team Info">
      <div className="god-form">
        <Field label="Team Name">
          <input className="god-quickadd-input" value={name} onChange={e => setName(e.target.value)} />
        </Field>
        <Field label="Sport">
          <input className="god-quickadd-input" value={SPORT} disabled />
        </Field>
        <Field label="Season">
          <input className="god-quickadd-input" value={season} onChange={e => setSeason(e.target.value)} placeholder="e.g. 2025-26" />
        </Field>
        <Field label="Gender">
          <select className="god-quickadd-input" value={gender} onChange={e => setGender(e.target.value)}>
            <option>Girls</option>
            <option>Boys</option>
            <option>Coed</option>
          </select>
        </Field>
        <Field label="School Type">
          <select className="god-quickadd-input" value={schoolType} onChange={e => handleSchoolTypeChange(e.target.value)}>
            <option value="high_school">High School</option>
            <option value="middle_school">Middle School</option>
            <option value="club">Club</option>
          </select>
        </Field>
        <Field label="Level">
          <select className="god-quickadd-input" value={level} onChange={e => setLevel(e.target.value)}>
            {levels.map(l => <option key={l}>{l}</option>)}
          </select>
        </Field>
        <Field label="League Name">
          <input className="god-quickadd-input" value={leagueName} onChange={e => setLeagueName(e.target.value)} placeholder="e.g. PNW Conference" />
        </Field>
        <Field label="Team Color">
          <input className="god-quickadd-input god-color" type="color" value={color} onChange={e => setColor(e.target.value)} />
        </Field>
      </div>

      <div className="god-form-actions">
        <button className="god-btn-primary" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        <button className="god-btn-danger god-btn-danger-block" onClick={deleteTeam}>Delete Team</button>
      </div>
    </SectionShell>
  );
}

function Field({ label, children }) {
  return (
    <label className="god-field">
      <span className="god-field-lbl">{label}</span>
      {children}
    </label>
  );
}

// ──────────────────────────────────────────────────────────
// SectionShell — common header + container for each tab
// ──────────────────────────────────────────────────────────
function SectionShell({ title, count, action, children }) {
  return (
    <section className="god-section">
      <header className="god-section-head">
        <div className="god-section-title-block">
          <span className="god-section-title">{title}</span>
          {count != null && <span className="god-section-count">{count}</span>}
        </div>
        {action}
      </header>
      <div className="god-section-body">{children}</div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────
// SystemPanel — admin-only tools that don't belong to a team
// ──────────────────────────────────────────────────────────
function SystemPanel({ view, onChangeView, onBack, data, addToast }) {
  return (
    <div className="god-page">
      <GodHeader onBack={onBack} backLabel="Teams" title="System" subtitle="Admin tools" />

      <div className="god-workspace">
        <aside className="god-sidebar">
          <button
            className={`god-side-btn${view === 'accounts' ? ' active' : ''}`}
            onClick={() => onChangeView('accounts')}
          >
            <span className="god-side-icon"><IconUsers size={16} /></span>
            <span className="god-side-label">Accounts</span>
          </button>
          <button
            className={`god-side-btn${view === 'league' ? ' active' : ''}`}
            onClick={() => onChangeView('league')}
          >
            <span className="god-side-icon"><IconClipboard size={16} /></span>
            <span className="god-side-label">League Results</span>
          </button>
        </aside>
        <main className="god-main">
          {view === 'accounts' && <AccountsAdmin data={data} addToast={addToast} />}
          {view === 'league'   && <LeagueAdmin   data={data} addToast={addToast} />}
        </main>
      </div>
    </div>
  );
}

function AccountsAdmin({ data, addToast }) {
  const { accounts, teams, coachAssignments, refresh } = data;

  const [name, setName] = useState('');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [role, setRole] = useState('admin');
  const [teamId, setTeamId] = useState('');
  const [err, setErr] = useState('');
  const [creds, setCreds] = useState(null);

  async function create() {
    if (!name.trim() || !user.trim() || !pass.trim()) { setErr('All fields required'); return; }
    setErr('');
    const { error } = await supabase.from('accounts').insert({
      name: name.trim(), username: user.trim(), password_plain: pass.trim(),
      role, team_id: teamId || null, active: true,
    });
    if (error) { setErr(error.message.includes('duplicate') ? 'Username taken' : error.message); return; }
    setCreds({ name: name.trim(), username: user.trim(), password: pass.trim(), role });
    setName(''); setUser(''); setPass('');
    refresh();
  }

  return (
    <SectionShell title="Accounts" count={accounts.length}>
      {creds && (
        <div className="god-cred-card">
          <div className="god-cred-title">Account Created</div>
          <div className="god-cred-row"><strong>Name:</strong> {creds.name}</div>
          <div className="god-cred-row"><strong>Username:</strong> {creds.username}</div>
          <div className="god-cred-row"><strong>Password:</strong> {creds.password}</div>
          <div className="god-cred-row"><strong>Role:</strong> {creds.role}</div>
          <button className="god-btn-secondary" onClick={() => setCreds(null)}>Dismiss</button>
        </div>
      )}

      <div className="god-form">
        <Field label="Name">
          <input className="god-quickadd-input" value={name} onChange={e => setName(e.target.value)} />
        </Field>
        <Field label="Username">
          <input className="god-quickadd-input" value={user} onChange={e => setUser(e.target.value)} />
        </Field>
        <Field label="Password">
          <input className="god-quickadd-input" type="text" value={pass} onChange={e => setPass(e.target.value)} />
        </Field>
        <Field label="Role">
          <select className="god-quickadd-input" value={role} onChange={e => setRole(e.target.value)}>
            <option value="admin">Admin</option>
            <option value="coach">Coach</option>
          </select>
        </Field>
        {role === 'coach' && (
          <Field label="Team">
            <select className="god-quickadd-input" value={teamId} onChange={e => setTeamId(e.target.value)}>
              <option value="">No team</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        )}
      </div>
      <div className="god-form-actions">
        {err && <div className="god-err">{err}</div>}
        <button className="god-btn-primary" onClick={create}>+ Create Account</button>
      </div>

      <div className="god-subsection-label">All Accounts</div>
      <div className="god-list">
        {accounts.map(acc => {
          const ids = (coachAssignments || []).filter(a => a.account_id === acc.id).map(a => a.team_id);
          if (acc.team_id && !ids.includes(acc.team_id)) ids.push(acc.team_id);
          const accTeams = teams.filter(t => ids.includes(t.id));
          return (
            <div key={acc.id} className="god-row">
              <div className="god-coach-avatar">{(acc.name || acc.username).charAt(0).toUpperCase()}</div>
              <div className="god-row-id">
                <div className="god-row-name">{acc.name}</div>
                <div className="god-row-meta">@{acc.username} · {acc.role}{accTeams.length ? ` · ${accTeams.map(t => t.name).join(', ')}` : ''}</div>
              </div>
              <div className="god-row-actions">
                <button className="god-btn-secondary" onClick={async () => { await supabase.from('accounts').update({ active: !acc.active }).eq('id', acc.id); await refresh(); }}>
                  {acc.active ? 'Disable' : 'Enable'}
                </button>
                <button className="god-btn-danger" onClick={async () => {
                  if (!confirm(`Delete ${acc.name}?`)) return;
                  await supabase.from('coach_team_assignments').delete().eq('account_id', acc.id);
                  await supabase.from('accounts').delete().eq('id', acc.id);
                  addToast('Account deleted', 'success');
                  await refresh();
                }}>Delete</button>
              </div>
            </div>
          );
        })}
        {accounts.length === 0 && <div className="god-empty-row">No accounts.</div>}
      </div>
    </SectionShell>
  );
}

function LeagueAdmin({ data, addToast }) {
  const { teams, leagueTeams, leagueResults, refresh } = data;
  const [editing, setEditing] = useState(null);

  return (
    <SectionShell title="League Results" count={leagueResults.length}>
      {teams.map(t => {
        const teamLeagueTeams = leagueTeams.filter(lt => lt.team_id === t.id);
        const teamResults = leagueResults.filter(lr => lr.team_id === t.id)
          .slice().sort((a, b) => (a.game_date || '').localeCompare(b.game_date || ''));
        if (teamLeagueTeams.length === 0) return null;
        return (
          <div key={t.id} className="god-league-team">
            <div className="god-subsection-label">{t.name} · {teamResults.length} results</div>
            {teamResults.length === 0 ? (
              <div className="god-empty-row">No league results recorded.</div>
            ) : (
              <div className="god-list">
                {teamResults.map(lr => {
                  const home = teamLeagueTeams.find(lt => lt.id === lr.home_league_team_id);
                  const away = teamLeagueTeams.find(lt => lt.id === lr.away_league_team_id);
                  return (
                    <div key={lr.id} className="god-row">
                      <div className="god-row-id">
                        <div className="god-row-name">
                          {home?.name || '?'} <span style={{ color: t.color || '#bc8cff' }}>{lr.home_sets}–{lr.away_sets}</span> {away?.name || '?'}
                        </div>
                        <div className="god-row-meta">{lr.game_date}</div>
                      </div>
                      <div className="god-row-actions">
                        <button className="god-btn-secondary" onClick={() => setEditing(lr)}>Edit</button>
                        <button className="god-btn-danger" onClick={async () => {
                          if (!confirm('Delete this league result?')) return;
                          const r = await supabase.from('league_results').delete().eq('id', lr.id);
                          if (r.error) addToast('Failed: ' + r.error.message);
                          else addToast('Deleted', 'success');
                          await refresh();
                        }}>Delete</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {teams.filter(t => leagueTeams.some(lt => lt.team_id === t.id)).length === 0 && (
        <div className="god-empty-row">No league teams configured.</div>
      )}

      {editing && (
        <EditLeagueResultModal
          result={editing}
          allLeagueTeams={leagueTeams}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
        />
      )}
    </SectionShell>
  );
}
