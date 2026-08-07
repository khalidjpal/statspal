// Pure date / recurrence helpers shared between the RotationPal calendar
// panel (Supabase-backed, expanded at render time) and the dashboard's
// AddCalendarEventModal (localStorage-backed, expanded at save time so each
// occurrence becomes its own event row).

export function toIso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function fromIso(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export function addDays(d, n) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + n);
  return nd;
}
export function todayIsoLocal() {
  return toIso(new Date());
}

// 24-h "HH:MM" → "h:MM AM/PM".
export function fmtTime12(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h)) return '';
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m || 0).padStart(2, '0')} ${ampm}`;
}

// Recurrence rule shape:
//   { mode: 'single' | 'range' | 'manual',
//     date?,                              // single
//     start?, end?, days?,                // range; days = [0..6] Sun=0
//     dates?,                             // manual
//     start_time?, end_time? }            // optional times
//
// expandRule returns the ordered list of YYYY-MM-DD strings the rule
// produces. Optional window clamps to a date range. Hard cap at 500 to
// prevent pathological expansions.
export function expandRule(rule, windowStart, windowEnd) {
  if (!rule) return [];
  const out = [];
  const wStart = windowStart ? fromIso(windowStart) : null;
  const wEnd = windowEnd ? fromIso(windowEnd) : null;
  const inWindow = (d) => (!wStart || d >= wStart) && (!wEnd || d <= wEnd);

  if (rule.mode === 'single' || (!rule.mode && rule.date)) {
    const d = fromIso(rule.date);
    if (d && inWindow(d)) out.push(toIso(d));
    return out;
  }
  if (rule.mode === 'range') {
    const rStart = fromIso(rule.start);
    const rEnd = fromIso(rule.end);
    if (!rStart || !rEnd || rStart > rEnd) return out;
    const days = Array.isArray(rule.days) && rule.days.length > 0
      ? new Set(rule.days.map(Number))
      : null;
    let cur = new Date(rStart);
    const stop = rEnd;
    while (cur <= stop) {
      if ((!days || days.has(cur.getDay())) && inWindow(cur)) {
        out.push(toIso(cur));
        if (out.length >= 500) break;
      }
      cur = addDays(cur, 1);
    }
    return out;
  }
  if (rule.mode === 'manual') {
    for (const iso of Array.isArray(rule.dates) ? rule.dates : []) {
      const d = fromIso(iso);
      if (d && inWindow(d)) out.push(iso);
    }
    return out;
  }
  return out;
}

export function countOccurrences(rule) {
  return expandRule(rule).length;
}
