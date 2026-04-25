import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  ensureTeamRecord, getTeam, updateTeam, setRoster as saveRoster,
  createGame, getGame, updateGame, deleteGame, resetGameState,
  listCustomFormations, saveCustomFormation, deleteCustomFormation,
  mapStatsPalRoster,
} from './teams'
import { IconUsers, IconClipboard, IconCalendar, IconPlay } from '../../components/Icons'
import {
  BUILTIN_FORMATIONS, CATEGORY_LABELS, CATEGORY_ORDER,
  getAllFormations, getFormationsByCategory, findFormation,
  getRotationPositions, makeCustomFormationDraft,
} from './formations'
import {
  SERVE_RECEIVE_PLAYS, SETTER_TARGET,
  getPlaysForRotation, findPlay as findSrPlay, getPlayXY, defaultPlayIds,
} from './serveReceive'

const SLOTS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']
const SLOT_COORDS = {
  P4: { x: 20, y: 30 },
  P3: { x: 50, y: 30 },
  P2: { x: 80, y: 30 },
  P5: { x: 20, y: 76 },
  P6: { x: 50, y: 76 },
  P1: { x: 80, y: 76 },
}
const SLOT_ROLE_HINT = {
  P1: 'Right Back', P2: 'Right Front', P3: 'Middle Front',
  P4: 'Outside Front', P5: 'Outside Back', P6: 'Middle Back',
}
const ROLES = [
  { code: 'OH', label: 'Outside Hitter' },
  { code: 'MB', label: 'Middle Blocker' },
  { code: 'RS', label: 'Right Side' },
  { code: 'S',  label: 'Setter' },
  { code: 'L',  label: 'Libero' },
  { code: 'DS', label: 'Defensive Specialist' },
  { code: 'O',  label: 'Other' },
]
const ADVANCE_FROM = { P6: 'P1', P1: 'P2', P2: 'P3', P3: 'P4', P4: 'P5', P5: 'P6' }

const FRONT_SLOTS = ['P4', 'P3', 'P2']
const BACK_SLOTS  = ['P5', 'P6', 'P1']
// Column pairs: front player must be in front of its back counterpart
const FB_PAIRS = [['P4', 'P5'], ['P3', 'P6'], ['P2', 'P1']]

const SUB_LIMIT = 18 // NFHS

function setTarget(setNum, format) {
  const decidingSet = format === 5 ? 5 : 3
  return setNum === decidingSet ? 15 : 25
}
function checkSetWinner(our, opp, setNum, format) {
  const t = setTarget(setNum, format)
  if (our >= t && our - opp >= 2) return 'us'
  if (opp >= t && opp - our >= 2) return 'them'
  return null
}
function matchWinner(finishedSets, format) {
  const needed = format === 5 ? 3 : 2
  const us = finishedSets.filter(s => s.winner === 'us').length
  const them = finishedSets.filter(s => s.winner === 'them').length
  if (us >= needed) return 'us'
  if (them >= needed) return 'them'
  return null
}

// Formation templates have moved to ./formations.js

// ============================================================
// Overlap validation
// positions: { P1..P6: { x, y } } in percent (0-100)
// ============================================================
function overlapErrors(positions) {
  const errs = []
  const EPS = 0.5 // small tolerance
  for (const [f, b] of FB_PAIRS) {
    if (positions[f].y + EPS >= positions[b].y) {
      errs.push(`${f} must be closer to the net than ${b}`)
    }
  }
  // Front row x ordering: P4 < P3 < P2
  if (positions.P4.x + EPS >= positions.P3.x) errs.push('P4 must be left of P3')
  if (positions.P3.x + EPS >= positions.P2.x) errs.push('P3 must be left of P2')
  // Back row x ordering: P5 < P6 < P1
  if (positions.P5.x + EPS >= positions.P6.x) errs.push('P5 must be left of P6')
  if (positions.P6.x + EPS >= positions.P1.x) errs.push('P6 must be left of P1')
  return errs
}

// Returns, for a given slot and target (x,y), whether placing that player there
// would violate overlap given all other positions.
function slotDropValid(slot, testPos, positions) {
  const next = { ...positions, [slot]: testPos }
  return overlapErrors(next).length === 0
}

// Default coords for a rotation (used when no drag-positions saved)
function defaultPositions() {
  return {
    P4: { x: 20, y: 30 }, P3: { x: 50, y: 30 }, P2: { x: 80, y: 30 },
    P5: { x: 20, y: 76 }, P6: { x: 50, y: 76 }, P1: { x: 80, y: 76 },
  }
}

// Apply libero auto-swap: if a libero is defined, swap the first MB in back row
// out for the libero. Returns { lineup, swapped: playerIdOrNull }.
function applyLiberoSwap(lineup, liberoId, roster) {
  if (!liberoId) return { lineup, swapped: null }
  const byId = Object.fromEntries(roster.map(p => [p.id, p]))
  // Don't swap if libero is already on the court
  if (Object.values(lineup).includes(liberoId)) return { lineup, swapped: null }
  const next = { ...lineup }
  for (const slot of BACK_SLOTS) {
    const pid = lineup[slot]
    const p = byId[pid]
    if (p && p.role === 'MB') {
      next[slot] = liberoId
      return { lineup: next, swapped: pid }
    }
  }
  return { lineup, swapped: null }
}

function countManualSubs(subs, setNum) {
  return (subs || []).filter(s => s.setNum === setNum && !s.libero).length
}

function rotateOnce(lineup) {
  const next = {}
  for (const s of SLOTS) next[s] = lineup[ADVANCE_FROM[s]]
  return next
}
function computeLineup(baseLineup, startingRotation, currentRotation) {
  let steps = (currentRotation - startingRotation + 6) % 6
  let lineup = { ...baseLineup }
  for (let i = 0; i < steps; i++) lineup = rotateOnce(lineup)
  return lineup
}

const uid = () => Math.random().toString(36).slice(2, 9)

// Migrate old subPairings format (string) → new dual-slot format ({backRow, frontRow})
function migrateSubPairings(sp) {
  if (!sp) return {}
  const out = {}
  for (const [sid, val] of Object.entries(sp)) {
    if (typeof val === 'string') {
      out[sid] = { backRow: val, frontRow: null }
    } else if (val && typeof val === 'object') {
      out[sid] = val
    }
  }
  return out
}

// Collect all sub IDs already assigned across all starters/slots
function allAssignedSubIds(pairings) {
  const ids = new Set()
  for (const val of Object.values(pairings)) {
    if (val.backRow) ids.add(val.backRow)
    if (val.frontRow) ids.add(val.frontRow)
  }
  return ids
}

function fullName(p) {
  if (!p) return ''
  const f = (p.firstName || '').trim()
  const l = (p.lastName || '').trim()
  return [f, l].filter(Boolean).join(' ')
}
function shortName(p) {
  if (!p) return ''
  const f = (p.firstName || '').trim()
  const l = (p.lastName || '').trim()
  if (f && l) return `${f[0]}. ${l}`
  return l || f
}

// ============================================================
// Root (VolleyballPal module entrypoint)
// ============================================================
// Props:
//   session       — { username, role } derived from StatsPal auth
//   statsPalTeams — the teams array from StatsPal's DataContext
//   statsPalPlayers — flat array of { id, team_id, name, position, jersey_number }
//   onHome        — navigate back to VolleyballPal landing
//   onLogout      — log out of the whole app
// ============================================================
export default function RotationPalApp({
  session,
  statsPalTeams = [],
  statsPalPlayers = [],
  statsPalSchedule = [],
  entryMode = 'linked',
  onHome,
  onLogout,
  onPublishSession,
  onClearSession,
}) {
  const isStandalone = entryMode === 'standalone'

  // Skip the team-list screen and land directly on teamHome when there is
  // exactly one team. With multiple teams the user picks from MyTeamsView
  // inside the app.
  const [nav, setNav] = useState(() => {
    if (!isStandalone && statsPalTeams.length === 1) {
      return { screen: 'teamHome', teamId: statsPalTeams[0].id }
    }
    return { screen: 'teams' }
  })
  const [tick, setTick] = useState(0)
  const refresh = () => setTick(t => t + 1)

  // Build a roster-per-team lookup (StatsPal players → RotationPal format).
  // Only populated in linked mode — standalone teams edit rosters directly.
  const rosterByTeamId = useMemo(() => {
    if (isStandalone) return {}
    const byTeam = {}
    for (const p of statsPalPlayers) {
      if (!byTeam[p.team_id]) byTeam[p.team_id] = []
      byTeam[p.team_id].push(p)
    }
    const out = {}
    for (const tid of Object.keys(byTeam)) {
      out[tid] = mapStatsPalRoster(byTeam[tid])
    }
    return out
  }, [statsPalPlayers, isStandalone])

  // Ensure a local RotationPal record exists for every team the user can see.
  // In linked mode, push StatsPal's roster in — roles are derived from the
  // StatsPal position on every sync, so edits to position in Team Details
  // flow through without a separate override. Standalone teams edit rosters
  // directly.
  useEffect(() => {
    for (const t of statsPalTeams) {
      ensureTeamRecord(t, session?.username)
      if (isStandalone) continue
      saveRoster(t.id, rosterByTeamId[t.id] || [])
    }
  }, [statsPalTeams, rosterByTeamId, session?.username, isStandalone])

  const headerProps = {
    session,
    onHome,
    onLogout,
    modeBadge: isStandalone ? 'standalone' : 'linked',
  }

  let screen
  if (nav.screen === 'teams') {
    screen = (
      <MyTeamsView
        {...headerProps}
        tick={tick}
        statsPalTeams={statsPalTeams}
        isStandalone={isStandalone}
        onOpenTeam={(id) => setNav({ screen: 'teamHome', teamId: id })}
      />
    )
  } else if (nav.screen === 'teamHome') {
    const team = getTeam(nav.teamId)
    if (!team) { setNav({ screen: 'teams' }); return null }
    screen = (
      <TeamHomeView
        {...headerProps}
        team={team}
        onBack={statsPalTeams.length <= 1
          ? () => onHome?.()
          : () => setNav({ screen: 'teams' })}
        onOpenRoster={() => setNav({ screen: 'roster', teamId: team.id })}
        onOpenSchedule={() => setNav({ screen: 'schedule', teamId: team.id })}
        onOpenFormations={() => setNav({ screen: 'formations', teamId: team.id })}
      />
    )
  } else if (nav.screen === 'roster') {
    const team = getTeam(nav.teamId)
    if (!team) { setNav({ screen: 'teams' }); return null }
    screen = (
      <RosterView
        {...headerProps}
        key={team.id + ':' + tick}
        team={team}
        onBack={() => { refresh(); setNav({ screen: 'teamHome', teamId: team.id }) }}
      />
    )
  } else if (nav.screen === 'formations') {
    const team = getTeam(nav.teamId)
    if (!team) { setNav({ screen: 'teams' }); return null }
    screen = (
      <FormationsView
        {...headerProps}
        key={team.id + ':' + tick}
        team={team}
        onBack={() => { refresh(); setNav({ screen: 'teamHome', teamId: team.id }) }}
        onChanged={refresh}
      />
    )
  } else if (nav.screen === 'schedule') {
    const team = getTeam(nav.teamId)
    if (!team) { setNav({ screen: 'teams' }); return null }
    const teamSchedule = statsPalSchedule.filter(s => s.team_id === team.id)
    screen = (
      <ScheduleView
        {...headerProps}
        tick={tick}
        team={team}
        statsPalSchedule={teamSchedule}
        isStandalone={isStandalone}
        onBack={() => setNav({ screen: 'teamHome', teamId: team.id })}
        onOpenGame={(gid) => setNav({ screen: 'game', teamId: team.id, gameId: gid })}
        onChanged={refresh}
      />
    )
  } else if (nav.screen === 'game') {
    const team = getTeam(nav.teamId)
    const game = team ? (team.games || []).find(g => g.id === nav.gameId) : null
    if (!team || !game) { setNav({ screen: 'teams' }); return null }
    // StatsPal teams are always linked; standalone teams never publish sessions.
    const canPublish = !isStandalone
    screen = (
      <GameApp
        {...headerProps}
        key={game.id}
        team={team}
        game={game}
        onBack={() => { refresh(); setNav({ screen: 'schedule', teamId: team.id }) }}
        onPublishSession={canPublish ? onPublishSession : null}
        onClearSession={canPublish ? onClearSession : null}
      />
    )
  }

  return <div className="rotationpal-module">{screen}</div>
}

// ============================================================
// Shared header (dashboard-style pages)
// ============================================================
function HeaderBar({ session, onHome, onLogout, modeBadge, title, subtitle, leftActions, rightActions }) {
  return (
    <div className="dashboard-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        {leftActions}
        <div>
          <h1>{title || <>Rotation<span>Pal</span></>}</h1>
          {subtitle && <div className="subtitle">{subtitle}</div>}
        </div>
        {modeBadge && (
          <span className={`rp-mode-badge rp-mode-badge-${modeBadge}`}>
            {modeBadge === 'linked' ? 'Linked' : 'Standalone'}
          </span>
        )}
      </div>
      <div className="dashboard-actions">
        {rightActions}
        {onHome && (
          <button className="ghost rp-home-btn" onClick={onHome} title="VolleyballPal home">
            Home
          </button>
        )}
        {session && (
          <div className="user-pill">
            <span className="uname">{session.username}</span>
            {session.role && <span className={`rtag ${session.role}`}>{session.role}</span>}
          </div>
        )}
        {onLogout && <button className="ghost" onClick={onLogout}>Logout</button>}
      </div>
    </div>
  )
}

// ============================================================
// My Teams — reads from StatsPal's team list; team creation/deletion is
// managed by StatsPal's admin screens, not here.
// ============================================================
function MyTeamsView({
  session, onHome, onLogout, modeBadge,
  onOpenTeam, statsPalTeams, isStandalone, tick,
}) {
  // Pick up the latest RotationPal-local record for each team so we can
  // display game/formation counts.
  const teams = useMemo(() => {
    return (statsPalTeams || []).map(t => {
      const rec = getTeam(t.id)
      return {
        id: t.id,
        name: t.name,
        roster: rec?.roster || [],
        games: rec?.games || [],
        customFormations: rec?.customFormations || [],
      }
    })
  }, [statsPalTeams, tick])

  const subtitle = isStandalone
    ? 'Standalone mode — rosters and games live outside StatsPal.'
    : (session ? `Welcome back, ${session.username}` : undefined)

  return (
    <div className="dashboard">
      <HeaderBar
        session={session}
        onHome={onHome}
        onLogout={onLogout}
        modeBadge={modeBadge}
        subtitle={subtitle}
      />

      <div className="teams-section-header">
        <h2>
          {isStandalone ? 'Standalone Lineups' : 'My Teams'}
          {!isStandalone && session?.role === 'admin' ? ' (All)' : ''}
        </h2>
      </div>

      {teams.length === 0 ? (
        <div className="empty-state">
          <h3>No {isStandalone ? 'standalone lineups' : 'teams'} yet</h3>
          <p>
            {isStandalone
              ? 'Create a standalone lineup from the VolleyballPal Settings page, then come back here to build it.'
              : 'Teams are managed in StatsPal. Head back to the VolleyballPal home and add a team there first.'}
          </p>
          {onHome && <button className="primary" onClick={onHome}>← Back to VolleyballPal</button>}
        </div>
      ) : (
        <div className="team-grid">
          {teams.map(t => {
            const rosterCount = (t.roster || []).length
            const gameCount = (t.games || []).length
            // StatsPal teams are always linked; only sa-* standalone is unlinked.
            const linked = !isStandalone
            return (
              <div
                key={t.id}
                className={`team-card ${linked ? 'rp-team-linked' : ''} ${isStandalone ? 'rp-team-standalone' : ''}`}
                onClick={() => onOpenTeam(t.id)}
              >
                <div className="team-name">
                  {t.name}
                  {linked && (
                    <span className="rp-link-chip" title="Linked to StatsPal">Linked</span>
                  )}
                  {isStandalone && (
                    <span className="rp-standalone-chip" title="Standalone lineup">Standalone</span>
                  )}
                </div>
                <div className="team-meta">
                  <span className="chip">{rosterCount} players</span>
                  <span className="chip">{gameCount} game{gameCount === 1 ? '' : 's'}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Team Home
// ============================================================
function TeamHomeView({ session, onLogout, onHome, team, onBack, onOpenRoster, onOpenSchedule, onOpenFormations }) {
  const rosterCount = (team.roster || []).length
  const gameCount = (team.games || []).length
  const upcoming = (team.games || []).filter(g => !g.finishedSets || g.finishedSets.length === 0).length
  const customCount = (team.customFormations || []).length
  return (
    <div className="dashboard">
      <HeaderBar
        session={session}
        onLogout={onLogout}
        onHome={onHome}
        title={team.name}
        subtitle="Team home"
        leftActions={<button className="ghost" onClick={onBack}>← My Teams</button>}
      />

      <div className="team-home-grid">
        <div className="home-tile" onClick={onOpenRoster}>
          <div className="home-tile-icon"><IconUsers size={28} /></div>
          <div className="home-tile-title">Roster</div>
          <div className="home-tile-sub">{rosterCount} {rosterCount === 1 ? 'player' : 'players'}</div>
          <div className="home-tile-hint">Manage jersey numbers, names, and roles. Permanent across all games.</div>
        </div>
        <div className="home-tile" onClick={onOpenFormations}>
          <div className="home-tile-icon"><IconClipboard size={28} /></div>
          <div className="home-tile-title">Formations</div>
          <div className="home-tile-sub">
            {BUILTIN_FORMATIONS.length} built-in{customCount > 0 ? ` · ${customCount} custom` : ''}
          </div>
          <div className="home-tile-hint">Offensive, defensive, and serve-receive systems. Build custom formations for your team.</div>
        </div>
        <div className="home-tile" onClick={onOpenSchedule}>
          <div className="home-tile-icon"><IconCalendar size={28} /></div>
          <div className="home-tile-title">Schedule</div>
          <div className="home-tile-sub">{gameCount} {gameCount === 1 ? 'game' : 'games'}{upcoming > 0 ? ` · ${upcoming} open` : ''}</div>
          <div className="home-tile-hint">Upcoming and past games. Open any game to track rotations live.</div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Roster
// ============================================================
function RosterView({ session, onLogout, onHome, team, onBack }) {
  const [roster, setLocalRoster] = useState(team.roster || [])

  // Persist on any change
  useEffect(() => {
    saveRoster(team.id, roster)
  }, [team.id, roster])

  function addPlayer() {
    setLocalRoster(r => [...r, { id: uid(), number: '', firstName: '', lastName: '', role: 'OH' }])
  }
  function updatePlayer(id, field, value) {
    setLocalRoster(r => r.map(p => p.id === id ? { ...p, [field]: value } : p))
  }
  function removePlayer(id) {
    setLocalRoster(r => r.filter(p => p.id !== id))
  }

  return (
    <div className="dashboard">
      <HeaderBar
        session={session}
        onLogout={onLogout}
        onHome={onHome}
        title={team.name}
        subtitle="Roster"
        leftActions={<button className="ghost" onClick={onBack}>← {team.name}</button>}
      />

      <div className="panel">
        <h3>Players</h3>
        <div className="roster-list">
          <div className="roster-item" style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
            <div>#</div><div>First Name</div><div>Last Name</div><div>Role</div><div></div>
          </div>
          {roster.length === 0 && (
            <div style={{ padding: '24px 12px', color: 'var(--muted)', fontSize: 13 }}>
              No players yet. Click "+ Add Player" to build your roster.
            </div>
          )}
          {roster.map(p => (
            <div className="roster-item" key={p.id}>
              <input value={p.number} onChange={e => updatePlayer(p.id, 'number', e.target.value)} placeholder="#" />
              <input value={p.firstName || ''} onChange={e => updatePlayer(p.id, 'firstName', e.target.value)} placeholder="First Name" />
              <input value={p.lastName || ''} onChange={e => updatePlayer(p.id, 'lastName', e.target.value)} placeholder="Last Name" />
              <select value={p.role} onChange={e => updatePlayer(p.id, 'role', e.target.value)}>
                {ROLES.map(r => <option key={r.code} value={r.code}>{r.code} — {r.label}</option>)}
              </select>
              <button onClick={() => removePlayer(p.id)}>×</button>
            </div>
          ))}
        </div>
        <button onClick={addPlayer} className="ghost" style={{ marginTop: 10 }}>+ Add Player</button>
        <div className="hint">Changes are saved automatically.</div>
      </div>
    </div>
  )
}

// ============================================================
// Schedule
// ============================================================
function ScheduleView({ session, onLogout, onHome, team, onBack, onOpenGame, onChanged, tick, statsPalSchedule = [], isStandalone = false }) {
  const [showAdd, setShowAdd] = useState(false)
  const [opponent, setOpponent] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [format, setFormat] = useState(3)

  const localGames = useMemo(() => {
    const team2 = getTeam(team.id)
    return (team2?.games || []).slice()
  }, [team.id, tick])

  // Standalone-only: sorted local games list
  const standaloneGames = useMemo(() => {
    const list = localGames.slice()
    list.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    return list
  }, [localGames])

  function handleAdd(e) {
    e.preventDefault()
    if (!opponent.trim()) return
    const g = createGame(team.id, { opponent: opponent.trim(), date, format })
    setShowAdd(false)
    setOpponent(''); setDate(new Date().toISOString().slice(0, 10)); setFormat(3)
    onChanged()
    onOpenGame(g.id)
  }

  function handleDelete(g) {
    if (!confirm(`Delete game vs ${g.opponent} on ${g.date}?`)) return
    deleteGame(team.id, g.id)
    onChanged()
  }

  function gameStatus(g) {
    if (!g) return { label: 'Upcoming', className: 'pending' }
    const played = (g.finishedSets || []).length > 0 || g.ourScore > 0 || g.oppScore > 0
    if (!played) return { label: 'Upcoming', className: 'pending' }
    const fs = g.finishedSets || []
    const ourSets = fs.filter(s => s.winner === 'us').length
    const oppSets = fs.filter(s => s.winner === 'them').length
    if (fs.length === 0) return { label: `In progress ${g.ourScore}-${g.oppScore}`, className: 'live' }
    const result = ourSets > oppSets ? 'W' : (ourSets < oppSets ? 'L' : '—')
    return { label: `${result} ${ourSets}-${oppSets}`, className: result === 'W' ? 'win' : (result === 'L' ? 'loss' : 'pending') }
  }

  // Open or create a local rotation game linked to a StatPal schedule entry
  function handleOpenScheduleEntry(entry) {
    const existing = localGames.find(g => g.scheduleId === entry.id)
    if (existing) {
      onOpenGame(existing.id)
    } else {
      const gameDate = entry.game_date ? entry.game_date.slice(0, 10) : new Date().toISOString().slice(0, 10)
      const g = createGame(team.id, {
        opponent: entry.opponent || 'Opponent',
        date: gameDate,
        format: 3,
        scheduleId: entry.id,
      })
      if (g) {
        onChanged()
        onOpenGame(g.id)
      }
    }
  }

  const header = (
    <HeaderBar
      session={session}
      onLogout={onLogout}
      onHome={onHome}
      title={team.name}
      subtitle="Schedule"
      leftActions={<button className="ghost" onClick={onBack}>← {team.name}</button>}
    />
  )

  // ---- Linked mode: drive schedule from StatPal ----
  if (!isStandalone) {
    console.log('[RotationPal] statsPalSchedule for team', team.id, statsPalSchedule)
    return (
      <div className="dashboard">
        {header}
        <div className="teams-section-header">
          <h2>Schedule</h2>
        </div>
        {statsPalSchedule.length === 0 ? (
          <div className="empty-state">
            <h3>No games scheduled yet</h3>
            <p>Add games in StatPal to see them here.</p>
          </div>
        ) : (
          <div className="game-list">
            {statsPalSchedule.map(entry => {
              const localGame = localGames.find(g => g.scheduleId === entry.id)
              const st = gameStatus(localGame)
              const displayDate = entry.game_date ? entry.game_date.slice(0, 10) : '—'
              return (
                <div key={entry.id} className="game-row" onClick={() => handleOpenScheduleEntry(entry)}>
                  <div className="game-date">{displayDate}</div>
                  <div className="game-main">
                    <div className="game-opponent">vs {entry.opponent}</div>
                    {entry.location && <div className="game-meta">{entry.location}</div>}
                  </div>
                  <div className={`game-status ${st.className}`}>{st.label}</div>
                  <div className="game-actions" onClick={e => e.stopPropagation()}>
                    <button className="primary" onClick={() => handleOpenScheduleEntry(entry)}>
                      {localGame ? 'Open' : 'Set Lineup'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ---- Standalone mode: original localStorage-based schedule ----
  return (
    <div className="dashboard">
      {header}
      <div className="teams-section-header">
        <h2>Games</h2>
        <button className="primary" onClick={() => setShowAdd(true)}>+ Add Game</button>
      </div>

      {standaloneGames.length === 0 ? (
        <div className="empty-state">
          <h3>No games scheduled</h3>
          <p>Add a game to open the live rotation and lineup tool.</p>
          <button className="primary" onClick={() => setShowAdd(true)}>+ Add Game</button>
        </div>
      ) : (
        <div className="game-list">
          {standaloneGames.map(g => {
            const st = gameStatus(g)
            return (
              <div key={g.id} className="game-row" onClick={() => onOpenGame(g.id)}>
                <div className="game-date">{g.date}</div>
                <div className="game-main">
                  <div className="game-opponent">vs {g.opponent}</div>
                  <div className="game-meta">Best of {g.format}</div>
                </div>
                <div className={`game-status ${st.className}`}>{st.label}</div>
                <div className="game-actions" onClick={e => e.stopPropagation()}>
                  <button className="primary" onClick={() => onOpenGame(g.id)}>Open</button>
                  <button className="danger" onClick={() => handleDelete(g)}>Delete</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showAdd && (
        <div className="modal-backdrop" onClick={() => setShowAdd(false)}>
          <form className="modal" onClick={e => e.stopPropagation()} onSubmit={handleAdd}>
            <h2>New Game</h2>
            <div className="form-row">
              <label>Opponent</label>
              <input autoFocus value={opponent} onChange={e => setOpponent(e.target.value)} placeholder="Opponent name" />
            </div>
            <div className="form-row">
              <label>Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="form-row">
              <label>Format</label>
              <select value={format} onChange={e => setFormat(parseInt(e.target.value))}>
                <option value={3}>Best of 3</option>
                <option value={5}>Best of 5</option>
              </select>
            </div>
            <div className="row">
              <button type="button" className="ghost" onClick={() => setShowAdd(false)}>Cancel</button>
              <button type="submit" className="primary">Create Game</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Game (live rotation tool)
// ============================================================
function GameApp({ session, onLogout, onHome, team, game, onBack, onPublishSession, onClearSession }) {
  const [view, setView] = useState('setup') // 'setup' | 'live'

  // Editable per-game state
  const [opponent, setOpponent] = useState(game.opponent || 'Opponent')
  const [gameDate, setGameDate] = useState(game.date || new Date().toISOString().slice(0, 10))
  const [format, setFormat] = useState(game.format || 3)
  const [baseLineup, setBaseLineup] = useState(game.baseLineup || { P1: null, P2: null, P3: null, P4: null, P5: null, P6: null })
  const [startingRotation, setStartingRotation] = useState(game.startingRotation || 1)
  const [startServing, setStartServing] = useState(game.startServing ?? true)

  const [currentRotation, setCurrentRotation] = useState(game.currentRotation || 1)
  const [ourScore, setOurScore] = useState(game.ourScore || 0)
  const [oppScore, setOppScore] = useState(game.oppScore || 0)
  const [serving, setServing] = useState(game.serving ?? true)
  const [setNum, setSetNum] = useState(game.setNum || 1)
  const [finishedSets, setFinishedSets] = useState(game.finishedSets || [])
  const [subs, setSubs] = useState(game.subs || [])
  const [liveLineup, setLiveLineup] = useState(game.liveLineup || null)
  const [roleOverrides, setRoleOverrides] = useState(game.roleOverrides || {})
  const [dragPositions, setDragPositions] = useState(game.dragPositions || {})
  const [subPairings, setSubPairings] = useState(() => migrateSubPairings(game.subPairings || {}))
  const [liberoId, setLiberoId] = useState(game.liberoId || null)
  const [mbSwitches, setMbSwitches] = useState(game.mbSwitches || {})
  const [setConfigs, setSetConfigs] = useState(game.setConfigs || {})
  const [offenseFormationId, setOffenseFormationId] = useState(game.offenseFormationId || null)
  const [defenseFormationId, setDefenseFormationId] = useState(game.defenseFormationId || null)
  const [serveReceivePlayIds, setServeReceivePlayIds] = useState(
    game.serveReceivePlayIds || defaultPlayIds()
  )
  const [benchSelected, setBenchSelected] = useState(null)
  const [toastMsg, setToastMsg] = useState(null)
  const [showFormations, setShowFormations] = useState(false)
  const [dismissedAlertKeys, setDismissedAlertKeys] = useState([])
  const [courtSelected, setCourtSelected] = useState(null)
  const [showEndSet, setShowEndSet] = useState(false)
  const [showLineupCard, setShowLineupCard] = useState(false)
  const [showRestartConfirm, setShowRestartConfirm] = useState(false)

  const rawRoster = team.roster || []
  const roster = useMemo(
    () => rawRoster.map(p => roleOverrides[p.id] ? { ...p, role: roleOverrides[p.id] } : p),
    [rawRoster, roleOverrides]
  )

  const firstSaveRef = useRef(true)
  useEffect(() => {
    if (firstSaveRef.current) { firstSaveRef.current = false; return }
    updateGame(team.id, game.id, {
      opponent, date: gameDate, format, baseLineup, startingRotation, startServing,
      currentRotation, ourScore, oppScore, serving, setNum, finishedSets, subs, liveLineup,
      roleOverrides, dragPositions, subPairings, liberoId, mbSwitches, setConfigs,
      offenseFormationId, defenseFormationId, serveReceivePlayIds,
    })
  }, [team.id, game.id, opponent, gameDate, format, baseLineup, startingRotation, startServing,
      currentRotation, ourScore, oppScore, serving, setNum, finishedSets, subs, liveLineup,
      roleOverrides, dragPositions, subPairings, liberoId, mbSwitches, setConfigs,
      offenseFormationId, defenseFormationId, serveReceivePlayIds])

  // (Real-time cross-device sync disabled in VolleyballPal — RotationPal uses
  // localStorage only here. Stats syncing is handled separately by StatsPal.)

  // Publish the live game state to VolleyballPalContext when the team is
  // linked — StatsPal reads this to pre-load lineup/score for a live game.
  useEffect(() => {
    if (!onPublishSession) return
    onPublishSession({
      teamId: team.id,
      gameId: game.id,
      opponent,
      gameDate,
      format,
      baseLineup,
      startingRotation,
      startServing,
      currentRotation,
      ourScore,
      oppScore,
      serving,
      setNum,
      finishedSets,
      liveLineup,
      liberoId,
      view,
    })
  }, [
    onPublishSession, team.id, game.id, opponent, gameDate, format,
    baseLineup, startingRotation, startServing,
    currentRotation, ourScore, oppScore, serving,
    setNum, finishedSets, liveLineup, liberoId, view,
  ])

  // Clear the published session when the live game view unmounts.
  useEffect(() => {
    return () => { if (onClearSession) onClearSession() }
  }, [onClearSession])

  const rotatedLineup = useMemo(
    () => computeLineup(baseLineup, startingRotation, currentRotation),
    [baseLineup, startingRotation, currentRotation]
  )
  const mergedLineup = useMemo(() => {
    if (!liveLineup) return rotatedLineup
    const out = {}
    for (const s of SLOTS) out[s] = liveLineup[s] ?? rotatedLineup[s]
    return out
  }, [rotatedLineup, liveLineup])

  // Apply libero auto-swap on top of the merged lineup
  const { lineup: displayLineup, swapped: liberoSwappedOutId } = useMemo(() => {
    return applyLiberoSwap(mergedLineup, liberoId, roster)
  }, [mergedLineup, liberoId, roster])

  const playerById = useMemo(() => {
    const m = {}
    for (const p of roster) m[p.id] = p
    return m
  }, [roster])

  // Selected serve receive play for the current rotation (used as the base
  // position map when the coach hasn't overridden with drag positions).
  const currentSrPlay = useMemo(
    () => findSrPlay(serveReceivePlayIds?.[currentRotation]),
    [serveReceivePlayIds, currentRotation]
  )

  // Positions for the current rotation. Priority:
  //   1. Drag override for this rotation (coach moved a player)
  //   2. Selected serve receive play positions
  //   3. Default rectangle layout
  const positions = useMemo(() => {
    const stored = dragPositions[currentRotation]
    const fallback = currentSrPlay ? getPlayXY(currentSrPlay) : defaultPositions()
    if (stored) {
      const out = {}
      for (const s of SLOTS) out[s] = stored[s] || fallback[s]
      return out
    }
    return fallback
  }, [dragPositions, currentRotation, currentSrPlay])

  const onCourtIds = new Set(Object.values(displayLineup).filter(Boolean))
  const benchPlayers = roster.filter(p => !onCourtIds.has(p.id))

  // Sub alerts: check both front and back row for dual sub pairings
  const pendingSubAlerts = useMemo(() => {
    if (!subPairings) return []
    const alerts = []
    // Check back row subs
    for (const slot of BACK_SLOTS) {
      const pid = displayLineup[slot]
      if (!pid) continue
      const pairing = subPairings[pid]
      if (!pairing) continue
      const subId = pairing.backRow
      if (subId && playerById[subId]) {
        const key = `${currentRotation}:${pid}:back`
        if (!dismissedAlertKeys.includes(key)) {
          alerts.push({ starterId: pid, subId, slot, key, rowType: 'Back Row' })
        }
      }
    }
    // Check front row subs
    for (const slot of FRONT_SLOTS) {
      const pid = displayLineup[slot]
      if (!pid) continue
      const pairing = subPairings[pid]
      if (!pairing) continue
      const subId = pairing.frontRow
      if (subId && playerById[subId]) {
        const key = `${currentRotation}:${pid}:front`
        if (!dismissedAlertKeys.includes(key)) {
          alerts.push({ starterId: pid, subId, slot, key, rowType: 'Front Row' })
        }
      }
    }
    return alerts
  }, [displayLineup, subPairings, currentRotation, playerById, dismissedAlertKeys])

  const [subAlertIndex, setSubAlertIndex] = useState(0)
  const activeSubAlert = pendingSubAlerts.length > 0 ? pendingSubAlerts[Math.min(subAlertIndex, pendingSubAlerts.length - 1)] : null

  const subLimit = SUB_LIMIT
  const subsUsedThisSet = countManualSubs(subs, setNum)

  // Libero rule warnings
  const liberoWarnings = useMemo(() => {
    const out = []
    if (!liberoId) return out
    for (const s of SLOTS) {
      if (displayLineup[s] === liberoId) {
        if (FRONT_SLOTS.includes(s)) out.push('Libero is in a front-row position (illegal attack/set restrictions apply)')
        if (s === 'P1' && serving) out.push('Libero cannot serve')
      }
    }
    return out
  }, [displayLineup, liberoId, serving])

  function showToast(msg) {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(m => (m === msg ? null : m)), 2800)
  }

  function startGame() {
    const filled = SLOTS.every(s => baseLineup[s])
    if (!filled) {
      alert('Assign all 6 positions before starting the set.')
      return
    }
    setCurrentRotation(startingRotation)
    setOurScore(0)
    setOppScore(0)
    setServing(startServing)
    setLiveLineup(null)
    setDismissedAlertKeys([]); setSubAlertIndex(0)
    // Persist this set's config into the archive (saved per set in localStorage)
    setSetConfigs(prev => ({
      ...prev,
      [setNum]: { baseLineup, startingRotation, startServing, subPairings, roleOverrides, mbSwitches, liberoId, dragPositions },
    }))
    setView('live')
  }

  function resetGame() {
    if (!confirm('Reset this game\'s state (scores, sets, subs)? Lineup is kept.')) return
    setCurrentRotation(startingRotation)
    setOurScore(0); setOppScore(0)
    setServing(startServing); setSetNum(1)
    setFinishedSets([]); setSubs([]); setLiveLineup(null)
    setView('setup')
  }

  function addOurPoint() {
    const newOur = ourScore + 1
    const wasReceiving = !serving
    setOurScore(newOur)
    if (wasReceiving) {
      setCurrentRotation(r => (r % 6) + 1)
      setLiveLineup(null)
      setServing(true)
      setDismissedAlertKeys([]); setSubAlertIndex(0)
    }
    const winner = checkSetWinner(newOur, oppScore, setNum, format)
    if (winner) finalizeSet(newOur, oppScore, winner)
  }
  function subOurPoint() { if (ourScore > 0) setOurScore(s => s - 1) }
  function addOppPoint() {
    const newOpp = oppScore + 1
    setOppScore(newOpp)
    setServing(false)
    const winner = checkSetWinner(ourScore, newOpp, setNum, format)
    if (winner) finalizeSet(ourScore, newOpp, winner)
  }
  function subOppPoint() { if (oppScore > 0) setOppScore(s => s - 1) }

  function finalizeSet(ours, opp, winner) {
    const newFinished = [...finishedSets, { ours, opp, winner }]
    setFinishedSets(newFinished)
    // Archive this set's config
    setSetConfigs(prev => ({
      ...prev,
      [setNum]: { baseLineup, startingRotation, startServing, subPairings, roleOverrides, mbSwitches, liberoId, dragPositions },
    }))
    setView('setOver')
  }

  function restartGame() {
    setOurScore(0)
    setOppScore(0)
    setSetNum(1)
    setFinishedSets([])
    setSubs([])
    setLiveLineup(null)
    setCurrentRotation(startingRotation)
    setServing(startServing)
    setSetConfigs({})
    setDismissedAlertKeys([]); setSubAlertIndex(0)
    setShowRestartConfirm(false)
    setView('setup')
  }

  function startNextSet() {
    setSetNum(n => n + 1)
    setOurScore(0)
    setOppScore(0)
    setCurrentRotation(startingRotation)
    setServing(startServing)
    setLiveLineup(null)
    setDismissedAlertKeys([]); setSubAlertIndex(0)
    setView('setup')
  }

  function handleCourtClick(slot) {
    const courtId = displayLineup[slot]
    if (benchSelected) {
      const outId = courtId
      const inId = benchSelected
      const inPlayer = playerById[inId]
      const outPlayer = playerById[outId]
      const newLive = { ...(liveLineup || {}) }
      newLive[slot] = inId
      setLiveLineup(newLive)
      setSubs(prev => [...prev, {
        id: uid(), slot,
        inPlayerId: inId, outPlayerId: outId,
        setNum, scoreStr: `${ourScore}-${oppScore}`,
        label: `#${inPlayer?.number} ${fullName(inPlayer)} IN for #${outPlayer?.number} ${fullName(outPlayer)}`,
      }])
      setBenchSelected(null)
      setCourtSelected(null)
    } else {
      setCourtSelected(courtSelected === slot ? null : slot)
    }
  }

  function endSet() {
    const winner = ourScore > oppScore ? 'us' : 'them'
    setShowEndSet(false)
    finalizeSet(ourScore, oppScore, winner)
  }

  if (view === 'setOver') {
    const lastSet = finishedSets[finishedSets.length - 1]
    const winnerName = lastSet?.winner === 'us' ? team.name : opponent
    const ourSets = finishedSets.filter(s => s.winner === 'us').length
    const theirSets = finishedSets.filter(s => s.winner === 'them').length
    const mWinner = matchWinner(finishedSets, format)
    return (
      <SetOverScreen
        session={session}
        onLogout={onLogout}
        onHome={onHome}
        team={team}
        opponent={opponent}
        setNum={setNum}
        format={format}
        lastSet={lastSet}
        winnerName={winnerName}
        ourSets={ourSets}
        theirSets={theirSets}
        matchOver={!!mWinner}
        matchWinnerName={mWinner === 'us' ? team.name : opponent}
        onContinue={startNextSet}
        onBack={onBack}
      />
    )
  }

  if (view === 'setup') {
    return (
      <SetupView
        session={session}
        onLogout={onLogout}
        onHome={onHome}
        team={team}
        game={game}
        roster={roster}
        rawRoster={rawRoster}
        roleOverrides={roleOverrides}
        setRoleOverrides={setRoleOverrides}
        liberoId={liberoId} setLiberoId={setLiberoId}
        subPairings={subPairings} setSubPairings={setSubPairings}
        mbSwitches={mbSwitches} setMbSwitches={setMbSwitches}
        dragPositions={dragPositions} setDragPositions={setDragPositions}
        opponent={opponent} setOpponent={setOpponent}
        gameDate={gameDate} setGameDate={setGameDate}
        format={format} setFormat={setFormat}
        baseLineup={baseLineup} setBaseLineup={setBaseLineup}
        startingRotation={startingRotation} setStartingRotation={setStartingRotation}
        startServing={startServing} setStartServing={setStartServing}
        offenseFormationId={offenseFormationId} setOffenseFormationId={setOffenseFormationId}
        defenseFormationId={defenseFormationId} setDefenseFormationId={setDefenseFormationId}
        serveReceivePlayIds={serveReceivePlayIds} setServeReceivePlayIds={setServeReceivePlayIds}
        customFormations={team.customFormations || []}
        onStart={startGame}
        onReset={resetGame}
        onBack={onBack}
        finishedSets={finishedSets}
        setNum={setNum}
      />
    )
  }

  // LIVE VIEW
  return (
    <div className="app">
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <button className="ghost" onClick={onBack}>← Schedule</button>
          <div className="brand">{team.name}</div>
        </div>
        <div className="scoreboard">
          <div className="team-block">
            <div className="label">{team.name}</div>
            <div className="score">{ourScore}</div>
            <div className="ctrls">
              <button onClick={subOurPoint}>−</button>
              <button className="primary" onClick={addOurPoint}>+</button>
            </div>
            <div className={`serve-badge ${serving ? 'serving' : 'receiving'}`}>
              {serving ? 'Serving' : 'Receiving'}
            </div>
          </div>
          <div className="set-info">
            <div className="n">Set {setNum}</div>
            <div className="set-scores">
              {finishedSets.length > 0
                ? finishedSets.map((s, i) => <span key={i}>{s.ours}-{s.opp}{i < finishedSets.length - 1 ? ', ' : ''}</span>)
                : '—'}
            </div>
          </div>
          <div className="team-block">
            <div className="label">{opponent}</div>
            <div className="score">{oppScore}</div>
            <div className="ctrls">
              <button onClick={subOppPoint}>−</button>
              <button className="primary" onClick={addOppPoint}>+</button>
            </div>
            <div className="serve-badge receiving" style={{ visibility: 'hidden' }}>x</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="user-pill">
            <span className="uname">{session.username}</span>
            <span className={`rtag ${session.role}`}>{session.role}</span>
          </div>
          <button className="ghost" onClick={() => setView('setup')}>Edit Setup</button>
          <button className="ghost" onClick={() => setShowLineupCard(true)}>Lineup Card</button>
          <button className="danger" onClick={() => setShowEndSet(true)}>End Set</button>
          <button className="danger" onClick={() => setShowRestartConfirm(true)}>Restart Game</button>
          <button className="ghost" onClick={onLogout}>Logout</button>
        </div>
      </div>

      <div className="main">
        <div className="court-wrap">
          <div className="rotation-header">
            <div className="rot">Rotation {currentRotation} <small>(started at {startingRotation})</small></div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {serving ? 'We are serving — next point = hold serve' : 'We are receiving — next point = side out + rotate'}
            </div>
          </div>

          {liberoSwappedOutId && playerById[liberoSwappedOutId] && (
            <div className="info-banner">
              <strong>Libero swap:</strong>&nbsp;
              Libero replaced #{playerById[liberoSwappedOutId].number} {fullName(playerById[liberoSwappedOutId])} in the back row.
            </div>
          )}
          {liberoWarnings.length > 0 && (
            <div className="warn-banner">
              {liberoWarnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
            </div>
          )}
          <Court
            lineup={displayLineup}
            playerById={playerById}
            serving={serving}
            selectedSlot={courtSelected}
            onSlotClick={handleCourtClick}
            positions={positions}
            onPositionChange={(slot, xy) => {
              setDragPositions(prev => {
                const rot = currentRotation
                const cur = prev[rot] || {}
                return { ...prev, [rot]: { ...cur, [slot]: xy } }
              })
            }}
            onInvalidDrop={(msg) => showToast(msg)}
            mbSwitches={mbSwitches}
          />
        </div>

        <div className="sidebar">
          <div className="panel">
            <h3>Bench</h3>
            <div className={`sub-counter ${subsUsedThisSet >= 18 ? 'full' : subsUsedThisSet >= 17 ? 'critical' : subsUsedThisSet >= 15 ? 'warn' : ''}`}>
              Subs this set: <strong>{subsUsedThisSet}/{subLimit}</strong>
              {subsUsedThisSet >= 18 && <span className="tag">NO SUBS LEFT</span>}
              {subsUsedThisSet === 17 && <span className="tag">1 LEFT</span>}
              {subsUsedThisSet >= 15 && subsUsedThisSet < 17 && <span className="tag">{18 - subsUsedThisSet} LEFT</span>}
            </div>
            {benchPlayers.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>No bench players</div>}
            <div className="bench-list">
              {benchPlayers.map(p => {
                // Is this bench player paired with any on-court starter? (dual slots)
                const pairedInfo = []
                for (const [sid, val] of Object.entries(subPairings)) {
                  if (val.backRow === p.id) pairedInfo.push({ starter: playerById[sid], row: 'BR' })
                  if (val.frontRow === p.id) pairedInfo.push({ starter: playerById[sid], row: 'FR' })
                }
                return (
                  <div
                    key={p.id}
                    className={`bench-item ${benchSelected === p.id ? 'selected' : ''}`}
                    onClick={() => setBenchSelected(benchSelected === p.id ? null : p.id)}
                  >
                    <div className={`dot ${p.role}`}>{p.number}</div>
                    <div className="name">
                      {fullName(p) || '—'}
                      {pairedInfo.map((pi, i) => pi.starter && (
                        <div key={i} style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>
                          ↔ #{pi.starter.number} {pi.starter.lastName} ({pi.row})
                        </div>
                      ))}
                    </div>
                    <div className="role">{p.role}</div>
                  </div>
                )
              })}
            </div>
            {benchSelected && <div className="hint">Tap a player on the court to swap them out.</div>}
          </div>

          <div className="panel">
            <h3>Sub Log</h3>
            <div className="sub-log">
              {subs.length === 0 && <div>No subs yet</div>}
              {subs.slice().reverse().map(s => (
                <div className="entry" key={s.id}>
                  {s.label} — Set {s.setNum}, {s.scoreStr}
                </div>
              ))}
            </div>
          </div>

          <div className="panel actions">
            <h3>Quick</h3>
            <button onClick={() => { setCurrentRotation(r => (r % 6) + 1); setLiveLineup(null); setDismissedAlertKeys([]); setSubAlertIndex(0) }}>
              Advance Rotation →
            </button>
            <button className="ghost" onClick={() => setServing(s => !s)}>
              Toggle Serving
            </button>
            <button className="ghost" onClick={() => setShowFormations(true)}>
              Serve Receive
            </button>
            <button
              className="ghost"
              onClick={() => {
                setDragPositions(prev => {
                  const next = { ...prev }
                  delete next[currentRotation]
                  return next
                })
                showToast(`Rotation ${currentRotation} positions reset to default`)
              }}
            >
              Reset Positions
            </button>
            <button className="ghost" onClick={() => window.print()}>
              Print / Screenshot
            </button>
          </div>
        </div>
      </div>

      {showEndSet && (
        <div className="modal-backdrop" onClick={() => setShowEndSet(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>End Set {setNum}</h2>
            <p>Final score: <strong>{ourScore} - {oppScore}</strong></p>
            <p>Winner: <strong>{ourScore > oppScore ? team.name : opponent}</strong></p>
            <div className="row">
              <button className="ghost" onClick={() => setShowEndSet(false)}>Cancel</button>
              <button className="primary" onClick={endSet}>Confirm & Start New Set</button>
            </div>
          </div>
        </div>
      )}

      {showRestartConfirm && (
        <div className="modal-backdrop" onClick={() => setShowRestartConfirm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <h2 style={{ color: 'var(--danger)' }}>Restart Game?</h2>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)' }}>
              Are you sure you want to restart this game? <strong>All scores, rotations, substitutions, and set data will be permanently erased.</strong>
            </p>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
              Your roster, lineup, sub pairings, and other setup choices will be kept.
            </p>
            <div className="row">
              <button className="ghost" onClick={() => setShowRestartConfirm(false)}>Cancel</button>
              <button className="danger" onClick={restartGame}>Restart Game</button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && <div className="toast">{toastMsg}</div>}

      {showFormations && (
        <FormationsModal
          onClose={() => setShowFormations(false)}
          currentRotation={currentRotation}
          selectedPlayId={serveReceivePlayIds?.[currentRotation]}
          onApply={(play) => {
            setServeReceivePlayIds(prev => ({ ...(prev || {}), [currentRotation]: play.id }))
            // Clear any stale drag override for this rotation so the new play is used.
            setDragPositions(prev => {
              const next = { ...prev }
              delete next[currentRotation]
              return next
            })
            setShowFormations(false)
            showToast(`${play.label} applied to rotation ${currentRotation}`)
          }}
        />
      )}

      {showLineupCard && (
        <div className="modal-backdrop" onClick={() => setShowLineupCard(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <LineupCard
              teamName={team.name}
              opponent={opponent}
              baseLineup={baseLineup}
              startingRotation={startingRotation}
              playerById={playerById}
            />
            <div className="row">
              <button className="ghost" onClick={() => setShowLineupCard(false)}>Close</button>
              <button className="primary" onClick={() => window.print()}>Print</button>
            </div>
          </div>
        </div>
      )}

      {activeSubAlert && (() => {
        const alert = activeSubAlert
        const inPlayer = playerById[alert.subId]
        const outPlayer = playerById[alert.starterId]
        const posLabel = SLOT_ROLE_HINT[alert.slot] || alert.slot
        return (
          <div className="sub-alert-overlay">
            <div className="sub-alert-modal" onClick={e => e.stopPropagation()}>
              <div className="sub-alert-title">SUBSTITUTION</div>
              <div className="sub-alert-players">
                <div className="sub-alert-player in">
                  <div className={`sub-alert-dot ${inPlayer?.role || ''}`}>{inPlayer?.number}</div>
                  <div className="sub-alert-name">{fullName(inPlayer)}</div>
                  <div className="sub-alert-role">IN</div>
                </div>
                <div className="sub-alert-arrow">&#10132;</div>
                <div className="sub-alert-player out">
                  <div className={`sub-alert-dot ${outPlayer?.role || ''}`}>{outPlayer?.number}</div>
                  <div className="sub-alert-name">{fullName(outPlayer)}</div>
                  <div className="sub-alert-role">OUT</div>
                </div>
              </div>
              <div className="sub-alert-details">
                <span>Position: <strong>{posLabel}</strong></span>
                <span className="sub-alert-sep">|</span>
                <span>Rotation <strong>{currentRotation}</strong></span>
                <span className="sub-alert-sep">|</span>
                <span>{alert.rowType}</span>
              </div>
              <div className="sub-alert-counter">
                Subs used: <strong>{subsUsedThisSet}</strong> of <strong>{subLimit}</strong>
              </div>
              {pendingSubAlerts.length > 1 && (
                <div className="sub-alert-queue">
                  Sub {Math.min(subAlertIndex, pendingSubAlerts.length - 1) + 1} of {pendingSubAlerts.length}
                </div>
              )}
              <div className="sub-alert-actions">
                <button
                  className="sub-alert-confirm"
                  disabled={subsUsedThisSet >= subLimit}
                  onClick={() => {
                    if (subsUsedThisSet >= subLimit) {
                      showToast(`Sub limit reached for set ${setNum} (${subLimit}, NFHS)`)
                      return
                    }
                    const inId = alert.subId
                    const outId = alert.starterId
                    setLiveLineup(prev => ({ ...(prev || {}), [alert.slot]: inId }))
                    setSubs(prev => [...prev, {
                      id: uid(), slot: alert.slot,
                      inPlayerId: inId, outPlayerId: outId,
                      setNum, scoreStr: `${ourScore}-${oppScore}`,
                      label: `#${inPlayer?.number} ${fullName(inPlayer)} IN for #${outPlayer?.number} ${fullName(outPlayer)}`,
                    }])
                    setDismissedAlertKeys(prev => [...prev, alert.key])
                    setSubAlertIndex(i => Math.min(i, pendingSubAlerts.length - 2))
                  }}
                >
                  Confirm Sub
                </button>
                <button
                  className="sub-alert-skip"
                  onClick={() => {
                    setDismissedAlertKeys(prev => [...prev, alert.key])
                    setSubAlertIndex(i => Math.min(i, pendingSubAlerts.length - 2))
                  }}
                >
                  Skip / Not Now
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ============================================================
// Serve receive play card — court diagram with setter arrow,
// libero highlight, passer zones, MB approach arrows.
// ============================================================
function ServeReceivePlayCard({ play, selected, onPick, compact = false }) {
  if (!play) return null
  return (
    <button
      type="button"
      className={`sr-play-card ${selected ? 'selected' : ''} ${compact ? 'compact' : ''}`}
      onClick={onPick}
    >
      <div className="sr-play-court">
        <svg className="sr-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
          {/* Net */}
          <line x1="0" y1="1" x2="100" y2="1" stroke="#fff" strokeWidth="0.8" strokeDasharray="2 1.5" />
          {/* Attack line */}
          <line x1="0" y1="33" x2="100" y2="33" stroke="rgba(255,255,255,0.2)" strokeWidth="0.4" strokeDasharray="1.5 1.5" />
          {/* Passer zones — soft ellipses around passers */}
          {SLOTS.map(slot => {
            const pos = play.positions[slot]
            if (!pos.passer) return null
            return (
              <ellipse
                key={`z-${slot}`}
                cx={pos.x}
                cy={pos.y}
                rx="14"
                ry="11"
                fill={pos.libero ? 'rgba(249,115,22,0.22)' : 'rgba(78,161,255,0.18)'}
                stroke={pos.libero ? 'rgba(249,115,22,0.55)' : 'rgba(78,161,255,0.4)'}
                strokeWidth="0.4"
              />
            )
          })}
          {/* Arrows: setter release + MB/hider approach */}
          <defs>
            <marker id={`srArrow-${play.id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#fff" />
            </marker>
          </defs>
          {SLOTS.map(slot => {
            const pos = play.positions[slot]
            if (!pos.approach) return null
            const isSetter = pos.setter
            return (
              <line
                key={`a-${slot}`}
                x1={pos.x} y1={pos.y}
                x2={pos.approach.x} y2={pos.approach.y}
                stroke={isSetter ? '#ffd76a' : 'rgba(255,255,255,0.75)'}
                strokeWidth={isSetter ? '0.9' : '0.6'}
                strokeDasharray={isSetter ? '0' : '1.4 1.4'}
                markerEnd={`url(#srArrow-${play.id})`}
              />
            )
          })}
        </svg>
        {SLOTS.map(slot => {
          const pos = play.positions[slot]
          let cls = 'sr-dot'
          if (pos.setter) cls += ' setter'
          else if (pos.libero) cls += ' libero'
          else if (pos.passer) cls += ' passer'
          else if (pos.mbHide) cls += ' mb'
          else if (pos.hide) cls += ' hide'
          const label = pos.setter ? 'S' : pos.libero ? 'L' : pos.mbHide ? 'MB' : slot
          return (
            <div
              key={slot}
              className={cls}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              title={`${slot} · ${pos.kind}`}
            >
              {label}
            </div>
          )
        })}
      </div>
      <div className="sr-play-head">
        <div className="sr-play-title">{play.label}</div>
        {selected && <div className="sr-selected-tag">✓ Selected</div>}
      </div>
      <div className="sr-play-desc">{play.description}</div>
    </button>
  )
}

// ============================================================
// Setup view (inside a game)
// ============================================================
function SetupView(props) {
  const {
    session, onLogout, onHome,
    team, game, roster, rawRoster, roleOverrides, setRoleOverrides,
    liberoId, setLiberoId, subPairings, setSubPairings,
    mbSwitches, setMbSwitches,
    dragPositions, setDragPositions,
    opponent, setOpponent, gameDate, setGameDate, format, setFormat,
    baseLineup, setBaseLineup,
    startingRotation, setStartingRotation, startServing, setStartServing,
    offenseFormationId, setOffenseFormationId,
    defenseFormationId, setDefenseFormationId,
    serveReceivePlayIds, setServeReceivePlayIds,
    customFormations = [],
    onStart, onReset, onBack, finishedSets, setNum,
  } = props

  const [step, setStep] = useState(1)
  const [dragId, setDragId] = useState(null)
  const [cheatRotation, setCheatRotation] = useState(null)
  const [srRotationTab, setSrRotationTab] = useState(1)

  const selectedOffense = findFormation(offenseFormationId, customFormations)
  const selectedDefense = findFormation(defenseFormationId, customFormations)

  function pickServeReceivePlay(rotation, playId) {
    setServeReceivePlayIds(prev => ({ ...(prev || {}), [rotation]: playId }))
  }

  const playerById = useMemo(() => {
    const m = {}
    for (const p of roster) m[p.id] = p
    return m
  }, [roster])

  const assignedIds = new Set(Object.values(baseLineup).filter(Boolean))
  const lineupComplete = SLOTS.every(s => baseLineup[s])
  const rosterEmpty = roster.length === 0

  const ASSIGN_COORDS = {
    P4: { x: 18, y: 28 }, P3: { x: 50, y: 28 }, P2: { x: 82, y: 28 },
    P5: { x: 18, y: 72 }, P6: { x: 50, y: 72 }, P1: { x: 82, y: 72 },
  }

  const totalSets = format === 5 ? 5 : 3
  const STEPS = [
    { num: 1, label: 'Game Info' },
    { num: 2, label: 'Lineup' },
    { num: 3, label: 'Formation' },
    { num: 4, label: 'Subs' },
  ]

  function assignSlot(slot, playerId) {
    setBaseLineup(bl => {
      const nbl = { ...bl }
      for (const s of SLOTS) if (nbl[s] === playerId) nbl[s] = null
      nbl[slot] = playerId
      return nbl
    })
  }
  function clearSlot(slot) {
    setBaseLineup(bl => ({ ...bl, [slot]: null }))
  }
  function pickFormation(f) {
    if (f.category === 'offense') setOffenseFormationId(f.id)
    else if (f.category === 'defense') setDefenseFormationId(f.id)
  }

  function next() { if (step < 4) setStep(step + 1) }
  function back() { if (step > 1) setStep(step - 1) }

  const canAdvance = (
    step === 1 ? !!opponent.trim() :
    step === 2 ? lineupComplete :
    true
  )

  return (
    <div className="dashboard">
      <HeaderBar
        session={session}
        onLogout={onLogout}
        onHome={onHome}
        title={team.name}
        subtitle={`Set ${setNum} of ${totalSets} — vs ${opponent || 'Opponent'}`}
        leftActions={<button className="ghost" onClick={onBack}>← Schedule</button>}
        rightActions={<button className="ghost" onClick={onReset}>Reset Game</button>}
      />

      <div className="wizard-stepper">
        {STEPS.map(s => (
          <button
            key={s.num}
            type="button"
            className={`step-pill ${step === s.num ? 'active' : ''} ${step > s.num ? 'done' : ''}`}
            onClick={() => setStep(s.num)}
          >
            <div className="step-num">{step > s.num ? '✓' : s.num}</div>
            <div className="step-label">{s.label}</div>
          </button>
        ))}
        <div className="step-progress">Step {step} of 4</div>
      </div>

      {step === 1 && (
        <div className="wizard-step">
          <div className="wizard-step-head">
            <h2>Game Info</h2>
            <p>Who are you playing, and how does the match begin?</p>
          </div>

          <div className="big-form">
            <div className="big-field">
              <label>Opponent</label>
              <input
                className="big-input"
                placeholder="e.g. Jefferson High"
                value={opponent}
                onChange={e => setOpponent(e.target.value)}
              />
            </div>

            <div className="big-form-row">
              <div className="big-field">
                <label>Date</label>
                <input
                  type="date"
                  className="big-input"
                  value={gameDate || ''}
                  onChange={e => setGameDate(e.target.value)}
                />
              </div>
              <div className="big-field">
                <label>Format</label>
                <div className="seg-toggle">
                  <button
                    type="button"
                    className={format === 3 ? 'active' : ''}
                    onClick={() => setFormat(3)}
                  >Best of 3</button>
                  <button
                    type="button"
                    className={format === 5 ? 'active' : ''}
                    onClick={() => setFormat(5)}
                  >Best of 5</button>
                </div>
              </div>
            </div>

            <div className="big-field">
              <label>Who's serving first?</label>
              <div className="serve-toggle">
                <button
                  type="button"
                  className={`serve-side ${startServing ? 'active' : ''}`}
                  onClick={() => setStartServing(true)}
                >
                  <div className="serve-icon"><IconPlay size={22} /></div>
                  <div className="serve-name">{team.name}</div>
                  <div className="serve-tag">US</div>
                </button>
                <div className="serve-vs">VS</div>
                <button
                  type="button"
                  className={`serve-side ${!startServing ? 'active' : ''}`}
                  onClick={() => setStartServing(false)}
                >
                  <div className="serve-icon"><IconPlay size={22} /></div>
                  <div className="serve-name">{opponent || 'Opponent'}</div>
                  <div className="serve-tag">THEM</div>
                </button>
              </div>
            </div>

            <div className="big-field">
              <label>Starting Rotation</label>
              <div className="seg-toggle rot">
                {[1,2,3,4,5,6].map(n => (
                  <button
                    key={n}
                    type="button"
                    className={startingRotation === n ? 'active' : ''}
                    onClick={() => setStartingRotation(n)}
                  >{n}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="wizard-step">
          <div className="wizard-step-head">
            <h2>Starting Lineup</h2>
            <p>Drag a player chip onto a court position. Front row sits at the net.</p>
          </div>

          {rosterEmpty ? (
            <div className="empty-state">
              No players on this team's roster yet. Go back to Team Home → Roster to add players.
            </div>
          ) : (
            <div className="lineup-layout">
              <div className="big-court-wrap">
                <div className="court-row-label">⬆ FRONT ROW (at the net)</div>
                <div className="big-court" onDragOver={e => e.preventDefault()}>
                  <div className="big-court-net" />
                  {SLOTS.map(slot => {
                    const { x, y } = ASSIGN_COORDS[slot]
                    const pid = baseLineup[slot]
                    const p = pid ? playerById[pid] : null
                    return (
                      <div
                        key={slot}
                        className={`big-zone ${p ? 'filled' : ''} ${dragId ? 'targetable' : ''}`}
                        style={{ left: `${x}%`, top: `${y}%` }}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => {
                          e.preventDefault()
                          const id = e.dataTransfer.getData('text/plain') || dragId
                          if (id) assignSlot(slot, id)
                          setDragId(null)
                        }}
                        onClick={() => {
                          if (dragId) {
                            assignSlot(slot, dragId)
                            setDragId(null)
                          } else if (p) {
                            clearSlot(slot)
                          }
                        }}
                      >
                        <div className="zone-label">
                          {slot}{slot === 'P1' ? ' · server' : ''}
                        </div>
                        {p ? (
                          <div className={`zone-player ${p.role}`}>
                            <div className="zone-num">#{p.number}</div>
                            <div className="zone-name">{shortName(p)}</div>
                            <div className="zone-role">{p.role}</div>
                          </div>
                        ) : (
                          <div className="zone-empty">+</div>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div className="court-row-label">⬇ BACK ROW</div>
              </div>

              <div className="lineup-side">
                <h3>Roster ({roster.length})</h3>
                <div className="big-chip-list">
                  {roster.map(p => {
                    const onCourt = assignedIds.has(p.id)
                    return (
                      <div
                        key={p.id}
                        className={`big-chip ${p.role} ${onCourt ? 'on-court' : ''} ${dragId === p.id ? 'dragging' : ''}`}
                        draggable={!onCourt}
                        onDragStart={e => {
                          if (onCourt) { e.preventDefault(); return }
                          e.dataTransfer.setData('text/plain', p.id)
                          e.dataTransfer.effectAllowed = 'move'
                          setDragId(p.id)
                        }}
                        onDragEnd={() => setDragId(null)}
                        onClick={() => {
                          if (onCourt) return
                          setDragId(dragId === p.id ? null : p.id)
                        }}
                      >
                        <div className="chip-num">{p.number}</div>
                        <div className="chip-name">{fullName(p) || '—'}</div>
                        <div className="chip-role">{p.role}</div>
                        {onCourt && <div className="chip-check">✓</div>}
                      </div>
                    )
                  })}
                </div>
                <div className="lineup-libero">
                  <label>Libero (auto back-row swap)</label>
                  <select value={liberoId || ''} onChange={e => setLiberoId(e.target.value || null)}>
                    <option value="">— None —</option>
                    {rawRoster.map(p => (
                      <option key={p.id} value={p.id}>#{p.number} {fullName(p)}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {!rosterEmpty && !lineupComplete && (
            <div className="step-hint">Place all 6 players to continue. Tap a filled zone to clear it.</div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="wizard-step">
          <div className="wizard-step-head">
            <h2>Formations & Serve Receive</h2>
            <p>Pick your offensive and defensive systems, then choose a serve-receive play for each of the 6 rotations.</p>
          </div>

          {CATEGORY_ORDER.map(cat => {
            const formations = getFormationsByCategory(cat, customFormations)
            const selectedId = cat === 'offense' ? offenseFormationId : defenseFormationId
            const selected = cat === 'offense' ? selectedOffense : selectedDefense
            return (
              <div key={cat} className="formation-category-block">
                <div className="formation-category-head">
                  <h3>{CATEGORY_LABELS[cat]}</h3>
                  {selected && (
                    <span className="formation-current">Current: <strong>{selected.name}</strong></span>
                  )}
                </div>
                <div className="formation-picker">
                  {formations.map(f => {
                    const positions = getRotationPositions(f, startingRotation)
                    return (
                      <button
                        key={f.id}
                        type="button"
                        className={`formation-pick-card ${selectedId === f.id ? 'selected' : ''}`}
                        onClick={() => pickFormation(f)}
                      >
                        <div className="big-mini-court">
                          <div className="bmc-net" />
                          {SLOTS.map(slot => {
                            const pos = positions[slot]
                            return (
                              <div
                                key={slot}
                                className={`bmc-dot ${pos.passer ? 'passer' : 'nonpasser'} ${pos.setter ? 'setter' : ''}`}
                                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                              >
                                {slot}
                              </div>
                            )
                          })}
                        </div>
                        <div className="formation-pick-title">
                          {f.name}
                          {!f.builtin && <span className="ft-badge custom">Custom</span>}
                        </div>
                        <div className="formation-pick-desc">{f.description}</div>
                        {selectedId === f.id && <div className="selected-tag">✓ Selected</div>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          <div className="formation-category-block sr-block">
            <div className="formation-category-head">
              <h3>Serve Receive</h3>
              <span className="formation-current">
                Setter is always hidden · pick one option per rotation
              </span>
            </div>

            <div className="sr-rotation-tabs">
              {[1,2,3,4,5,6].map(r => {
                const picked = serveReceivePlayIds?.[r]
                const pickedPlay = findSrPlay(picked)
                return (
                  <button
                    key={r}
                    type="button"
                    className={`sr-rot-tab ${srRotationTab === r ? 'active' : ''}`}
                    onClick={() => setSrRotationTab(r)}
                  >
                    <div className="sr-rot-num">R{r}</div>
                    <div className="sr-rot-pick">
                      {pickedPlay ? pickedPlay.label : '— none —'}
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="sr-play-grid">
              {getPlaysForRotation(srRotationTab).map(play => (
                <ServeReceivePlayCard
                  key={play.id}
                  play={play}
                  selected={serveReceivePlayIds?.[srRotationTab] === play.id}
                  onPick={() => pickServeReceivePlay(srRotationTab, play.id)}
                />
              ))}
            </div>

            <div className="sr-legend">
              <span className="sr-leg-item"><span className="sr-leg-dot setter" />Setter (hidden)</span>
              <span className="sr-leg-item"><span className="sr-leg-dot libero" />Libero</span>
              <span className="sr-leg-item"><span className="sr-leg-dot passer" />Passer</span>
              <span className="sr-leg-item"><span className="sr-leg-dot mb" />MB hide</span>
              <span className="sr-leg-item"><span className="sr-leg-dot hide" />Hider</span>
              <span className="sr-leg-item"><span className="sr-leg-arrow" />→ Release / approach</span>
            </div>
          </div>

          {(selectedOffense || selectedDefense) && (
            <div className="cheat-sheet-wrap">
              {[selectedOffense, selectedDefense].filter(Boolean).map(f => (
                <FormationCheatSheet
                  key={f.id}
                  formation={f}
                  collapsible
                  activeRotation={cheatRotation || startingRotation}
                  onPickRotation={setCheatRotation}
                  baseLineup={lineupComplete ? baseLineup : null}
                  playerById={playerById}
                />
              ))}
            </div>
          )}

          <div className="step-hint">
            Tap a rotation above, then pick the option you want. The coach can swap in-game from the court toolbar.
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="wizard-step">
          <div className="wizard-step-head">
            <h2>Substitution Pairings</h2>
            <p>Pair each starter with up to two subs — one for when they rotate to the back row and one for the front row. Either slot can be left empty.</p>
          </div>

          {rosterEmpty ? (
            <div className="empty-state">No players on the roster.</div>
          ) : !lineupComplete ? (
            <div className="empty-state">Finish the lineup in step 2 to set up subs for your starters.</div>
          ) : (
            <div className="sub-card-grid">
              {SLOTS.map(slot => {
                const pid = baseLineup[slot]
                if (!pid) return null
                const p = playerById[pid]
                if (!p) return null
                const pairing = subPairings[p.id] || { backRow: null, frontRow: null }
                const usedIds = allAssignedSubIds(subPairings)

                function makeCandidates(currentVal) {
                  return rawRoster.filter(q =>
                    q.id !== p.id &&
                    !assignedIds.has(q.id) &&
                    (q.id === currentVal || !usedIds.has(q.id))
                  )
                }

                function updateSlot(slotType, value) {
                  setSubPairings(prev => {
                    const next = { ...prev }
                    const cur = next[p.id] || { backRow: null, frontRow: null }
                    next[p.id] = { ...cur, [slotType]: value || null }
                    if (!next[p.id].backRow && !next[p.id].frontRow) delete next[p.id]
                    return next
                  })
                }

                const backCandidates = makeCandidates(pairing.backRow)
                const frontCandidates = makeCandidates(pairing.frontRow)

                return (
                  <div key={p.id} className="sub-card">
                    <div className="sub-card-head">
                      <div className={`sub-card-dot ${p.role}`}>{p.number}</div>
                      <div className="sub-card-info">
                        <div className="sub-card-name">{fullName(p) || '—'}</div>
                        <div className="sub-card-meta">{p.role} · {slot}</div>
                      </div>
                    </div>
                    <div className="sub-card-slots">
                      <div className="sub-card-slot">
                        <label>Back Row Sub</label>
                        <select
                          value={pairing.backRow || ''}
                          onChange={e => updateSlot('backRow', e.target.value)}
                        >
                          <option value="">— None —</option>
                          {backCandidates.map(q => (
                            <option key={q.id} value={q.id}>
                              #{q.number} {fullName(q)} ({q.role})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sub-card-slot">
                        <label>Front Row Sub</label>
                        <select
                          value={pairing.frontRow || ''}
                          onChange={e => updateSlot('frontRow', e.target.value)}
                        >
                          <option value="">— None —</option>
                          {frontCandidates.map(q => (
                            <option key={q.id} value={q.id}>
                              #{q.number} {fullName(q)} ({q.role})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div className="wizard-footer">
        <button className="ghost" onClick={step === 1 ? onBack : back}>
          {step === 1 ? '← Cancel' : '← Back'}
        </button>
        <div className="wizard-progress-bar">
          <div className="wizard-progress-fill" style={{ width: `${(step / 4) * 100}%` }} />
        </div>
        {step < 4 ? (
          <button
            className="primary"
            onClick={next}
            disabled={!canAdvance}
          >
            Next →
          </button>
        ) : (
          <button
            className="primary big-start"
            onClick={onStart}
            disabled={!lineupComplete}
          >
            Start Game
          </button>
        )}
      </div>
    </div>
  )
}

function playerByIdIn(roster, id) {
  return roster.find(p => p.id === id)
}

// ============================================================
// Court
// ============================================================
function Court({
  lineup, playerById, serving, selectedSlot, onSlotClick,
  positions, onPositionChange, onInvalidDrop,
  mbSwitches,
}) {
  const courtRef = useRef(null)
  const [dragging, setDragging] = useState(null) // { slot, x, y, valid }

  function onPointerDown(e, slot) {
    e.preventDefault()
    e.stopPropagation()
    const rect = courtRef.current.getBoundingClientRect()
    const startX = ((e.clientX - rect.left) / rect.width) * 100
    const startY = ((e.clientY - rect.top) / rect.height) * 100
    setDragging({ slot, x: positions[slot].x, y: positions[slot].y, valid: true, startX, startY, origX: positions[slot].x, origY: positions[slot].y })
    e.target.setPointerCapture?.(e.pointerId)
  }

  function onPointerMove(e) {
    if (!dragging) return
    const rect = courtRef.current.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * 100
    const py = ((e.clientY - rect.top) / rect.height) * 100
    const nx = Math.max(8, Math.min(92, px))
    const ny = Math.max(8, Math.min(92, py))
    const testPos = { ...positions, [dragging.slot]: { x: nx, y: ny } }
    const valid = overlapErrors(testPos).length === 0
    setDragging(d => ({ ...d, x: nx, y: ny, valid }))
  }

  function onPointerUp() {
    if (!dragging) return
    const { slot, x, y, valid, origX, origY } = dragging
    if (valid) {
      onPositionChange(slot, { x, y })
    } else {
      const next = { ...positions, [slot]: { x, y } }
      const errs = overlapErrors(next)
      onInvalidDrop?.(errs[0] || 'Overlap violation')
    }
    setDragging(null)
  }

  // MB switch arrows: for each MB in front row with a switch target, draw arrow
  const mbArrows = useMemo(() => {
    const arrows = []
    for (const slot of FRONT_SLOTS) {
      const pid = lineup[slot]
      const p = pid ? playerById[pid] : null
      if (!p || p.role !== 'MB') continue
      const target = mbSwitches?.[pid]
      if (!target || !FRONT_SLOTS.includes(target) || target === slot) continue
      const from = positions[slot]
      const to = positions[target]
      if (from && to) arrows.push({ from, to, key: `${slot}-${target}` })
    }
    return arrows
  }, [lineup, playerById, mbSwitches, positions])

  return (
    <div
      className={`court ${dragging ? 'dragging' : ''}`}
      ref={courtRef}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      style={{ touchAction: 'none' }}
    >
      <div className="net" />
      <div className="attack-line ours" />

      {/* Drop zone overlay when dragging */}
      {dragging && (
        <div className={`drop-hint ${dragging.valid ? 'ok' : 'bad'}`}>
          {dragging.valid ? '✓ Valid position' : '✗ Overlap violation'}
        </div>
      )}

      {/* MB switch arrows */}
      {mbArrows.length > 0 && (
        <svg className="mb-arrows" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
              <polygon points="0 0, 6 3, 0 6" fill="var(--accent)" />
            </marker>
          </defs>
          {mbArrows.map(a => (
            <line
              key={a.key}
              x1={a.from.x} y1={a.from.y}
              x2={a.to.x}  y2={a.to.y}
              stroke="var(--accent)" strokeWidth="0.6"
              strokeDasharray="1.5 1.5"
              markerEnd="url(#arrowhead)"
            />
          ))}
        </svg>
      )}

      {SLOTS.map(slot => {
        const basePos = positions[slot]
        const isDragging = dragging && dragging.slot === slot
        const x = isDragging ? dragging.x : basePos.x
        const y = isDragging ? dragging.y : basePos.y
        const pid = lineup[slot]
        const p = pid ? playerById[pid] : null
        const isFrontRow = FRONT_SLOTS.includes(slot)
        const illegal = p && p.role === 'L' && isFrontRow
        const isServer = slot === 'P1' && serving
        return (
          <div key={slot}>
            <div className="slot-label" style={{ left: `${basePos.x}%`, top: `${basePos.y - 10}%` }}>{slot}</div>
            {p && (
              <div
                className={`player ${p.role} ${isServer ? 'serving' : ''} ${selectedSlot === slot ? 'selected' : ''} ${illegal ? 'illegal' : ''} ${isDragging ? `is-dragging ${dragging.valid ? 'drag-ok' : 'drag-bad'}` : ''}`}
                style={{ left: `${x}%`, top: `${y}%` }}
                onPointerDown={(e) => onPointerDown(e, slot)}
                onClick={(e) => { if (!dragging) onSlotClick(slot) }}
                title={`${SLOT_ROLE_HINT[slot]} • ${fullName(p)}`}
              >
                <div className="num">{p.number}</div>
                <div className="name">{shortName(p)}</div>
                {(p.role === 'S' || p.role === 'L') && (
                  <div className="role-badge">{p.role}</div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ============================================================
// Lineup card
// ============================================================
function LineupCard({ teamName, opponent, baseLineup, startingRotation, playerById }) {
  const rows = []
  for (let r = 1; r <= 6; r++) {
    const lineup = computeLineup(baseLineup, startingRotation, r)
    rows.push({ rotation: r, lineup })
  }
  return (
    <div className="lineup-card">
      <h2>{teamName} vs {opponent}</h2>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>Starting Rotation: {startingRotation}</div>
      <table>
        <thead>
          <tr><th>Rot</th><th>P1 (Serve)</th><th>P2</th><th>P3</th><th>P4</th><th>P5</th><th>P6</th></tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.rotation}>
              <td><strong>{row.rotation}</strong></td>
              {['P1','P2','P3','P4','P5','P6'].map(s => {
                const p = playerById[row.lineup[s]]
                return <td key={s}>{p ? `#${p.number} ${fullName(p)}` : '—'}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================
// Formations library (per team)
// ============================================================
function FormationsView({ session, onLogout, onHome, team, onBack, onChanged }) {
  const [custom, setCustom] = useState(team.customFormations || [])
  const [editing, setEditing] = useState(null)
  const [previewId, setPreviewId] = useState(null)
  const [previewRotation, setPreviewRotation] = useState(1)

  useEffect(() => {
    setCustom(team.customFormations || [])
  }, [team.id, team.customFormations])

  const allByCategory = useMemo(() => {
    const out = {}
    for (const cat of CATEGORY_ORDER) {
      out[cat] = getFormationsByCategory(cat, custom)
    }
    return out
  }, [custom])

  const previewFormation = previewId ? findFormation(previewId, custom) : null

  function handleSave(formation) {
    saveCustomFormation(team.id, formation)
    setCustom(listCustomFormations(team.id))
    setEditing(null)
    onChanged && onChanged()
  }
  function handleDelete(id) {
    if (!confirm('Delete this custom formation?')) return
    deleteCustomFormation(team.id, id)
    setCustom(listCustomFormations(team.id))
    if (previewId === id) setPreviewId(null)
    onChanged && onChanged()
  }

  return (
    <div className="dashboard">
      <HeaderBar
        session={session}
        onLogout={onLogout}
        onHome={onHome}
        title={team.name}
        subtitle="Formations library"
        leftActions={<button className="ghost" onClick={onBack}>← {team.name}</button>}
      />

      <div className="formations-layout">
        <div className="formations-list">
          {CATEGORY_ORDER.map(cat => (
            <div key={cat} className="panel formation-cat-panel">
              <div className="formation-cat-head">
                <h3>{CATEGORY_LABELS[cat]}</h3>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setEditing(makeCustomFormationDraft(cat))}
                >
                  + Custom {CATEGORY_LABELS[cat]}
                </button>
              </div>
              <div className="formation-cat-grid">
                {allByCategory[cat].map(f => (
                  <button
                    key={f.id}
                    type="button"
                    className={`formation-tile ${previewId === f.id ? 'selected' : ''} ${f.builtin ? 'builtin' : 'custom'}`}
                    onClick={() => { setPreviewId(f.id); setPreviewRotation(1) }}
                  >
                    <div className="ft-mini-court">
                      <div className="ft-net" />
                      {SLOTS.map(slot => {
                        const pos = getRotationPositions(f, 1)[slot]
                        return (
                          <div
                            key={slot}
                            className={`ft-dot ${pos.passer ? 'passer' : ''} ${pos.setter ? 'setter' : ''}`}
                            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                          >
                            {slot}
                          </div>
                        )
                      })}
                    </div>
                    <div className="ft-title">
                      {f.name}
                      {f.builtin ? <span className="ft-badge builtin">Built-in</span> : <span className="ft-badge custom">Custom</span>}
                    </div>
                    <div className="ft-desc">{f.description}</div>
                    {!f.builtin && (
                      <div className="ft-actions" onClick={e => e.stopPropagation()}>
                        <button type="button" className="ghost" onClick={() => setEditing({ ...f })}>Edit</button>
                        <button type="button" className="danger" onClick={() => handleDelete(f.id)}>Delete</button>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="panel formations-preview">
          <h3>Preview</h3>
          {!previewFormation ? (
            <div className="empty-state" style={{ marginTop: 10 }}>
              Pick a formation to preview its 6-rotation cheat sheet.
            </div>
          ) : (
            <>
              <div className="preview-head">
                <div className="preview-name">{previewFormation.name}</div>
                <div className="preview-cat">{CATEGORY_LABELS[previewFormation.category]}</div>
              </div>
              <div className="preview-desc">{previewFormation.description}</div>
              <FormationCheatSheet
                formation={previewFormation}
                activeRotation={previewRotation}
                onPickRotation={setPreviewRotation}
              />
            </>
          )}
        </div>
      </div>

      {editing && (
        <FormationEditorModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}

// ============================================================
// Rotation cheat sheet (collapsible, shows all 6 rotations)
// ============================================================
function FormationCheatSheet({ formation, activeRotation, onPickRotation, collapsible = false, baseLineup, playerById }) {
  const [open, setOpen] = useState(!collapsible)
  if (!formation) return null
  const rotations = [1, 2, 3, 4, 5, 6]

  return (
    <div className="cheat-sheet">
      {collapsible && (
        <button type="button" className="cheat-toggle" onClick={() => setOpen(o => !o)}>
          {open ? '▼' : '▶'} Rotation Cheat Sheet — {formation.name}
        </button>
      )}
      {open && (
        <div className="cheat-grid">
          {rotations.map(r => {
            const positions = getRotationPositions(formation, r)
            return (
              <button
                key={r}
                type="button"
                className={`cheat-card ${activeRotation === r ? 'active' : ''}`}
                onClick={() => onPickRotation && onPickRotation(r)}
              >
                <div className="cheat-label">Rotation {r}</div>
                <div className="cheat-mini-court">
                  <div className="cmc-net" />
                  {SLOTS.map(slot => {
                    const pos = positions[slot]
                    const pid = baseLineup ? computeLineup(baseLineup, 1, r)[slot] : null
                    const p = pid && playerById ? playerById[pid] : null
                    return (
                      <div
                        key={slot}
                        className={`cmc-dot ${pos.passer ? 'passer' : ''} ${pos.setter ? 'setter' : ''} ${p ? `role-${p.role}` : ''}`}
                        style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                        title={p ? `${slot} · #${p.number} ${fullName(p)}` : slot}
                      >
                        {p ? p.number : slot}
                      </div>
                    )
                  })}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Custom formation editor modal
// ============================================================
function FormationEditorModal({ initial, onClose, onSave }) {
  const [formation, setFormation] = useState(initial)
  const [dragging, setDragging] = useState(null)
  const courtRef = useRef(null)

  function updatePosition(slot, x, y) {
    setFormation(f => ({
      ...f,
      positions: { ...f.positions, [slot]: { ...f.positions[slot], x, y } },
    }))
  }

  function handlePointerMove(e) {
    if (!dragging || !courtRef.current) return
    const rect = courtRef.current.getBoundingClientRect()
    const x = Math.max(2, Math.min(98, ((e.clientX - rect.left) / rect.width) * 100))
    const y = Math.max(2, Math.min(98, ((e.clientY - rect.top) / rect.height) * 100))
    updatePosition(dragging, x, y)
  }
  function handlePointerUp() { setDragging(null) }

  useEffect(() => {
    if (!dragging) return
    const move = (e) => handlePointerMove(e)
    const up = () => handlePointerUp()
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [dragging])

  function handleSave() {
    if (!formation.name.trim()) {
      alert('Give the formation a name.')
      return
    }
    onSave(formation)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal formation-editor-modal" onClick={e => e.stopPropagation()}>
        <h2>{initial.builtin === false && initial.name ? 'Edit Formation' : 'New Custom Formation'}</h2>
        <div className="form-row">
          <label>Name</label>
          <input
            autoFocus
            value={formation.name}
            onChange={e => setFormation(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Swing Offense vs. Float Serve"
          />
        </div>
        <div className="form-row">
          <label>Category</label>
          <select
            value={formation.category}
            onChange={e => setFormation(f => ({ ...f, category: e.target.value }))}
          >
            {CATEGORY_ORDER.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </div>
        <div className="form-row">
          <label>Description</label>
          <input
            value={formation.description || ''}
            onChange={e => setFormation(f => ({ ...f, description: e.target.value }))}
            placeholder="Short note about when to use this"
          />
        </div>
        {formation.category !== 'defense' && (
          <div className="form-row">
            <label>Setter starts at (rotation 1)</label>
            <select
              value={formation.setterStart || ''}
              onChange={e => setFormation(f => ({ ...f, setterStart: e.target.value || null }))}
            >
              <option value="">— none —</option>
              {SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}

        <div className="editor-hint">
          Drag each slot marker to where that player should line up at rotation 1.
          Rotations 2–6 are computed automatically; the setter tag rotates with the setter.
        </div>

        <div
          ref={courtRef}
          className="editor-court"
          onPointerMove={handlePointerMove}
        >
          <div className="editor-net" />
          <div className="editor-attack" />
          {SLOTS.map(slot => {
            const pos = formation.positions[slot]
            const isSetter = formation.setterStart === slot
            return (
              <div
                key={slot}
                className={`editor-dot ${isSetter ? 'setter' : ''} ${dragging === slot ? 'dragging' : ''}`}
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                onPointerDown={e => { e.preventDefault(); setDragging(slot) }}
              >
                {slot}
              </div>
            )
          })}
        </div>

        <div className="row">
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="primary" onClick={handleSave}>Save Formation</button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Login + User Admin
// ============================================================
function SetOverScreen({ session, onLogout, onHome, team, opponent, setNum, format, lastSet, winnerName, ourSets, theirSets, matchOver, matchWinnerName, onContinue, onBack }) {
  return (
    <div className="dashboard">
      <HeaderBar
        session={session}
        onLogout={onLogout}
        onHome={onHome}
        title={team.name}
        subtitle={matchOver ? 'Match Over' : `Set ${setNum} Over`}
        leftActions={<button className="ghost" onClick={onBack}>← Schedule</button>}
      />

      <div className="setover-hero">
        <div className="setover-label">{matchOver ? 'Match Final' : `Set ${setNum} Final`}</div>
        <div className="setover-score">
          <div className={`side ${lastSet?.winner === 'us' ? 'winner' : ''}`}>
            <div className="team-name">{team.name}</div>
            <div className="big">{lastSet?.ours}</div>
          </div>
          <div className="dash">—</div>
          <div className={`side ${lastSet?.winner === 'them' ? 'winner' : ''}`}>
            <div className="team-name">{opponent}</div>
            <div className="big">{lastSet?.opp}</div>
          </div>
        </div>
        <div className="setover-winner">
          {matchOver ? `${matchWinnerName} wins the match` : `${winnerName} wins the set`}
        </div>
        <div className="setover-match">
          Match: <strong>{ourSets}</strong>–<strong>{theirSets}</strong> in sets (best of {format === 5 ? 5 : 3})
        </div>
        <div style={{ marginTop: 24, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          {matchOver ? (
            <button className="primary" onClick={onBack}>Back to Schedule</button>
          ) : (
            <>
              <button className="primary" onClick={onContinue}>Set Up Next Set →</button>
              <button className="ghost" onClick={onBack}>Back to Schedule</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function FormationsModal({ onClose, onApply, currentRotation = 1, selectedPlayId = null }) {
  const plays = getPlaysForRotation(currentRotation)
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal sr-modal" onClick={e => e.stopPropagation()}>
        <h2>Serve Receive · Rotation {currentRotation}</h2>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
          Setter is hidden in every option. Tap a card to apply it to the current rotation.
        </div>
        <div className="sr-play-grid">
          {plays.map(play => (
            <ServeReceivePlayCard
              key={play.id}
              play={play}
              selected={selectedPlayId === play.id}
              onPick={() => onApply(play)}
            />
          ))}
        </div>
        <div className="row">
          <button className="ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

