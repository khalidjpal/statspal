// Hitting percentage: (K - E) / Att, clamped to [-1, +1]
export function hpct(k, e, att) {
  if (att <= 0) return null;
  const h = (k - e) / att;
  return Math.max(-1, Math.min(1, h));
}

// Hitting % as signed display string: "+.312", "-.045", "+.000"
export function hfmt(k, e, att) {
  const h = hpct(k, e, att);
  if (h === null) return '—';
  const sign = h >= 0 ? '+' : '-';
  const abs = Math.abs(h).toFixed(3);
  // Remove leading zero: "0.312" → ".312"
  return sign + abs.replace(/^0/, '');
}

// Legacy alias — use hfmt instead in new code
export function hstr(k, e, att) {
  return hfmt(k, e, att);
}

// Hitting % color scale (based on signed value)
export function hcol(k, e, att) {
  const h = hpct(k, e, att);
  if (h === null) return '#888';
  if (h <= 0.100) return '#C0392B';
  if (h <= 0.150) return '#E05A2B';
  if (h <= 0.200) return '#E67E22';
  if (h <= 0.250) return '#27AE60';
  if (h <= 0.300) return '#1E8449';
  return '#0F6E56';
}

// Hitting % label
export function hlbl(k, e, att) {
  const h = hpct(k, e, att);
  if (h === null) return 'N/A';
  if (h <= 0.000) return 'Poor';
  if (h <= 0.100) return 'Poor';
  if (h <= 0.150) return 'Below Avg';
  if (h <= 0.200) return 'Average';
  if (h <= 0.250) return 'Good';
  if (h <= 0.300) return 'Very Good';
  return 'Excellent';
}

// Validate stat line: returns error string or null if valid
export function validateStats(k, e, att) {
  k = Number(k) || 0;
  e = Number(e) || 0;
  att = Number(att) || 0;
  if (att < k) {
    return `Attempts (${att}) must be at least as high as Kills (${k}).`;
  }
  if (att < e) {
    return `Attempts (${att}) must be at least as high as Errors (${e}).`;
  }
  if (k + e > att) {
    return `Kills (${k}) + Errors (${e}) = ${k + e} exceeds Attempts (${att}). Please increase attempts to at least ${k + e}.`;
  }
  return null;
}

// Black or white text for contrast
export function bw(hex) {
  if (!hex) return '#fff';
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 140 ? '#000' : '#fff';
}

// Format number to 2 decimal places
export function n2(v) {
  return v != null ? v.toFixed(2) : '—';
}

// Format hitting % with sign: "+.312" / "-.045" / "—"
export function n3(v) {
  if (v == null) return '—';
  const clamped = Math.max(-1, Math.min(1, v));
  const sign = clamped >= 0 ? '+' : '-';
  const abs = Math.abs(clamped).toFixed(3);
  return sign + abs.replace(/^0/, '');
}

// Compute totals for a single player across games
export function playerTotals(statsRows) {
  const t = { kills: 0, aces: 0, digs: 0, assists: 0, blocks: 0, errors: 0, attempts: 0, sets_played: 0 };
  for (const r of statsRows) {
    t.kills += r.kills || 0;
    t.aces += r.aces || 0;
    t.digs += r.digs || 0;
    t.assists += r.assists || 0;
    t.blocks += r.blocks || 0;
    t.errors += r.errors || 0;
    t.attempts += r.attempts || 0;
    t.sets_played += r.sets_played || 0;
  }
  return t;
}

// Compute team totals from all player stats for a set of games
export function teamTotals(allStats) {
  return playerTotals(allStats);
}

// Compute team record from completed games
export function teamRecord(games) {
  let w = 0, l = 0;
  for (const g of games) {
    if (g.result === 'W') w++;
    else if (g.result === 'L') l++;
  }
  return { w, l };
}

// Compute league standings with tiebreakers
export function computeStandings(leagueTeams, leagueResults) {
  const map = {};
  for (const lt of leagueTeams) {
    map[lt.id] = {
      id: lt.id,
      name: lt.name,
      dot_color: lt.dot_color,
      text_color: lt.text_color,
      is_us: lt.is_us,
      wins: 0,
      losses: 0,
      setsWon: 0,
      setsLost: 0,
      h2h: {},
    };
  }

  for (const r of leagueResults) {
    const home = map[r.home_league_team_id];
    const away = map[r.away_league_team_id];
    if (!home || !away) continue;

    home.setsWon += r.home_sets || 0;
    home.setsLost += r.away_sets || 0;
    away.setsWon += r.away_sets || 0;
    away.setsLost += r.home_sets || 0;

    if ((r.home_sets || 0) > (r.away_sets || 0)) {
      home.wins++;
      away.losses++;
      home.h2h[away.id] = (home.h2h[away.id] || 0) + 1;
      away.h2h[home.id] = (away.h2h[home.id] || 0) - 1;
    } else if ((r.away_sets || 0) > (r.home_sets || 0)) {
      away.wins++;
      home.losses++;
      away.h2h[home.id] = (away.h2h[home.id] || 0) + 1;
      home.h2h[away.id] = (home.h2h[away.id] || 0) - 1;
    }
  }

  const teams = Object.values(map);
  teams.sort((a, b) => {
    const wpctA = (a.wins + a.losses) > 0 ? a.wins / (a.wins + a.losses) : 0;
    const wpctB = (b.wins + b.losses) > 0 ? b.wins / (b.wins + b.losses) : 0;
    if (wpctB !== wpctA) return wpctB - wpctA;
    // Tiebreaker 1: head-to-head
    const h2h = (a.h2h[b.id] || 0);
    if (h2h !== 0) return -h2h;
    // Tiebreaker 2: set ratio
    const srA = (a.setsWon + a.setsLost) > 0 ? a.setsWon / (a.setsWon + a.setsLost) : 0;
    const srB = (b.setsWon + b.setsLost) > 0 ? b.setsWon / (b.setsWon + b.setsLost) : 0;
    return srB - srA;
  });

  return teams;
}
