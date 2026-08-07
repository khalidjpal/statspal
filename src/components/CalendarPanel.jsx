import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '../supabase'
import {
  toIso, fromIso, fmtTime12,
  expandRule, countOccurrences,
  todayIsoLocal,
} from '../utils/recurrence'

// ─── Recurrence expansion ──────────────────────────────────────────────────
//
// Given a row's recurrence_rule + exceptions, produce { isoDate: row } for
// every occurrence that lands in [windowStart, windowEnd] (inclusive). Pure
// function — callers pass the visible month window.
// Expand an array of Supabase event rows into a Map<isoDate, row[]> for
// the visible window. Honors per-event `exceptions` (skipped occurrences).
function expandEvents(events, windowStartIso, windowEndIso) {
  const out = new Map()
  const push = (iso, row) => {
    if (!out.has(iso)) out.set(iso, [])
    out.get(iso).push(row)
  }
  for (const ev of events || []) {
    const skips = new Set(Array.isArray(ev.exceptions) ? ev.exceptions : [])
    const dates = expandRule(ev.recurrence_rule, windowStartIso, windowEndIso)
    for (const iso of dates) {
      if (skips.has(iso)) continue
      push(iso, ev)
    }
  }
  return out
}

// ─── Persistence ────────────────────────────────────────────────────────────
async function fetchEvents(teamId) {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('team_id', teamId)
    .order('updated_at', { ascending: false })
  return { data: data || [], error }
}
async function upsertEvent(row) {
  const { data, error } = await supabase
    .from('calendar_events')
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    .select()
    .single()
  return { data, error }
}
async function deleteEvent(id) {
  const { error } = await supabase.from('calendar_events').delete().eq('id', id)
  return { error }
}
function isSchemaError(err) {
  if (!err) return false
  const code = err.code || ''
  if (code === 'PGRST205' || code === '42P01' || code === '42703') return true
  return /relation .* does not exist|column .* does not exist|schema cache/i.test(err.message || '')
}

// ─── CalendarPanel — month grid with expanded events ───────────────────────
export default function CalendarPanel({ teamId }) {
  const today = useMemo(() => new Date(), [])
  const [view, setView] = useState({ y: today.getFullYear(), m: today.getMonth() })
  const [events, setEvents] = useState([])
  const [loadErr, setLoadErr] = useState(null)
  const [tick, setTick] = useState(0)
  const [editing, setEditing] = useState(null) // { mode: 'create'|'edit', date?, event? }

  // Load events on team change.
  useEffect(() => {
    if (!teamId) return
    let cancelled = false
    fetchEvents(teamId).then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        setLoadErr({ schema: isSchemaError(error), message: error.message || String(error) })
        setEvents([])
        return
      }
      setLoadErr(null)
      setEvents(data)
    })
    return () => { cancelled = true }
  }, [teamId, tick])
  const refresh = useCallback(() => setTick(t => t + 1), [])

  // Compute the month window.
  const monthInfo = useMemo(() => {
    const first = new Date(view.y, view.m, 1)
    const firstDow = first.getDay()
    const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < firstDow; i++) cells.push({ kind: 'blank', key: `b-${i}` })
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(view.y, view.m, d)
      cells.push({ kind: 'day', key: toIso(date), day: d, dateStr: toIso(date) })
    }
    while (cells.length % 7 !== 0) cells.push({ kind: 'blank', key: `t-${cells.length}` })
    const label = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    const winStart = toIso(new Date(view.y, view.m, 1))
    const winEnd = toIso(new Date(view.y, view.m + 1, 0))
    return { cells, label, winStart, winEnd }
  }, [view])

  // Expand events into per-date occurrences for the visible window.
  const occurrencesByDate = useMemo(
    () => expandEvents(events, monthInfo.winStart, monthInfo.winEnd),
    [events, monthInfo.winStart, monthInfo.winEnd],
  )

  function shiftMonth(delta) {
    setView(v => {
      const d = new Date(v.y, v.m + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  }
  function jumpToday() {
    setView({ y: today.getFullYear(), m: today.getMonth() })
  }

  async function handleSave(row) {
    const payload = { ...row, team_id: teamId }
    const { error } = await upsertEvent(payload)
    if (error) {
      alert(`Save failed: ${error.message || 'Supabase error'}`)
      return
    }
    setEditing(null)
    refresh()
  }
  async function handleDelete(id) {
    if (!confirm('Delete this event series? All occurrences will be removed.')) return
    const { error } = await deleteEvent(id)
    if (error) {
      alert(`Delete failed: ${error.message || 'Supabase error'}`)
      return
    }
    setEditing(null)
    refresh()
  }

  const todayIso = toIso(today)
  const SQL_URL = 'https://supabase.com/dashboard/project/eelsooiqhzwyzdoccefe/sql/new'

  return (
    <section className="cal-panel">
      <header className="cal-panel-head">
        <div className="cal-panel-title">
          <span className="cal-panel-eyebrow">CALENDAR</span>
          <h3 className="cal-panel-month">{monthInfo.label}</h3>
        </div>
        <div className="cal-panel-nav">
          <button type="button" className="cal-nav-btn" onClick={() => shiftMonth(-1)} title="Previous month">‹</button>
          <button type="button" className="cal-nav-btn cal-nav-today" onClick={jumpToday}>Today</button>
          <button type="button" className="cal-nav-btn" onClick={() => shiftMonth(1)} title="Next month">›</button>
          <button
            type="button"
            className="cal-new-btn"
            onClick={() => setEditing({ mode: 'create', date: todayIso })}
            disabled={!!loadErr?.schema}
          >+ New Event</button>
        </div>
      </header>

      {loadErr?.schema ? (
        <div className="cal-panel-err">
          The <code>calendar_events</code> table doesn't exist yet. Run{' '}
          <code>scripts/calendar_events_migration.sql</code> in the{' '}
          <a href={SQL_URL} target="_blank" rel="noopener noreferrer">Supabase SQL editor</a>.
        </div>
      ) : loadErr ? (
        <div className="cal-panel-err">{loadErr.message}</div>
      ) : (
        <>
          <div className="cal-dow">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
              <span key={d} className="cal-dow-cell">{d}</span>
            ))}
          </div>
          <div className="cal-grid">
            {monthInfo.cells.map(c => {
              if (c.kind === 'blank') return <div key={c.key} className="cal-cell blank" />
              const isToday = c.dateStr === todayIso
              const list = occurrencesByDate.get(c.dateStr) || []
              const visible = list.slice(0, 2)
              const overflow = list.length - visible.length
              return (
                <button
                  key={c.key}
                  type="button"
                  className={`cal-cell${isToday ? ' is-today' : ''}${list.length ? ' has-events' : ''}`}
                  onClick={() => setEditing({ mode: 'create', date: c.dateStr })}
                >
                  <span className="cal-cell-day">{c.day}</span>
                  <div className="cal-cell-events">
                    {visible.map(ev => (
                      <div
                        key={ev.id + ':' + c.dateStr}
                        className="cal-event"
                        style={{ background: `color-mix(in oklab, ${ev.color || '#bc8cff'} 22%, transparent)`, borderColor: ev.color || '#bc8cff' }}
                        onClick={e => { e.stopPropagation(); setEditing({ mode: 'edit', event: ev }) }}
                      >
                        <span className="cal-event-dot" style={{ background: ev.color || '#bc8cff' }} />
                        <span className="cal-event-title">{ev.title}</span>
                        {ev.recurrence_rule?.start_time && (
                          <span className="cal-event-time">
                            {fmtTime12(ev.recurrence_rule.start_time)}
                            {ev.recurrence_rule.end_time ? `–${fmtTime12(ev.recurrence_rule.end_time)}` : ''}
                          </span>
                        )}
                      </div>
                    ))}
                    {overflow > 0 && <div className="cal-event-more">+{overflow} more</div>}
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}

      {editing && (
        <EventEditorModal
          mode={editing.mode}
          initialDate={editing.date}
          initialEvent={editing.event}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
          onDelete={editing.mode === 'edit' && editing.event ? () => handleDelete(editing.event.id) : null}
        />
      )}
    </section>
  )
}

// ─── EventEditorModal ──────────────────────────────────────────────────────
//
// Three creation modes:
//   • single — one date
//   • range  — start..end + weekday toggles
//   • manual — mini calendar with multi-select
// Plus title, color, start/end times (12h with AM/PM).

const DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DOW_NAMES  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const PRESET_COLORS = ['#bc8cff', '#58a6ff', '#3fb950', '#f0a500', '#f85149', '#7dd3fc', '#fbbf24', '#34d399']

// Convert 24-h "HH:MM" → { h12, mm, ampm } for the picker.
function unpackTime(hhmm, fallbackH12, fallbackAmpm) {
  if (!hhmm) return { h12: fallbackH12, mm: '00', ampm: fallbackAmpm }
  const [hStr, mStr] = hhmm.split(':')
  const h = Number(hStr) || 0
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = ((h + 11) % 12) + 1
  return { h12: String(h12), mm: (mStr || '00').padStart(2, '0'), ampm }
}
function packTime({ h12, mm, ampm }) {
  const h12n = Math.max(1, Math.min(12, Number(h12) || 12))
  let h24
  if (ampm === 'AM') h24 = h12n === 12 ? 0 : h12n
  else               h24 = h12n === 12 ? 12 : h12n + 12
  const mmStr = String(Math.max(0, Math.min(59, Number(mm) || 0))).padStart(2, '0')
  return `${String(h24).padStart(2, '0')}:${mmStr}`
}
function compareTimes(a, b) {
  // returns true if a < b
  if (!a || !b) return true
  return a < b
}

function EventEditorModal({ mode, initialDate, initialEvent, onCancel, onSave, onDelete }) {
  const isEdit = mode === 'edit' && !!initialEvent
  const seedRule = initialEvent?.recurrence_rule || {}

  const [title, setTitle] = useState(initialEvent?.title || '')
  const [color, setColor] = useState(initialEvent?.color || PRESET_COLORS[0])
  const [eventMode, setEventMode] = useState(seedRule.mode || 'single')
  const [singleDate, setSingleDate] = useState(seedRule.date || initialDate || todayIsoLocal())
  const [rangeStart, setRangeStart] = useState(seedRule.start || initialDate || todayIsoLocal())
  const [rangeEnd, setRangeEnd] = useState(seedRule.end || initialDate || todayIsoLocal())
  const [days, setDays] = useState(Array.isArray(seedRule.days) ? seedRule.days : [1, 2, 3, 4]) // Mon-Thu
  const [manualDates, setManualDates] = useState(
    Array.isArray(seedRule.dates) ? seedRule.dates.slice() : (initialDate ? [initialDate] : []),
  )

  const startTimeSeed = unpackTime(seedRule.start_time, '3', 'PM')
  const endTimeSeed = unpackTime(seedRule.end_time, '5', 'PM')
  const [startTime, setStartTime] = useState(startTimeSeed)
  const [endTime, setEndTime] = useState(endTimeSeed)
  const startStr = packTime(startTime)
  const endStr = packTime(endTime)
  const timesValid = compareTimes(startStr, endStr)

  // Build the in-flight rule for the preview count.
  const previewRule = useMemo(() => {
    if (eventMode === 'single') return { mode: 'single', date: singleDate, start_time: startStr, end_time: endStr }
    if (eventMode === 'range')  return { mode: 'range', start: rangeStart, end: rangeEnd, days, start_time: startStr, end_time: endStr }
    return { mode: 'manual', dates: manualDates, start_time: startStr, end_time: endStr }
  }, [eventMode, singleDate, rangeStart, rangeEnd, days, manualDates, startStr, endStr])
  const occurrenceCount = useMemo(() => countOccurrences(previewRule), [previewRule])

  // Manual mode — small two-month picker
  const [manualMonth, setManualMonth] = useState(() => {
    const d = manualDates[0] ? fromIso(manualDates[0]) : new Date()
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  function toggleManualDate(iso) {
    setManualDates(prev => prev.includes(iso) ? prev.filter(d => d !== iso) : [...prev, iso].sort())
  }
  function shiftManualMonth(delta) {
    setManualMonth(v => {
      const d = new Date(v.y, v.m + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  }
  const manualMonthCells = useMemo(() => {
    const first = new Date(manualMonth.y, manualMonth.m, 1)
    const firstDow = first.getDay()
    const daysInMonth = new Date(manualMonth.y, manualMonth.m + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < firstDow; i++) cells.push({ kind: 'blank', key: `b-${i}` })
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(manualMonth.y, manualMonth.m, d)
      cells.push({ kind: 'day', key: toIso(date), day: d, dateStr: toIso(date) })
    }
    return {
      cells,
      label: first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    }
  }, [manualMonth])

  function toggleDay(d) {
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort())
  }

  const canSave = (() => {
    if (!title.trim()) return false
    if (!timesValid) return false
    if (eventMode === 'single' && !singleDate) return false
    if (eventMode === 'range') {
      if (!rangeStart || !rangeEnd) return false
      if (rangeStart > rangeEnd) return false
      if (days.length === 0) return false
    }
    if (eventMode === 'manual' && manualDates.length === 0) return false
    return true
  })()

  function handleSave() {
    if (!canSave) return
    const rule = { ...previewRule }
    onSave({
      id: initialEvent?.id,
      title: title.trim(),
      color,
      recurrence_rule: rule,
      exceptions: initialEvent?.exceptions || [],
    })
  }

  return (
    <div className="cal-modal-overlay" onClick={onCancel}>
      <div className="cal-modal" onClick={e => e.stopPropagation()}>
        <header className="cal-modal-head">
          <div className="cal-modal-eyebrow">{isEdit ? 'EDIT EVENT' : 'NEW EVENT'}</div>
          <input
            className="cal-modal-title"
            placeholder="Event name — e.g. Captain's practice"
            value={title}
            onChange={e => setTitle(e.target.value)}
            autoFocus={!isEdit}
            maxLength={80}
          />
        </header>

        <div className="cal-modal-body">
          {/* Mode toggle */}
          <div className="cal-modal-modetoggle">
            {[
              { id: 'single', label: 'Single date' },
              { id: 'range',  label: 'Date range' },
              { id: 'manual', label: 'Pick dates' },
            ].map(opt => (
              <button
                key={opt.id}
                type="button"
                className={`cal-modetoggle-btn${eventMode === opt.id ? ' active' : ''}`}
                onClick={() => setEventMode(opt.id)}
              >{opt.label}</button>
            ))}
          </div>

          {/* Mode-specific date picker */}
          {eventMode === 'single' && (
            <div className="cal-modal-row">
              <label className="cal-field">
                <span className="cal-field-lbl">Date</span>
                <input
                  type="date"
                  className="cal-field-input"
                  value={singleDate}
                  onChange={e => setSingleDate(e.target.value)}
                />
              </label>
            </div>
          )}

          {eventMode === 'range' && (
            <>
              <div className="cal-modal-row">
                <label className="cal-field">
                  <span className="cal-field-lbl">Start date</span>
                  <input type="date" className="cal-field-input" value={rangeStart} onChange={e => setRangeStart(e.target.value)} />
                </label>
                <label className="cal-field">
                  <span className="cal-field-lbl">End date</span>
                  <input type="date" className="cal-field-input" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} />
                </label>
              </div>
              <div className="cal-modal-row">
                <span className="cal-field-lbl">Repeat on</span>
                <div className="cal-dow-toggles">
                  {DOW_LABELS.map((l, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`cal-dow-btn${days.includes(i) ? ' active' : ''}`}
                      onClick={() => toggleDay(i)}
                      title={DOW_NAMES[i]}
                    >{l}</button>
                  ))}
                </div>
              </div>
            </>
          )}

          {eventMode === 'manual' && (
            <div className="cal-modal-row cal-modal-manual">
              <div className="cal-manual-head">
                <button type="button" className="cal-nav-btn" onClick={() => shiftManualMonth(-1)}>‹</button>
                <span className="cal-manual-month">{manualMonthCells.label}</span>
                <button type="button" className="cal-nav-btn" onClick={() => shiftManualMonth(1)}>›</button>
              </div>
              <div className="cal-dow cal-dow-small">
                {DOW_LABELS.map((l, i) => <span key={i} className="cal-dow-cell">{l}</span>)}
              </div>
              <div className="cal-manual-grid">
                {manualMonthCells.cells.map(c => {
                  if (c.kind === 'blank') return <span key={c.key} className="cal-manual-cell blank" />
                  const selected = manualDates.includes(c.dateStr)
                  return (
                    <button
                      key={c.key}
                      type="button"
                      className={`cal-manual-cell${selected ? ' selected' : ''}`}
                      onClick={() => toggleManualDate(c.dateStr)}
                    >{c.day}</button>
                  )
                })}
              </div>
              {manualDates.length > 0 && (
                <div className="cal-manual-summary">{manualDates.length} dates selected</div>
              )}
            </div>
          )}

          {/* Times */}
          <div className="cal-modal-row">
            <span className="cal-field-lbl">Time</span>
            <TimePicker value={startTime} onChange={setStartTime} />
            <span className="cal-time-dash">–</span>
            <TimePicker value={endTime} onChange={setEndTime} />
          </div>
          {!timesValid && (
            <div className="cal-modal-warn">End time must be after start time.</div>
          )}

          {/* Color */}
          <div className="cal-modal-row">
            <span className="cal-field-lbl">Color</span>
            <div className="cal-color-row">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`cal-color-swatch${color === c ? ' active' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  title={c}
                />
              ))}
              <input
                type="color"
                className="cal-color-custom"
                value={color}
                onChange={e => setColor(e.target.value)}
                title="Custom color"
              />
            </div>
          </div>

          {/* Preview */}
          <div className="cal-modal-preview">
            {occurrenceCount === 0
              ? 'No occurrences — pick at least one date.'
              : `${occurrenceCount} occurrence${occurrenceCount === 1 ? '' : 's'}`}
          </div>
        </div>

        <footer className="cal-modal-actions">
          {onDelete ? (
            <button type="button" className="cal-btn danger" onClick={onDelete}>Delete</button>
          ) : <span />}
          <div className="cal-modal-actions-right">
            <button type="button" className="cal-btn ghost" onClick={onCancel}>Cancel</button>
            <button type="button" className="cal-btn primary" onClick={handleSave} disabled={!canSave}>
              {isEdit ? 'Save changes' : 'Create event'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

function TimePicker({ value, onChange }) {
  const HOURS = ['12','1','2','3','4','5','6','7','8','9','10','11']
  const MINUTES = ['00','15','30','45']
  return (
    <span className="cal-timepicker">
      <select
        className="cal-time-select"
        value={value.h12}
        onChange={e => onChange({ ...value, h12: e.target.value })}
      >
        {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      <span className="cal-time-colon">:</span>
      <select
        className="cal-time-select"
        value={value.mm}
        onChange={e => onChange({ ...value, mm: e.target.value })}
      >
        {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <select
        className="cal-time-select cal-time-ampm"
        value={value.ampm}
        onChange={e => onChange({ ...value, ampm: e.target.value })}
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </span>
  )
}
