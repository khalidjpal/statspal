import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  ensureTeamRecord, getTeam, updateTeam, setRoster as saveRoster,
  createGame, getGame, updateGame, deleteGame, resetGameState,
  listCustomFormations, saveCustomFormation, deleteCustomFormation,
  listGameplans, saveGameplan, deleteGameplan,
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

// SUB_LIMIT kept for backward-compat reference but subLimit is now per-game state
const SUB_LIMIT = 18 // fallback only

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

// Apply libero swap: if a libero is defined and covers a player in the back row,
// replace that player with the libero. Returns { lineup, swapped: playerIdOrNull }.
// liberoCovers = array of player IDs the libero is attached to.
// Falls back to "first MB in back row" when liberoCovers is empty (backward compat).
function applyLiberoSwap(lineup, liberoId, liberoCovers, roster) {
  if (!liberoId) return { lineup, swapped: null }
  // Don't swap if libero is already on court
  if (Object.values(lineup).includes(liberoId)) return { lineup, swapped: null }
  const next = { ...lineup }

  // New behavior: use explicit coverage list
  if (liberoCovers && liberoCovers.length > 0) {
    for (const slot of BACK_SLOTS) {
      const pid = lineup[slot]
      if (pid && liberoCovers.includes(pid)) {
        next[slot] = liberoId
        return { lineup: next, swapped: pid }
      }
    }
    return { lineup, swapped: null }
  }

  // Fallback: cover first MB in back row (old behavior for games without liberoCovers)
  const byId = Object.fromEntries((roster || []).map(p => [p.id, p]))
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
        onOpenGameplans={() => setNav({ screen: 'gameplans', teamId: team.id })}
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
        onCreateGameplan={(gid) => setNav({ screen: 'gameplan_edit', teamId: team.id, presetGameId: gid })}
        onLoadGameplan={(gp) => {
          updateGame(team.id, gp.gameId, { baseLineup: gp.baseLineup, startingRotation: gp.startingRotation })
          refresh()
          setNav({ screen: 'game', teamId: team.id, gameId: gp.gameId, loadedGameplanName: gp.name })
        }}
        onChanged={refresh}
      />
    )
  } else if (nav.screen === 'gameplans') {
    const team = getTeam(nav.teamId)
    if (!team) { setNav({ screen: 'teams' }); return null }
    const teamSchedule = statsPalSchedule.filter(s => s.team_id === team.id)
    screen = (
      <GameplansView
        {...headerProps}
        tick={tick}
        team={team}
        statsPalSchedule={teamSchedule}
        isStandalone={isStandalone}
        onBack={() => setNav({ screen: 'teamHome', teamId: team.id })}
        onCreateGameplan={() => setNav({ screen: 'gameplan_edit', teamId: team.id, presetGameId: null })}
        onEditGameplan={(gpId) => setNav({ screen: 'gameplan_edit', teamId: team.id, editGameplanId: gpId })}
        onLoadGameplan={(gp) => {
          updateGame(team.id, gp.gameId, { baseLineup: gp.baseLineup, startingRotation: gp.startingRotation })
          refresh()
          setNav({ screen: 'game', teamId: team.id, gameId: gp.gameId, loadedGameplanName: gp.name })
        }}
        onChanged={refresh}
      />
    )
  } else if (nav.screen === 'gameplan_edit') {
    const team = getTeam(nav.teamId)
    if (!team) { setNav({ screen: 'teams' }); return null }
    const existingGp = nav.editGameplanId
      ? (team.gameplans || []).find(g => g.id === nav.editGameplanId)
      : null
    const teamSchedule = statsPalSchedule.filter(s => s.team_id === team.id)
    screen = (
      <GameplanEditView
        {...headerProps}
        team={team}
        gameplan={existingGp}
        presetGameId={nav.presetGameId || null}
        statsPalSchedule={teamSchedule}
        isStandalone={isStandalone}
        onBack={() => setNav({ screen: 'gameplans', teamId: team.id })}
        onSaved={() => { refresh(); setNav({ screen: 'gameplans', teamId: team.id }) }}
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
        loadedGameplanName={nav.loadedGameplanName || null}
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
function TeamHomeView({ session, onLogout, onHome, team, onBack, onOpenRoster, onOpenSchedule, onOpenFormations, onOpenGameplans }) {
  const rosterCount = (team.roster || []).length
  const gameCount = (team.games || []).length
  const upcoming = (team.games || []).filter(g => !g.finishedSets || g.finishedSets.length === 0).length
  const customCount = (team.customFormations || []).length
  const gameplanCount = (team.gameplans || []).length
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
        <div className="home-tile" onClick={onOpenGameplans}>
          <div className="home-tile-icon"><IconPlay size={28} /></div>
          <div className="home-tile-title">Gameplans</div>
          <div className="home-tile-sub">{gameplanCount} {gameplanCount === 1 ? 'gameplan' : 'gameplans'}</div>
          <div className="home-tile-hint">Save named lineups for specific opponents. Load instantly before a game.</div>
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
function ScheduleView({ session, onLogout, onHome, team, onBack, onOpenGame, onChanged, tick, statsPalSchedule = [], isStandalone = false, onCreateGameplan, onLoadGameplan }) {
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

  // All gameplans for this team (used in linked mode)
  const allGameplans = useMemo(() => {
    const t = getTeam(team.id)
    return t?.gameplans || []
  }, [team.id, tick])

  // ---- Linked mode: drive schedule from StatPal ----
  if (!isStandalone) {
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
              const attachedPlans = localGame
                ? allGameplans.filter(gp => gp.gameId === localGame.id)
                : []
              return (
                <div key={entry.id} className="schedule-entry">
                  <div className="game-row" onClick={() => handleOpenScheduleEntry(entry)}>
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
                  {/* Gameplans attached to this game */}
                  <div className="schedule-gameplans" onClick={e => e.stopPropagation()}>
                    {attachedPlans.map(gp => (
                      <div key={gp.id} className="schedule-gp-chip">
                        <span className="schedule-gp-name">{gp.name}</span>
                        <button
                          className="primary schedule-gp-load"
                          onClick={() => onLoadGameplan && onLoadGameplan(gp)}
                        >Load</button>
                      </div>
                    ))}
                    {onCreateGameplan && localGame && (
                      <button
                        className="ghost schedule-gp-add"
                        onClick={() => onCreateGameplan(localGame.id)}
                      >+ Gameplan</button>
                    )}
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
// Sub Popup — confirmation overlay for manual and recommended subs
// ============================================================
function SubPopup({ pendingSub, playerById, subsUsed, subLimit, onConfirm, onSkip, onCancel }) {
  if (!pendingSub) return null
  const inPlayer = playerById[pendingSub.inId]
  const outPlayer = playerById[pendingSub.outId]
  const isReturn = pendingSub.inId === pendingSub.starterId
  const isRecommended = pendingSub.type === 'recommended'

  return (
    <div className="sub-popup-overlay">
      <div className="sub-popup">
        <div className="sub-popup-badge">{isReturn ? 'RE-ENTRY' : 'SUBSTITUTION'}</div>
        <div className="sub-popup-players">
          <div className="sub-popup-player in">
            <div className={`sub-popup-dot ${inPlayer?.role || ''}`}>{inPlayer?.number}</div>
            <div className="sub-popup-name">{fullName(inPlayer)}</div>
            <div className="sub-popup-tag in">IN</div>
          </div>
          <div className="sub-popup-arrow">⇄</div>
          <div className="sub-popup-player out">
            <div className={`sub-popup-dot ${outPlayer?.role || ''}`}>{outPlayer?.number}</div>
            <div className="sub-popup-name">{fullName(outPlayer)}</div>
            <div className="sub-popup-tag out">OUT</div>
          </div>
        </div>
        <div className="sub-popup-counter">
          Subs used: <strong>{subsUsed}</strong> / <strong>{subLimit}</strong>
        </div>
        <div className="sub-popup-actions">
          {isRecommended ? (
            <>
              <button className="sub-popup-skip" onClick={onSkip}>Skip</button>
              <button className="sub-popup-confirm" onClick={onConfirm} disabled={subsUsed >= subLimit}>
                Make Sub
              </button>
            </>
          ) : (
            <>
              <button className="sub-popup-skip" onClick={onCancel}>Cancel</button>
              <button className="sub-popup-confirm" onClick={onConfirm} disabled={subsUsed >= subLimit}>
                Confirm Sub
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Game (live rotation tool)
// ============================================================
function GameApp({ session, onLogout, onHome, team, game, onBack, onPublishSession, onClearSession, loadedGameplanName }) {
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
  const [activeSubs, setActiveSubs] = useState(game.activeSubs || {})
  const [subPairs, setSubPairs] = useState(game.subPairs || {})
  const [backRowSubs, setBackRowSubs] = useState(game.backRowSubs || {})
  const [frontRowSubs, setFrontRowSubs] = useState(game.frontRowSubs || {})
  const [liberoCovers, setLiberoCovers] = useState(game.liberoCovers || [])
  const [subLimit, setSubLimit] = useState(game.subLimit || 12)
  const [pendingSub, setPendingSub] = useState(null)
  const [pendingRecommended, setPendingRecommended] = useState([])
  const [dismissedSubKeys, setDismissedSubKeys] = useState(new Set())
  const [roleOverrides, setRoleOverrides] = useState(game.roleOverrides || {})
  const [dragPositions, setDragPositions] = useState(game.dragPositions || {})
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
  const [courtSelected, setCourtSelected] = useState(null)
  const [showEndSet, setShowEndSet] = useState(false)
  const [showLineupCard, setShowLineupCard] = useState(false)
  const [showRestartConfirm, setShowRestartConfirm] = useState(false)
  const [dismissedLiberoRotations, setDismissedLiberoRotations] = useState(new Set())

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
      currentRotation, ourScore, oppScore, serving, setNum, finishedSets, subs,
      activeSubs, subPairs, backRowSubs, frontRowSubs, liberoCovers, subLimit,
      roleOverrides, dragPositions, liberoId, mbSwitches, setConfigs,
      offenseFormationId, defenseFormationId, serveReceivePlayIds,
    })
  }, [team.id, game.id, opponent, gameDate, format, baseLineup, startingRotation, startServing,
      currentRotation, ourScore, oppScore, serving, setNum, finishedSets, subs,
      activeSubs, subPairs, backRowSubs, frontRowSubs, liberoCovers, subLimit,
      roleOverrides, dragPositions, liberoId, mbSwitches, setConfigs,
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
      activeSubs,
      liberoId,
      view,
    })
  }, [
    onPublishSession, team.id, game.id, opponent, gameDate, format,
    baseLineup, startingRotation, startServing,
    currentRotation, ourScore, oppScore, serving,
    setNum, finishedSets, activeSubs, liberoId, view,
  ])

  // Clear the published session when the live game view unmounts.
  useEffect(() => {
    return () => { if (onClearSession) onClearSession() }
  }, [onClearSession])

  const rotatedLineup = useMemo(
    () => computeLineup(baseLineup, startingRotation, currentRotation),
    [baseLineup, startingRotation, currentRotation]
  )

  // Apply activeSubs on top of rotated lineup (subs persist across rotations)
  const activeSubsAppliedLineup = useMemo(() => {
    const lineup = { ...rotatedLineup }
    for (const [slot, pid] of Object.entries(lineup)) {
      if (activeSubs[pid]) lineup[slot] = activeSubs[pid]
    }
    return lineup
  }, [rotatedLineup, activeSubs])

  // Apply libero auto-swap on top of the subs-applied lineup
  const { lineup: displayLineup, swapped: liberoSwappedOutId } = useMemo(() => {
    return applyLiberoSwap(activeSubsAppliedLineup, liberoId, liberoCovers, roster)
  }, [activeSubsAppliedLineup, liberoId, liberoCovers, roster])

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

  const subsUsedThisSet = countManualSubs(subs, setNum)

  // Helper: find the base starter for a player currently on court
  function findStarterForPlayer(playerId) {
    if (Object.values(rotatedLineup).includes(playerId)) return playerId
    for (const [sid, subId] of Object.entries(activeSubs)) {
      if (subId === playerId) return sid
    }
    return playerId
  }

  // Rotation-change effect: compute recommended back-row subs
  const prevRotForSubRef = useRef(null)
  const pendingSubRef = useRef(pendingSub)
  useEffect(() => { pendingSubRef.current = pendingSub }, [pendingSub])

  useEffect(() => {
    if (view !== 'live') return
    if (prevRotForSubRef.current === currentRotation) return
    prevRotForSubRef.current = currentRotation

    const recs = []

    // Back-row substitutions: front-row starters go out when they rotate to back
    for (const [starterId, subId] of Object.entries(backRowSubs)) {
      if (!subId) continue
      const pair = subPairs[starterId]
      if (pair?.state === 'done') continue

      const starterSlot = Object.entries(activeSubsAppliedLineup).find(([, pid]) => pid === starterId)?.[0]
      const subSlot = Object.entries(activeSubsAppliedLineup).find(([, pid]) => pid === subId)?.[0]

      if (starterSlot && BACK_SLOTS.includes(starterSlot) && !pair) {
        if (!subSlot) {
          recs.push({
            key: `${currentRotation}:${starterId}:in`,
            inId: subId, outId: starterId, slot: starterSlot, starterId, type: 'recommended',
          })
        }
      } else if (starterSlot && FRONT_SLOTS.includes(starterSlot) && pair?.state === 'active') {
        if (subSlot) {
          recs.push({
            key: `${currentRotation}:${starterId}:return`,
            inId: starterId, outId: subId, slot: subSlot, starterId, type: 'recommended',
          })
        }
      }
    }

    // Front-row substitutions: back-row starters go in when they rotate to front
    for (const [starterId, subId] of Object.entries(frontRowSubs)) {
      if (!subId) continue
      const pair = subPairs[starterId]
      if (pair?.state === 'done') continue

      const starterSlot = Object.entries(activeSubsAppliedLineup).find(([, pid]) => pid === starterId)?.[0]
      const subSlot = Object.entries(activeSubsAppliedLineup).find(([, pid]) => pid === subId)?.[0]

      if (starterSlot && FRONT_SLOTS.includes(starterSlot) && !pair) {
        if (!subSlot) {
          recs.push({
            key: `${currentRotation}:${starterId}:frin`,
            inId: subId, outId: starterId, slot: starterSlot, starterId, type: 'recommended',
          })
        }
      } else if (starterSlot && BACK_SLOTS.includes(starterSlot) && pair?.state === 'active') {
        if (subSlot) {
          recs.push({
            key: `${currentRotation}:${starterId}:frreturn`,
            inId: starterId, outId: subId, slot: subSlot, starterId, type: 'recommended',
          })
        }
      }
    }

    setPendingRecommended(recs)
    // Show first recommendation if nothing is already showing
    const undismissed = recs.find(r => !dismissedSubKeys.has(r.key))
    if (undismissed && !pendingSubRef.current) {
      setPendingSub(undismissed)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRotation, view])

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

  // Show banner when arriving from a gameplan load
  useEffect(() => {
    if (loadedGameplanName) {
      setToastMsg(`Gameplan loaded: ${loadedGameplanName}`)
      const t = setTimeout(() => setToastMsg(null), 3500)
      return () => clearTimeout(t)
    }
  }, [loadedGameplanName])

  // Show libero popup when libero swaps in for a new rotation
  const showLiberoPopup = liberoSwappedOutId && !dismissedLiberoRotations.has(currentRotation)

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
    setActiveSubs({})
    setSubPairs({})
    setDismissedSubKeys(new Set())
    setDismissedLiberoRotations(new Set())
    setPendingSub(null)
    setPendingRecommended([])
    prevRotForSubRef.current = null
    // Persist this set's config into the archive (saved per set in localStorage)
    setSetConfigs(prev => ({
      ...prev,
      [setNum]: { baseLineup, startingRotation, startServing, backRowSubs, frontRowSubs, liberoCovers, roleOverrides, mbSwitches, liberoId, dragPositions },
    }))
    setView('live')
  }

  function resetGame() {
    if (!confirm('Reset this game\'s state (scores, sets, subs)? Lineup is kept.')) return
    setCurrentRotation(startingRotation)
    setOurScore(0); setOppScore(0)
    setServing(startServing); setSetNum(1)
    setFinishedSets([]); setSubs([])
    setActiveSubs({}); setSubPairs({})
    setDismissedSubKeys(new Set())
    setPendingSub(null); setPendingRecommended([])
    prevRotForSubRef.current = null
    setView('setup')
  }

  function addOurPoint() {
    const newOur = ourScore + 1
    const wasReceiving = !serving
    setOurScore(newOur)
    if (wasReceiving) {
      setCurrentRotation(r => (r % 6) + 1)
      setServing(true)
      setDismissedSubKeys(new Set()) // allow fresh recommendations on new rotation
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
      [setNum]: { baseLineup, startingRotation, startServing, backRowSubs, frontRowSubs, liberoCovers, roleOverrides, mbSwitches, liberoId, dragPositions },
    }))
    setView('setOver')
  }

  function restartGame() {
    setOurScore(0)
    setOppScore(0)
    setSetNum(1)
    setFinishedSets([])
    setSubs([])
    setActiveSubs({}); setSubPairs({})
    setDismissedSubKeys(new Set())
    setPendingSub(null); setPendingRecommended([])
    prevRotForSubRef.current = null
    setCurrentRotation(startingRotation)
    setServing(startServing)
    setSetConfigs({})
    setShowRestartConfirm(false)
    setView('setup')
  }

  function startNextSet() {
    setSetNum(n => n + 1)
    setOurScore(0)
    setOppScore(0)
    setCurrentRotation(startingRotation)
    setServing(startServing)
    setActiveSubs({}); setSubPairs({})
    setDismissedSubKeys(new Set())
    setPendingSub(null); setPendingRecommended([])
    prevRotForSubRef.current = null
    setView('setup')
  }

  function applySubstitution({ inId, outId, slot, starterId }) {
    const inPlayer = playerById[inId]
    const outPlayer = playerById[outId]

    if (inId === starterId) {
      // Starter returning — remove their entry
      setActiveSubs(prev => { const next = { ...prev }; delete next[starterId]; return next })
      setSubPairs(prev => ({ ...prev, [starterId]: { ...prev[starterId], state: 'done' } }))
    } else {
      // Sub coming in for starter
      setActiveSubs(prev => ({ ...prev, [starterId]: inId }))
      setSubPairs(prev => ({ ...prev, [starterId]: { subId: inId, state: 'active' } }))
    }

    setSubs(prev => [...prev, {
      id: uid(),
      inPlayerId: inId,
      outPlayerId: outId,
      slot,
      starterId,
      setNum,
      rotation: currentRotation,
      scoreStr: `${ourScore}-${oppScore}`,
      libero: false,
      label: `${fullName(inPlayer)} in for ${fullName(outPlayer)}`,
    }])

    setPendingSub(null)
    setBenchSelected(null)
    setCourtSelected(null)
  }

  function handleCourtClick(slot) {
    const courtId = displayLineup[slot]
    if (benchSelected) {
      const outId = courtId
      const inId = benchSelected
      const starterId = findStarterForPlayer(outId)
      const pair = subPairs[starterId]

      if (subsUsedThisSet >= subLimit) {
        showToast(`Sub limit reached (${subLimit} per set)`)
        setBenchSelected(null)
        return
      }
      if (pair?.state === 'done') {
        showToast('This substitution pair has been used — no more exchanges allowed')
        setBenchSelected(null)
        return
      }

      // Show confirmation popup
      setPendingSub({ inId, outId, slot, starterId, type: 'manual' })
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
        liberoCovers={liberoCovers} setLiberoCovers={setLiberoCovers}
        subLimit={subLimit} setSubLimit={setSubLimit}
        backRowSubs={backRowSubs} setBackRowSubs={setBackRowSubs}
        frontRowSubs={frontRowSubs} setFrontRowSubs={setFrontRowSubs}
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
          <button
            onClick={() => {
              setCurrentRotation(r => (r % 6) + 1)
              setDismissedSubKeys(new Set())
              setDismissedLiberoRotations(new Set())
            }}
          >
            Rotate →
          </button>
          <button className="ghost" onClick={() => setShowFormations(true)}>Serve Receive</button>
          <button className="ghost" onClick={() => setView('setup')}>Setup</button>
          <button className="ghost" onClick={() => setShowLineupCard(true)}>Lineup Card</button>
          <button className="danger" onClick={() => setShowEndSet(true)}>End Set</button>
          <button className="ghost" onClick={() => setShowRestartConfirm(true)}>Restart</button>
          <button className="ghost" onClick={onLogout}>Logout</button>
        </div>
      </div>

      <div className="main">
        {/* LEFT PANEL — bench + sub pairs (desktop/tablet) */}
        <div className="live-left-panel">
          <div className="panel">
            <h3>Bench</h3>
            <div className={`sub-counter ${subsUsedThisSet >= subLimit ? 'full' : subsUsedThisSet >= subLimit - 2 ? 'warn' : ''}`}>
              Subs: <strong>{subsUsedThisSet}/{subLimit}</strong>
              {subsUsedThisSet >= subLimit && <span className="tag">LIMIT</span>}
            </div>
            {benchPlayers.length === 0
              ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>All on court</div>
              : <div className="bench-list">
                  {benchPlayers.map(p => (
                    <div key={p.id}
                      className={`bench-item ${benchSelected === p.id ? 'selected' : ''}`}
                      onClick={() => setBenchSelected(benchSelected === p.id ? null : p.id)}
                    >
                      <div className={`dot ${p.role}`}>{p.number}</div>
                      <div className="name">{fullName(p) || '—'}</div>
                      <div className="role">{p.role}</div>
                    </div>
                  ))}
                </div>
            }
            {benchSelected && <div className="hint">Tap court player to initiate sub.</div>}
          </div>

          {Object.keys(subPairs).length > 0 && (
            <div className="panel">
              <h3>Sub Pairs</h3>
              <div className="sub-pairs-section">
                {Object.entries(subPairs).map(([starterId, pair]) => {
                  const starter = playerById[starterId]
                  const sub = playerById[pair.subId]
                  return (
                    <div key={starterId} className={`sub-pair-row ${pair.state}`}>
                      <div className={`dot ${starter?.role || ''}`} style={{ width: 24, height: 24, fontSize: 10 }}>{starter?.number}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700 }}>{fullName(starter)} ↔ {fullName(sub)}</div>
                      </div>
                      <div className={`sub-pair-status ${pair.state}`}>{pair.state === 'done' ? 'DONE' : 'ACTIVE'}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* CENTER — court */}
        <div className="court-wrap">
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
                const cur = prev[currentRotation] || {}
                return { ...prev, [currentRotation]: { ...cur, [slot]: xy } }
              })
            }}
            onInvalidDrop={(msg) => showToast(msg)}
            mbSwitches={mbSwitches}
            pendingSubOutId={pendingSub?.outId || null}
          />

          {/* Rotation pills */}
          <div className="rotation-pills">
            {[1,2,3,4,5,6].map(r => (
              <div key={r} className={`rot-pill ${r === currentRotation ? 'active' : ''}`}>R{r}</div>
            ))}
          </div>

          {/* Compact bench (mobile only, shown via CSS) */}
          <div className="bench-compact">
            <div className="bench-compact-header">
              <div className="bench-compact-title">Bench</div>
              <div className={`sub-counter ${subsUsedThisSet >= subLimit ? 'full' : ''}`} style={{ fontSize: 12 }}>
                Subs: <strong>{subsUsedThisSet}/{subLimit}</strong>
              </div>
            </div>
            {benchPlayers.length === 0
              ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>All players on court</div>
              : (
                <>
                  <div className="bench-row">
                    {benchPlayers.map(p => (
                      <div
                        key={p.id}
                        className={`bench-chip ${p.role} ${benchSelected === p.id ? 'selected' : ''}`}
                        onClick={() => setBenchSelected(benchSelected === p.id ? null : p.id)}
                      >
                        <div className="chip-num">{p.number}</div>
                        <div className="chip-name">{shortName(p)}</div>
                      </div>
                    ))}
                  </div>
                  {benchSelected && <div className="bench-chip-hint">Tap a player on the court to sub them out.</div>}
                </>
              )
            }
          </div>
        </div>

        {/* RIGHT PANEL — sub log + rotation info (desktop/tablet) */}
        <div className="live-right-panel">
          <div className="panel">
            <h3>Sub Log</h3>
            {subs.filter(s => s.setNum === setNum).length === 0
              ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>No subs this set</div>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(() => {
                    const setSubsList = subs.filter(s => s.setNum === setNum)
                    let regularCount = 0
                    return setSubsList.map((s) => {
                      const isReturn = s.inPlayerId === s.starterId
                      const isLiberoSub = s.libero === true
                      if (!isLiberoSub) regularCount++
                      const countLabel = isLiberoSub ? null : `Sub ${regularCount}/${subLimit}`
                      return (
                        <div key={s.id} className={`sub-log-entry ${isReturn ? 're-entry' : ''} ${isLiberoSub ? 'libero-sub' : ''}`}>
                          <div>
                            <div>
                              {isLiberoSub && <span className="libero-swap-icon">⟲ </span>}
                              <strong>#{playerById[s.inPlayerId]?.number} {fullName(playerById[s.inPlayerId])}</strong>
                              {' '}in for{' '}
                              <strong>#{playerById[s.outPlayerId]?.number} {fullName(playerById[s.outPlayerId])}</strong>
                            </div>
                            <div className="sub-log-meta">
                              R{s.rotation} · {s.scoreStr} · {isLiberoSub ? 'Libero' : countLabel}
                            </div>
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>
            }
          </div>
          <div className="panel">
            <h3>Rotation {currentRotation}</h3>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
              {serving ? 'Serving' : 'Receiving'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {serving ? 'Scored → stay on serve' : 'Scored → side out + rotate'}
            </div>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button className="ghost" style={{ width: '100%' }} onClick={() => setShowFormations(true)}>Serve Receive</button>
              <button className="ghost" style={{ width: '100%' }} onClick={() => {
                setDragPositions(prev => { const n = { ...prev }; delete n[currentRotation]; return n })
                showToast('Positions reset')
              }}>Reset Positions</button>
              <button className="ghost" style={{ width: '100%' }} onClick={() => setShowLineupCard(true)}>Lineup Card</button>
            </div>
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

      {pendingSub && (
        <SubPopup
          pendingSub={pendingSub}
          playerById={playerById}
          subsUsed={subsUsedThisSet}
          subLimit={subLimit}
          onConfirm={() => applySubstitution(pendingSub)}
          onSkip={() => {
            if (pendingSub.key) setDismissedSubKeys(prev => new Set([...prev, pendingSub.key]))
            setPendingSub(null)
            // Show next undismissed recommendation
            const nextRec = pendingRecommended.find(r => r.key !== pendingSub.key && !dismissedSubKeys.has(r.key))
            if (nextRec) setTimeout(() => setPendingSub(nextRec), 100)
          }}
          onCancel={() => { setPendingSub(null); setBenchSelected(null) }}
        />
      )}

      {showLiberoPopup && (() => {
        const swappedOut = playerById[liberoSwappedOutId]
        const liberoPlayer = liberoId ? playerById[liberoId] : null
        return (
          <div className="libero-popup-overlay">
            <div className="libero-popup">
              <div className="libero-popup-badge">Libero Swap</div>
              <h2>Libero In!</h2>
              <div className="libero-popup-sub">
                {liberoPlayer && <><strong>#{liberoPlayer.number} {fullName(liberoPlayer)}</strong> is coming in </>}
                {swappedOut && <>for <strong>#{swappedOut.number} {fullName(swappedOut)}</strong></>}
                {' '}in Rotation {currentRotation}.
              </div>
              <div className="libero-popup-actions">
                <button
                  className="libero-undo-btn"
                  onClick={() => {
                    setCurrentRotation(r => r === 1 ? 6 : r - 1)
                    setDismissedLiberoRotations(new Set())
                  }}
                >
                  ← Undo Rotation
                </button>
                <button
                  className="libero-confirm-btn"
                  onClick={() => setDismissedLiberoRotations(prev => new Set([...prev, currentRotation]))}
                >
                  Got it
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
    liberoId, setLiberoId, liberoCovers, setLiberoCovers,
    subLimit, setSubLimit, backRowSubs, setBackRowSubs, frontRowSubs, setFrontRowSubs,
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
    { num: 3, label: 'Sub Plan' },
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

  function next() { if (step < 3) setStep(step + 1) }
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
        <div className="step-progress">Step {step} of 3</div>
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

            <div className="big-field">
              <label>Sub Limit (per set)</label>
              <div className="seg-toggle">
                <button type="button" className={subLimit === 6 ? 'active' : ''} onClick={() => setSubLimit(6)}>6 (NCAA)</button>
                <button type="button" className={subLimit === 12 ? 'active' : ''} onClick={() => setSubLimit(12)}>12 (NFHS)</button>
                <button type="button" className={subLimit === 18 ? 'active' : ''} onClick={() => setSubLimit(18)}>18 (club)</button>
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
            <h2>Substitution Plan</h2>
            <p>Assign subs for each player. You'll get automatic prompts during the game when rotation triggers them.</p>
          </div>
          {!lineupComplete ? (
            <div className="empty-state">Complete the lineup in Step 2 first.</div>
          ) : (
            <div className="sub-card-grid">
              {SLOTS.map(slot => {
                const pid = baseLineup[slot]
                if (!pid) return null
                const p = playerById[pid]
                if (!p) return null
                const isFrontRow = FRONT_SLOTS.includes(slot)
                const isBackRow = BACK_SLOTS.includes(slot)
                const currentBackSub = backRowSubs[pid] || ''
                const currentFrontSub = frontRowSubs[pid] || ''
                const isLibero = pid === liberoId
                const coversLibero = liberoCovers.includes(pid)
                // Candidates for subs: bench players not in starting lineup
                const benchCandidates = rawRoster.filter(q =>
                  q.id !== pid && !assignedIds.has(q.id) && q.id !== liberoId
                )
                return (
                  <div key={slot} className={`sub-card ${isLibero ? 'sub-card-libero' : ''}`}>
                    <div className="sub-card-head">
                      <div className={`sub-card-dot ${p.role}`}>{p.number}</div>
                      <div className="sub-card-info">
                        <div className="sub-card-name">{fullName(p)}</div>
                        <div className="sub-card-meta">
                          {p.role} · {slot} · {isFrontRow ? 'Front Row' : 'Back Row'}
                          {isLibero ? ' · Libero' : ''}
                        </div>
                      </div>
                    </div>
                    <div className="sub-card-slots">
                      {/* Libero covers toggle (only visible if a libero is set and this isn't the libero) */}
                      {liberoId && !isLibero && (
                        <div className="sub-card-slot">
                          <label>
                            <input
                              type="checkbox"
                              checked={coversLibero}
                              onChange={e => {
                                if (e.target.checked) {
                                  setLiberoCovers(prev => prev.includes(pid) ? prev : [...prev, pid])
                                } else {
                                  setLiberoCovers(prev => prev.filter(id => id !== pid))
                                }
                              }}
                            />
                            {' '}Libero covers this player in back row
                          </label>
                        </div>
                      )}
                      {/* Back row replacement: for front-row starters */}
                      {isFrontRow && !isLibero && (
                        <div className="sub-card-slot">
                          <label>Back Row Replacement</label>
                          <select
                            value={currentBackSub}
                            onChange={e => {
                              const val = e.target.value
                              setBackRowSubs(prev => {
                                const next = { ...prev }
                                if (val) next[pid] = val; else delete next[pid]
                                return next
                              })
                            }}
                          >
                            <option value="">— None —</option>
                            {benchCandidates.map(q => (
                              <option key={q.id} value={q.id}>#{q.number} {fullName(q)} ({q.role})</option>
                            ))}
                          </select>
                        </div>
                      )}
                      {/* Front row replacement: for back-row starters */}
                      {isBackRow && !isLibero && (
                        <div className="sub-card-slot">
                          <label>Front Row Replacement</label>
                          <select
                            value={currentFrontSub}
                            onChange={e => {
                              const val = e.target.value
                              setFrontRowSubs(prev => {
                                const next = { ...prev }
                                if (val) next[pid] = val; else delete next[pid]
                                return next
                              })
                            }}
                          >
                            <option value="">— None —</option>
                            {benchCandidates.map(q => (
                              <option key={q.id} value={q.id}>#{q.number} {fullName(q)} ({q.role})</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <div className="step-hint">
            All optional. Subs are prompted automatically when rotation triggers them. You can always sub manually during the game.
          </div>
        </div>
      )}

      <div className="wizard-footer">
        <button className="ghost" onClick={step === 1 ? onBack : back}>
          {step === 1 ? '← Cancel' : '← Back'}
        </button>
        <div className="wizard-progress-bar">
          <div className="wizard-progress-fill" style={{ width: `${(step / 3) * 100}%` }} />
        </div>
        {step < 3 ? (
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
  mbSwitches, pendingSubOutId,
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
        const isPendingSub = pid && pid === pendingSubOutId
        return (
          <div key={slot}>
            <div className="slot-label" style={{ left: `${basePos.x}%`, top: `${basePos.y - 10}%` }}>{slot}</div>
            {p && (
              <div
                className={`player ${p.role} ${isServer ? 'serving' : ''} ${selectedSlot === slot ? 'selected' : ''} ${illegal ? 'illegal' : ''} ${isDragging ? `is-dragging ${dragging.valid ? 'drag-ok' : 'drag-bad'}` : ''} ${isPendingSub ? 'pending-sub' : ''}`}
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
// Gameplan — mini court preview (R1 positions)
// ============================================================
function GameplanPreview({ lineup, roster }) {
  if (!lineup) return <div className="gp-preview-empty">No lineup</div>
  const byId = {}
  for (const p of (roster || [])) byId[p.id] = p
  const positions = {
    P4: { x: 14, y: 26 }, P3: { x: 50, y: 26 }, P2: { x: 86, y: 26 },
    P5: { x: 14, y: 74 }, P6: { x: 50, y: 74 }, P1: { x: 86, y: 74 },
  }
  const filled = SLOTS.some(s => lineup[s])
  if (!filled) return <div className="gp-preview-empty">No lineup set</div>
  return (
    <div className="gp-preview-court">
      <div className="gp-preview-net" />
      {SLOTS.map(slot => {
        const p = byId[lineup[slot]]
        const pos = positions[slot]
        return (
          <div
            key={slot}
            className={`gp-preview-dot ${p?.role || 'empty'}`}
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
          >
            {p ? (p.number || '?') : '·'}
          </div>
        )
      })}
    </div>
  )
}

// ============================================================
// Gameplans — list view
// ============================================================
function GameplansView({ session, onLogout, onHome, team, onBack, onCreateGameplan, onEditGameplan, onLoadGameplan, onChanged, tick, statsPalSchedule = [], isStandalone }) {
  const gameplans = useMemo(() => {
    const t = getTeam(team.id)
    return (t?.gameplans || []).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  }, [team.id, tick])

  const localGames = useMemo(() => {
    const t = getTeam(team.id)
    return t?.games || []
  }, [team.id, tick])

  function getAttachmentLabel(gp) {
    if (!gp.gameId) return null
    const localGame = localGames.find(g => g.id === gp.gameId)
    if (!localGame) return null
    if (localGame.scheduleId) {
      const entry = statsPalSchedule.find(s => s.id === localGame.scheduleId)
      if (entry) return `vs ${entry.opponent} · ${entry.game_date?.slice(0, 10) || ''}`
    }
    return `vs ${localGame.opponent} · ${localGame.date || ''}`
  }

  function canLoad(gp) { return !!gp.gameId && localGames.some(g => g.id === gp.gameId) }

  function handleDelete(gp) {
    if (!confirm(`Delete gameplan "${gp.name}"?`)) return
    deleteGameplan(team.id, gp.id)
    onChanged()
  }

  return (
    <div className="dashboard">
      <HeaderBar
        session={session}
        onLogout={onLogout}
        onHome={onHome}
        title={team.name}
        subtitle="Gameplans"
        leftActions={<button className="ghost" onClick={onBack}>← {team.name}</button>}
      />
      <div className="teams-section-header">
        <h2>Gameplans</h2>
        <button className="primary" onClick={onCreateGameplan}>+ Create Gameplan</button>
      </div>

      {gameplans.length === 0 ? (
        <div className="empty-state">
          <h3>No gameplans yet</h3>
          <p>Save a named lineup for a specific opponent. Load it instantly before a game starts.</p>
          <button className="primary" onClick={onCreateGameplan}>+ Create Gameplan</button>
        </div>
      ) : (
        <div className="gp-list">
          {gameplans.map(gp => {
            const label = getAttachmentLabel(gp)
            const loadable = canLoad(gp)
            return (
              <div key={gp.id} className="gp-card">
                <div className="gp-card-preview">
                  <GameplanPreview lineup={gp.baseLineup} roster={team.roster || []} />
                </div>
                <div className="gp-card-body">
                  <div className="gp-card-name">{gp.name}</div>
                  {label && <div className="gp-card-game">📅 {label}</div>}
                  {gp.notes && <div className="gp-card-notes">{gp.notes}</div>}
                  <div className="gp-card-meta">R{gp.startingRotation || 1} start · Created {new Date(gp.createdAt).toLocaleDateString()}</div>
                </div>
                <div className="gp-card-actions">
                  {loadable && (
                    <button className="primary gp-load-btn" onClick={() => onLoadGameplan(gp)}>
                      ▶ Load
                    </button>
                  )}
                  {!loadable && (
                    <div className="gp-no-game-hint">Attach a game to load</div>
                  )}
                  <button className="ghost" onClick={() => onEditGameplan(gp.id)}>Edit</button>
                  <button className="danger" onClick={() => handleDelete(gp)}>Delete</button>
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
// Gameplan editor — create / edit
// ============================================================
function GameplanEditView({ session, onLogout, onHome, team, gameplan, presetGameId, onBack, onSaved, statsPalSchedule = [], isStandalone }) {
  const isEdit = !!gameplan
  const emptyBl = () => ({ P1: null, P2: null, P3: null, P4: null, P5: null, P6: null })

  const [name, setName] = useState(gameplan?.name || '')
  const [gameId, setGameId] = useState(gameplan?.gameId || presetGameId || '')
  const [baseLineup, setBaseLineup] = useState(gameplan?.baseLineup || emptyBl())
  const [startingRotation, setStartingRotation] = useState(gameplan?.startingRotation || 1)
  const [notes, setNotes] = useState(gameplan?.notes || '')
  const [activeTab, setActiveTab] = useState(1)
  const [dragId, setDragId] = useState(null)

  const roster = team.roster || []
  const localGames = useMemo(() => {
    const t = getTeam(team.id)
    return t?.games || []
  }, [])

  // Rotation lineups computed from base
  const rotationLineups = useMemo(() => {
    const out = {}
    for (let r = 1; r <= 6; r++) {
      out[r] = computeLineup(baseLineup, 1, r)
    }
    return out
  }, [baseLineup])

  const displayLineup = rotationLineups[activeTab] || emptyBl()

  const playerById = useMemo(() => {
    const m = {}
    for (const p of roster) m[p.id] = p
    return m
  }, [roster])

  const assignedIds = new Set(Object.values(baseLineup).filter(Boolean))

  const EDIT_COORDS = {
    P4: { x: 14, y: 26 }, P3: { x: 50, y: 26 }, P2: { x: 86, y: 26 },
    P5: { x: 14, y: 74 }, P6: { x: 50, y: 74 }, P1: { x: 86, y: 74 },
  }

  function assignSlot(slot, playerId) {
    if (activeTab !== 1) return // only R1 is editable
    setBaseLineup(bl => {
      const nbl = { ...bl }
      for (const s of SLOTS) if (nbl[s] === playerId && playerId) nbl[s] = null
      nbl[slot] = playerId || null
      return nbl
    })
  }

  function clearSlot(slot) {
    if (activeTab !== 1) return
    setBaseLineup(bl => ({ ...bl, [slot]: null }))
  }

  // Game options for the selector
  const gameOptions = useMemo(() => {
    return localGames.map(g => {
      if (!isStandalone && g.scheduleId) {
        const entry = statsPalSchedule.find(s => s.id === g.scheduleId)
        if (entry) return { value: g.id, label: `vs ${entry.opponent} · ${entry.game_date?.slice(0, 10) || ''}` }
      }
      return { value: g.id, label: `vs ${g.opponent} · ${g.date || ''}` }
    })
  }, [localGames, statsPalSchedule, isStandalone])

  function handleSave() {
    if (!name.trim()) { alert('Give this gameplan a name.'); return }
    const gp = {
      id: gameplan?.id || (Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4)),
      name: name.trim(),
      gameId: gameId || null,
      baseLineup,
      startingRotation,
      notes: notes.trim(),
    }
    saveGameplan(team.id, gp)
    onSaved()
  }

  return (
    <div className="dashboard">
      <HeaderBar
        session={session}
        onLogout={onLogout}
        onHome={onHome}
        title={team.name}
        subtitle={isEdit ? 'Edit Gameplan' : 'New Gameplan'}
        leftActions={<button className="ghost" onClick={onBack}>← Gameplans</button>}
      />

      <div className="gp-editor">
        {/* Name */}
        <div className="big-form">
          <div className="big-field">
            <label>Gameplan Name</label>
            <input
              className="big-input"
              autoFocus
              placeholder='e.g. "vs Lodi Serve Receive"'
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div className="big-form-row">
            <div className="big-field">
              <label>Attach to Game (optional)</label>
              <select
                className="big-input"
                value={gameId}
                onChange={e => setGameId(e.target.value)}
              >
                <option value="">— No game attached —</option>
                {gameOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="big-field">
              <label>Starting Rotation</label>
              <div className="seg-toggle rot">
                {[1,2,3,4,5,6].map(n => (
                  <button key={n} type="button" className={startingRotation === n ? 'active' : ''} onClick={() => setStartingRotation(n)}>{n}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Rotation editor */}
        <div className="panel">
          <h3>Rotation Setup</h3>
          <p className="panel-hint">Set your R1 lineup — R2 through R6 auto-populate from the rotation order.</p>

          <div className="rot-tabs">
            {[1,2,3,4,5,6].map(r => (
              <button
                key={r}
                type="button"
                className={`rot-tab ${activeTab === r ? 'active' : ''}`}
                onClick={() => setActiveTab(r)}
              >
                R{r}{r === 1 ? ' ✎' : ''}
              </button>
            ))}
          </div>

          {activeTab === 1 ? (
            /* Editable R1 lineup — same drag/click pattern as SetupView */
            roster.length === 0 ? (
              <div className="empty-state" style={{ marginTop: 12 }}>
                No players on roster. Add players in Roster first.
              </div>
            ) : (
              <div className="lineup-layout">
                <div className="big-court-wrap">
                  <div className="court-row-label">⬆ FRONT ROW (at the net)</div>
                  <div className="big-court" onDragOver={e => e.preventDefault()}>
                    <div className="big-court-net" />
                    {SLOTS.map(slot => {
                      const pid = baseLineup[slot]
                      const p = pid ? playerById[pid] : null
                      return (
                        <div
                          key={slot}
                          className={`big-zone ${p ? 'filled' : ''} ${dragId ? 'targetable' : ''}`}
                          style={{ left: `${EDIT_COORDS[slot].x}%`, top: `${EDIT_COORDS[slot].y}%` }}
                          onDragOver={e => e.preventDefault()}
                          onDrop={e => {
                            e.preventDefault()
                            const id = e.dataTransfer.getData('text/plain') || dragId
                            if (id) assignSlot(slot, id)
                            setDragId(null)
                          }}
                          onClick={() => {
                            if (dragId) { assignSlot(slot, dragId); setDragId(null) }
                            else if (p) clearSlot(slot)
                          }}
                        >
                          <div className="zone-label">{slot}{slot === 'P1' ? ' · server' : ''}</div>
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
                          onClick={() => { if (!onCourt) setDragId(dragId === p.id ? null : p.id) }}
                        >
                          <div className="chip-num">{p.number}</div>
                          <div className="chip-name">{fullName(p) || '—'}</div>
                          <div className="chip-role">{p.role}</div>
                          {onCourt && <div className="chip-check">✓</div>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          ) : (
            /* Read-only computed rotation preview */
            <div className="gp-rot-preview">
              <div className="gp-rot-preview-label">Rotation {activeTab} — computed from R1</div>
              <div className="big-court-wrap" style={{ maxWidth: 420 }}>
                <div className="court-row-label">⬆ FRONT ROW</div>
                <div className="big-court" style={{ pointerEvents: 'none', opacity: 0.8 }}>
                  <div className="big-court-net" />
                  {SLOTS.map(slot => {
                    const pid = displayLineup[slot]
                    const p = pid ? playerById[pid] : null
                    return (
                      <div
                        key={slot}
                        className={`big-zone ${p ? 'filled' : ''}`}
                        style={{ left: `${EDIT_COORDS[slot].x}%`, top: `${EDIT_COORDS[slot].y}%` }}
                      >
                        <div className="zone-label">{slot}</div>
                        {p ? (
                          <div className={`zone-player ${p.role}`}>
                            <div className="zone-num">#{p.number}</div>
                            <div className="zone-name">{shortName(p)}</div>
                            <div className="zone-role">{p.role}</div>
                          </div>
                        ) : (
                          <div className="zone-empty">—</div>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div className="court-row-label">⬇ BACK ROW</div>
              </div>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="big-form">
          <div className="big-field">
            <label>Notes (optional)</label>
            <textarea
              className="big-input"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder='"Start in Rotation 3", "Liam serves first", "Use S1 formation"...'
              rows={3}
              style={{ resize: 'vertical' }}
            />
          </div>
        </div>

        <div className="row" style={{ padding: '0 0 32px' }}>
          <button className="ghost" onClick={onBack}>Cancel</button>
          <button className="primary" onClick={handleSave}>
            {isEdit ? 'Save Changes' : 'Save Gameplan'}
          </button>
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

