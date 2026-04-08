import { useState, useRef, useEffect, useCallback } from 'react';
import { pColors, mkInit } from '../utils/colors';
import { hpct, n3, hcol } from '../utils/stats';
import { saveSession, abandonSession } from '../utils/liveSession';

const GOOD_ACTIONS = [
  { key: 'kill',         abbr: 'K',   label: 'Kill',         stat: 'kills',         autoAtt: true, big: true },
  { key: 'assist',       abbr: 'A',   label: 'Assist',       stat: 'assists' },
  { key: 'dig',          abbr: 'D',   label: 'Dig',          stat: 'digs' },
  { key: 'ace',          abbr: 'SA',  label: 'Ace',          stat: 'aces' },
  { key: 'block_solo',   abbr: 'BS',  label: 'Block',        stat: 'blocks' },
  { key: 'block_assist', abbr: 'BA',  label: 'Blk Ast',      stat: 'block_assists' },
  { key: 'attempt',      abbr: 'Att', label: 'Attempt',      stat: 'attempts' },
];

const ERROR_ACTIONS = [
  { key: 'attack_error', abbr: 'E',   label: 'Atk Err',     stat: 'errors', autoAtt: true },
  { key: 'serve_error',  abbr: 'SE',  label: 'Srv Err',     stat: 'serve_errors' },
  { key: 'recv_error',   abbr: 'RE',  label: 'Rcv Err',     stat: 'digs' },
];

// Stat line items: [statKey, abbreviation]
const STAT_LINE = [
  ['kills','K'],['errors','E'],['attempts','TA'],['_hpct',''],['assists','A'],['aces','SA'],['serve_errors','SE'],['digs','D'],['blocks','BS'],['block_assists','BA'],
];

function StatLine({ s }) {
  const hasAny = s.kills || s.errors || s.attempts || s.assists || s.aces || s.serve_errors || s.digs || s.blocks || s.block_assists;
  if (!hasAny) return <span className="lg2-sl-empty">—</span>;
  const hp = hpct(s.kills, s.errors, s.attempts);
  return (
    <span className="lg2-sl">
      {STAT_LINE.map(([key, abbr], i) => {
        if (key === '_hpct') {
          if (!s.attempts) return null;
          return <span key={i} className="lg2-sl-pair"><span className="lg2-sl-num" style={{ color: hcol(s.kills, s.errors, s.attempts) }}>{n3(hp)}</span></span>;
        }
        const v = s[key] || 0;
        if (v === 0) return null;
        return <span key={i} className="lg2-sl-pair"><span className="lg2-sl-num">{v}</span><span className="lg2-sl-abbr">{abbr}</span></span>;
      })}
    </span>
  );
}

export default function LiveGame({ team, gameInfo, onEndMatch, onAbandon, resumeSession }) {
  const { roster, bestOf } = gameInfo;
  const setsToWin = bestOf === 3 ? 2 : 3;
  const rs = resumeSession;

  const [homeScore, setHomeScore] = useState(rs ? rs.home_score : 0);
  const [awayScore, setAwayScore] = useState(rs ? rs.away_score : 0);
  const [currentSet, setCurrentSet] = useState(rs ? rs.current_set : 1);
  const [homeSetsWon, setHomeSetsWon] = useState(rs ? rs.home_sets : 0);
  const [awaySetsWon, setAwaySetsWon] = useState(rs ? rs.away_sets : 0);
  const [sets, setSets] = useState(rs ? (rs.set_history || []) : []);

  const [stats, setStats] = useState(() => {
    if (rs && rs.player_stats && Object.keys(rs.player_stats).length > 0) return rs.player_stats;
    const o = {};
    roster.forEach(p => { o[p.id] = { kills:0,aces:0,digs:0,assists:0,blocks:0,errors:0,attempts:0,sets_played:0,block_assists:0,serve_errors:0 }; });
    return o;
  });

  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [view, setView] = useState('track');
  const [history, setHistory] = useState(rs ? (rs.history || []) : []);
  const [lastAction, setLastAction] = useState('');
  const [flashKey, setFlashKey] = useState(0);
  const [flashId, setFlashId] = useState(null);
  const [showSetOver, setShowSetOver] = useState(false);
  const [showMatchOver, setShowMatchOver] = useState(false);
  const [pendingSet, setPendingSet] = useState(null);
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);

  const isFinalSet = currentSet === bestOf;
  const target = isFinalSet ? 15 : 25;
  const isDeuce = homeScore >= target - 1 && awayScore >= target - 1 && homeScore > 0;

  // Auto-save
  const saveTimer = useRef(null);
  const triggerSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveSession(team.id, {
        opponent: gameInfo.opponent, bestOf: gameInfo.bestOf, currentSet, homeScore, awayScore,
        homeSetsWon, awaySetsWon, sets, stats,
        lineup: roster.map(p => ({ id:p.id, name:p.name, jersey_number:p.jersey_number, position:p.position, colors:p.colors, player_index:p.player_index, initials:p.initials })),
        isLeague: gameInfo.isLeague, leagueTeamId: gameInfo.leagueTeamId,
        scheduledGameId: gameInfo.scheduledGameId, gameDate: gameInfo.gameDate, location: gameInfo.location, history,
      });
    }, 300);
  }, [team.id, gameInfo, currentSet, homeScore, awayScore, homeSetsWon, awaySetsWon, sets, stats, roster, history]);
  useEffect(() => { triggerSave(); return () => { if (saveTimer.current) clearTimeout(saveTimer.current); }; }, [triggerSave]);

  function isSetDone(hs, as) { const t = currentSet >= bestOf ? 15 : 25; return (hs >= t || as >= t) && Math.abs(hs - as) >= 2; }
  function pushHistory(entry) { setHistory(prev => [...prev, entry]); }

  function addPoint(side) {
    const nh = side === 'home' ? homeScore + 1 : homeScore;
    const na = side === 'away' ? awayScore + 1 : awayScore;
    pushHistory({ type:'point', homeScore, awayScore, currentSet, homeSetsWon, awaySetsWon });
    setHomeScore(nh); setAwayScore(na);
    if (isSetDone(nh, na)) {
      const hw = nh > na;
      const nhs = homeSetsWon + (hw?1:0), nas = awaySetsWon + (hw?0:1);
      setPendingSet({ home:nh, away:na, nhs, nas });
      if (nhs >= setsToWin || nas >= setsToWin) {
        setSets(p => [...p, { home:nh, away:na }]); setHomeSetsWon(nhs); setAwaySetsWon(nas); setShowMatchOver(true);
      } else { setShowSetOver(true); }
    }
  }
  function subPoint(side) {
    if (side==='home' && homeScore>0) { pushHistory({ type:'point', homeScore, awayScore, currentSet, homeSetsWon, awaySetsWon }); setHomeScore(homeScore-1); }
    if (side==='away' && awayScore>0) { pushHistory({ type:'point', homeScore, awayScore, currentSet, homeSetsWon, awaySetsWon }); setAwayScore(awayScore-1); }
  }
  function confirmEndSet() { if(!pendingSet)return; finishSet(pendingSet.home,pendingSet.away,pendingSet.nhs,pendingSet.nas); setPendingSet(null); setShowSetOver(false); }
  function keepPlaying() { setPendingSet(null); setShowSetOver(false); }
  function manualEndSet() {
    if (homeScore===0&&awayScore===0) return; if (homeScore===awayScore) return;
    const hw=homeScore>awayScore; finishSet(homeScore,awayScore,homeSetsWon+(hw?1:0),awaySetsWon+(hw?0:1));
  }
  function finishSet(hs,as,nhs,nas) {
    setSets(p=>[...p,{home:hs,away:as}]); setHomeSetsWon(nhs); setAwaySetsWon(nas);
    setStats(prev => { const next={...prev}; roster.forEach(p=>{next[p.id]={...next[p.id],sets_played:(next[p.id].sets_played||0)+1};}); return next; });
    if(nhs>=setsToWin||nas>=setsToWin){setShowMatchOver(true);}else{setCurrentSet(c=>c+1);setHomeScore(0);setAwayScore(0);setHistory([]);}
  }
  function recordAction(action) {
    if(!selectedPlayer)return;
    const player=roster.find(p=>p.id===selectedPlayer);
    pushHistory({type:'stat',playerId:selectedPlayer,prevStats:{...stats[selectedPlayer]}});
    setStats(prev=>{const ps={...prev[selectedPlayer]};ps[action.stat]=(ps[action.stat]||0)+1;if(action.autoAtt)ps.attempts=(ps.attempts||0)+1;return{...prev,[selectedPlayer]:ps};});
    setLastAction(`${player?.name?.split(' ')[0]||'?'} → ${action.label}`);
    setFlashId(action.key); setFlashKey(k=>k+1);
  }
  function handleUndo() {
    if(!history.length)return;const last=history[history.length-1];
    if(last.type==='point'){setHomeScore(last.homeScore);setAwayScore(last.awayScore);setCurrentSet(last.currentSet);setHomeSetsWon(last.homeSetsWon);setAwaySetsWon(last.awaySetsWon);}
    else if(last.type==='stat'){setStats(prev=>({...prev,[last.playerId]:last.prevStats}));}
    setHistory(prev=>prev.slice(0,-1)); setLastAction('(undone)');
  }
  function handleMatchConfirm() {
    const payload = { homeSetsWon, awaySetsWon, sets, result: homeSetsWon>awaySetsWon?'W':'L', stats:{...stats} };
    console.log('[LiveGame] handleMatchConfirm',payload.result,payload.homeSetsWon,'-',payload.awaySetsWon);
    onEndMatch(payload);
  }
  async function handleAbandon() { await abandonSession(team.id); setShowAbandonConfirm(false); if(onAbandon)onAbandon(); }

  const selPlayer = roster.find(p => p.id === selectedPlayer);
  const selStats = selectedPlayer ? stats[selectedPlayer] : null;

  // Sort roster by kills desc for stats tab
  const sortedRoster = [...roster].sort((a,b) => (stats[b.id]?.kills||0) - (stats[a.id]?.kills||0));

  return (
    <div className="lg2">
      {/* ── SCOREBOARD ─────────────────────────────────────────────── */}
      <div className="lg2-sb">
        <div className="lg2-sb-row1">
          <button className="lg2-sb-undo" onClick={handleUndo} disabled={!history.length}>↩</button>
          <div className="lg2-sb-setpill">SET {currentSet}</div>
          <button className="lg2-sb-endset" onClick={manualEndSet} disabled={homeScore===0&&awayScore===0}>End Set</button>
        </div>
        <div className="lg2-sb-scores">
          <div className="lg2-sb-side">
            <div className="lg2-sb-teamlbl">{team.name}</div>
            <div className="lg2-sb-num">{homeScore}</div>
            <div className="lg2-sb-btns">
              <button className="lg2-sb-btn lg2-sb-btn-minus" onClick={()=>subPoint('home')}>-</button>
              <button className="lg2-sb-btn lg2-sb-btn-plus" onClick={()=>addPoint('home')}>+</button>
            </div>
          </div>
          <div className="lg2-sb-mid">
            <div className="lg2-sb-setswon">{homeSetsWon}-{awaySetsWon}</div>
            <div className="lg2-sb-setslbl">SETS</div>
          </div>
          <div className="lg2-sb-side lg2-sb-away">
            <div className="lg2-sb-teamlbl">{gameInfo.opponent}</div>
            <div className="lg2-sb-num">{awayScore}</div>
            <div className="lg2-sb-btns">
              <button className="lg2-sb-btn lg2-sb-btn-minus" onClick={()=>subPoint('away')}>-</button>
              <button className="lg2-sb-btn lg2-sb-btn-plus" onClick={()=>addPoint('away')}>+</button>
            </div>
          </div>
        </div>
        {(sets.length>0||isDeuce) && (
          <div className="lg2-sb-footer">
            {sets.map((s,i)=><span key={i} className="lg2-sb-chip">S{i+1}: {s.home}-{s.away}</span>)}
            {isDeuce && <span className="lg2-sb-deuce">DEUCE</span>}
          </div>
        )}
      </div>

      {/* ── LAST ACTION BAR ────────────────────────────────────────── */}
      <div className="lg2-lastbar">
        <span className="lg2-lastbar-text">{lastAction || 'Tap a player to start tracking'}</span>
        <button className="lg2-lastbar-undo" onClick={handleUndo} disabled={!history.length}>↩ Undo</button>
      </div>

      {/* ── VIEW TABS ──────────────────────────────────────────────── */}
      <div className="lg2-tabs">
        <button className={`lg2-tab ${view==='track'?'active':''}`} onClick={()=>setView('track')}>Live</button>
        <button className={`lg2-tab ${view==='stats'?'active':''}`} onClick={()=>setView('stats')}>Stats</button>
        <button className="lg2-tab lg2-tab-abandon" onClick={()=>setShowAbandonConfirm(true)}>Abandon</button>
      </div>

      {/* ── TRACK VIEW ─────────────────────────────────────────────── */}
      {view === 'track' ? (
        <div className="lg2-body">
          <div className="lg2-pgrid-wrap">
            <div className="lg2-pgrid">
              {roster.map((p,i) => {
                const c = p.colors || pColors(p.player_index ?? i);
                const s = stats[p.id];
                const sel = p.id === selectedPlayer;
                return (
                  <div key={p.id} className={`lg2-pcard ${sel?'lg2-pcard-sel':''}`} onClick={()=>setSelectedPlayer(sel?null:p.id)}>
                    <div className="lg2-pcard-top">
                      <div className="lg2-pcard-badge" style={{background:c.bg,color:c.text}}>{p.initials||mkInit(p.name)}</div>
                      <div className="lg2-pcard-info">
                        <div className="lg2-pcard-name">{p.name}</div>
                        <div className="lg2-pcard-meta">{[p.jersey_number?`#${p.jersey_number}`:null,p.position].filter(Boolean).join(' · ')||'\u00A0'}</div>
                      </div>
                    </div>
                    <div className="lg2-pcard-statline"><StatLine s={s} /></div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── ACTION WHEEL ───────────────────────────────────────── */}
          {selectedPlayer && selPlayer ? (
            <div className="lg2-actions">
              <div className="lg2-act-hdr">
                <span className="lg2-act-name">{selPlayer.name}</span>
                {selPlayer.jersey_number && <span className="lg2-act-num">#{selPlayer.jersey_number}</span>}
                <button className="lg2-act-close" onClick={()=>setSelectedPlayer(null)}>×</button>
              </div>
              <div className="lg2-act-row lg2-act-good">
                {GOOD_ACTIONS.map(a=>(
                  <ActBtn key={a.key} action={a} isErr={false} flashId={flashId} flashKey={flashKey} onClick={()=>recordAction(a)} />
                ))}
              </div>
              <div className="lg2-act-row lg2-act-err">
                {ERROR_ACTIONS.map(a=>(
                  <ActBtn key={a.key} action={a} isErr={true} flashId={flashId} flashKey={flashKey} onClick={()=>recordAction(a)} />
                ))}
              </div>
            </div>
          ) : (
            <div className="lg2-nosel">Tap a player to log stats</div>
          )}
        </div>
      ) : (
        /* ── STATS TABLE ─────────────────────────────────────────── */
        <div className="lg2-statstable-wrap">
          <table className="lg2-statstable">
            <thead>
              <tr>
                <th className="lg2-st-left">#</th><th className="lg2-st-left">Name</th>
                <th>K</th><th>E</th><th>TA</th><th>K%</th><th>A</th><th>SA</th><th>SE</th><th>D</th><th>BS</th><th>BA</th>
              </tr>
            </thead>
            <tbody>
              {sortedRoster.map(p => {
                const s = stats[p.id]; const hp = hpct(s.kills,s.errors,s.attempts);
                return (
                  <tr key={p.id}>
                    <td className="lg2-st-left" style={{color:'rgba(255,255,255,0.35)'}}>{p.jersey_number||'—'}</td>
                    <td className="lg2-st-left lg2-st-name">{p.name}</td>
                    <td>{s.kills}</td>
                    <td style={{color:s.errors>0?'#f87171':'inherit'}}>{s.errors}</td>
                    <td>{s.attempts}</td>
                    <td style={{color:hcol(s.kills,s.errors,s.attempts),fontWeight:700}}>{s.attempts>0?n3(hp):'—'}</td>
                    <td>{s.assists}</td><td>{s.aces}</td>
                    <td style={{color:s.serve_errors>0?'#f87171':'inherit'}}>{s.serve_errors}</td>
                    <td>{s.digs}</td><td>{s.blocks}</td><td>{s.block_assists}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── MODALS ─────────────────────────────────────────────────── */}
      {showSetOver && pendingSet && (
        <div className="modal-overlay">
          <div className="modal-content" style={{textAlign:'center'}}>
            <h2>Set {currentSet} Over!</h2>
            <div style={{fontSize:40,fontWeight:900,margin:'12px 0',color:'var(--text)'}}>{pendingSet.home} – {pendingSet.away}</div>
            <div style={{fontSize:13,color:'var(--text-secondary)',marginBottom:20}}>Sets: {pendingSet.nhs} – {pendingSet.nas}</div>
            <div style={{display:'flex',gap:12,justifyContent:'center'}}>
              <button className="modal-btn-cancel" onClick={keepPlaying}>Keep Playing</button>
              <button className="modal-btn-primary" onClick={confirmEndSet}>End Set</button>
            </div>
          </div>
        </div>
      )}
      {showMatchOver && (
        <div className="modal-overlay">
          <div className="modal-content" style={{textAlign:'center'}}>
            <h2>Match Over!</h2>
            <div style={{fontSize:52,fontWeight:900,margin:'12px 0',color:'var(--text)'}}>{homeSetsWon} – {awaySetsWon}</div>
            <div style={{fontSize:18,fontWeight:700,marginBottom:16,color:homeSetsWon>awaySetsWon?'#16a34a':'#dc2626'}}>{homeSetsWon>awaySetsWon?'Victory!':'Defeat'}</div>
            {sets.map((s,i)=>(<div key={i} style={{fontSize:13,color:'var(--text-secondary)',marginBottom:4}}>Set {i+1}: {s.home}-{s.away}</div>))}
            <button className="modal-btn-primary" onClick={handleMatchConfirm} style={{marginTop:20,width:'100%',padding:14,fontSize:16}}>Save &amp; Finish</button>
          </div>
        </div>
      )}
      {showAbandonConfirm && (
        <div className="modal-overlay">
          <div className="modal-content" style={{textAlign:'center'}}>
            <h2>Abandon Game?</h2>
            <p style={{color:'var(--text-secondary)',fontSize:14,marginBottom:20}}>This will discard all tracking progress. Cannot be undone.</p>
            <div style={{display:'flex',gap:12,justifyContent:'center'}}>
              <button className="modal-btn-cancel" onClick={()=>setShowAbandonConfirm(false)}>Cancel</button>
              <button className="modal-btn-primary" style={{background:'#dc2626'}} onClick={handleAbandon}>Abandon Game</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Action Button ────────────────────────────────────────────────────────────
function ActBtn({ action, isErr, flashId, flashKey, onClick }) {
  const [flashing, setFlashing] = useState(false);
  const prevKey = useRef(flashKey);
  useEffect(() => {
    if (flashKey !== prevKey.current && flashId === action.key) {
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), 200);
      prevKey.current = flashKey;
      return () => clearTimeout(t);
    }
    prevKey.current = flashKey;
  }, [flashKey, flashId, action.key]);

  return (
    <button
      className={`lg2-abtn ${isErr?'lg2-abtn-err':'lg2-abtn-good'} ${action.big?'lg2-abtn-big':''} ${flashing?'lg2-abtn-flash':''}`}
      onClick={onClick}
    >
      <span className="lg2-abtn-abbr">{action.abbr}</span>
      <span className="lg2-abtn-label">{action.label}</span>
    </button>
  );
}
