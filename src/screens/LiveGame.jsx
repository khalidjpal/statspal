import { useState, useRef, useEffect, useCallback } from 'react';
import { hpct, n3, hcol } from '../utils/stats';
import { saveSession, abandonSession } from '../utils/liveSession';
import { sortByJersey } from '../utils/sort';

const CATEGORIES = [
  { label: 'ATTACK', actions: [
    { key:'kill',         abbr:'K',   label:'Kill',    stat:'kills',              autoAtt:true, err:false },
    { key:'attack_error', abbr:'E',   label:'Atk Err', stat:'errors',             autoAtt:true, err:true  },
    { key:'attempt',      abbr:'Att', label:'Attempt', stat:'attempts',                          err:false },
  ]},
  { label: 'SERVE', actions: [
    { key:'ace',          abbr:'SA',  label:'Ace',     stat:'aces',                              err:false },
    { key:'serve_error',  abbr:'SE',  label:'Srv Err', stat:'serve_errors',                      err:true  },
  ]},
  { label: 'DEFENSE', actions: [
    { key:'dig',          abbr:'D',   label:'Dig',     stat:'digs',                              err:false },
    { key:'receive',      abbr:'R',   label:'Receive', stat:'receives',                          err:false },
    { key:'dig_error',    abbr:'DE',  label:'Dig Err', stat:'digging_errors',                    err:true  },
  ]},
  { label: 'BLOCKING', actions: [
    { key:'block_solo',   abbr:'BS',  label:'Block',   stat:'blocks',                            err:false },
    { key:'block_assist', abbr:'BA',  label:'Blk Ast', stat:'block_assists',                     err:false },
    { key:'block_error',  abbr:'BE',  label:'Blk Err', stat:'blocking_errors',                   err:true  },
  ]},
  { label: 'BALL HANDLING', actions: [
    { key:'assist',       abbr:'A',   label:'Assist',  stat:'assists',                           err:false },
    { key:'bhe',          abbr:'BHE', label:'BH Err',  stat:'ball_handling_errors',              err:true  },
  ]},
];

const EMPTY_SET_STATS = () => ({ kills:0, aces:0, digs:0, assists:0, blocks:0, errors:0, attempts:0, block_assists:0, serve_errors:0, blocking_errors:0, digging_errors:0, ball_handling_errors:0, receives:0 });

function initStats(rs, roster) {
  if (rs?.player_stats && Object.keys(rs.player_stats).length > 0) {
    const first = Object.values(rs.player_stats)[0];
    // Already new format
    if (first && typeof first === 'object' && 'overall' in first) return rs.player_stats;
    // Old flat format — convert
    const converted = {};
    Object.entries(rs.player_stats).forEach(([pid, s]) => {
      converted[pid] = { overall: { ...s }, sets: {} };
    });
    return converted;
  }
  const o = {};
  roster.forEach(p => {
    o[p.id] = {
      overall: { kills:0, aces:0, digs:0, assists:0, blocks:0, errors:0, attempts:0, sets_played:0, block_assists:0, serve_errors:0, blocking_errors:0, digging_errors:0, ball_handling_errors:0, receives:0 },
      sets: {},
    };
  });
  return o;
}

// Compact stat line with dot separators, only non-zero
function MiniStats({ s }) {
  const hp = hpct(s.kills, s.errors, s.attempts);
  const pairs = [
    [s.kills,'K'],[s.errors,'E'],[s.attempts,'TA'],
    [s.assists,'A'],[s.aces,'SA'],[s.serve_errors,'SE'],
    [s.digs,'D'],[s.blocks,'BS'],[s.block_assists,'BA'],
    [s.receives,'R'],[s.blocking_errors,'BE'],[s.digging_errors,'DE'],[s.ball_handling_errors,'BHE'],
  ];
  const nonZero = pairs.filter(([v])=>v>0);
  if (nonZero.length === 0 && !s.attempts) return <span className="lv-ms-empty">—</span>;
  const items = [];
  nonZero.forEach(([v,a],i) => {
    if (i > 0) items.push(<span key={'d'+i} className="lv-ms-dot">·</span>);
    items.push(<span key={i} className="lv-ms-p"><b>{v}</b><span className="lv-ms-a">{a}</span></span>);
  });
  if (s.attempts > 0) {
    items.push(<span key="hd" className="lv-ms-dot">·</span>);
    items.push(<span key="hp" className="lv-ms-p"><b style={{color:hcol(s.kills,s.errors,s.attempts)}}>{n3(hp)}</b></span>);
  }
  return <span className="lv-ms">{items}</span>;
}

// Full stat row with dot separators, always show all
function FullStats({ s }) {
  const hp = hpct(s.kills, s.errors, s.attempts);
  const all = [
    [s.kills,'K'],[s.errors,'E'],[s.attempts,'TA'],['_hp','K%'],
    [s.assists,'A'],[s.aces,'SA'],[s.serve_errors,'SE'],
    [s.digs,'D'],[s.blocks,'BS'],[s.block_assists,'BA'],
  ];
  return (
    <span className="lv-fs">
      {all.map(([v,a],i) => {
        const dot = i > 0 ? <span className="lv-fs-dot">·</span> : null;
        if (v === '_hp') return <span key={i}>{dot}<span className="lv-fs-p"><b style={{color:s.attempts>0?hcol(s.kills,s.errors,s.attempts):'#484f58'}}>{s.attempts>0?n3(hp):'—'}</b><span className="lv-fs-a">{a}</span></span></span>;
        return <span key={i}>{dot}<span className="lv-fs-p"><b>{v}</b><span className="lv-fs-a">{a}</span></span></span>;
      })}
    </span>
  );
}

export default function LiveGame({ team, gameInfo, onEndMatch, onAbandon, resumeSession }) {
  const { roster, bestOf } = gameInfo;
  const setsToWin = bestOf === 3 ? 2 : 3;
  const rs = resumeSession;
  const [homeScore, setHomeScore] = useState(rs?rs.home_score:0);
  const [awayScore, setAwayScore] = useState(rs?rs.away_score:0);
  const [currentSet, setCurrentSet] = useState(rs?rs.current_set:1);
  const [homeSetsWon, setHomeSetsWon] = useState(rs?rs.home_sets:0);
  const [awaySetsWon, setAwaySetsWon] = useState(rs?rs.away_sets:0);
  const [sets, setSets] = useState(rs?(rs.set_history||[]):[]);
  const [stats, setStats] = useState(() => initStats(rs, roster));
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [view, setView] = useState('track');
  const [statsView, setStatsView] = useState('all'); // 'all' | 1 | 2 | 3 ...
  const [history, setHistory] = useState(rs?(rs.history||[]):[]);
  const [lastAction, setLastAction] = useState('');
  const [flashKey, setFlashKey] = useState(0);
  const [flashId, setFlashId] = useState(null);
  const [showSetOver, setShowSetOver] = useState(false);
  const [showMatchOver, setShowMatchOver] = useState(false);
  const [pendingSet, setPendingSet] = useState(null);
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [removeIdx, setRemoveIdx] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.();
  };
  const isDeuce = homeScore>=(currentSet===bestOf?14:24)&&awayScore>=(currentSet===bestOf?14:24)&&homeScore>0;

  const saveTimer=useRef(null);
  const triggerSave=useCallback(()=>{if(saveTimer.current)clearTimeout(saveTimer.current);saveTimer.current=setTimeout(()=>{saveSession(team.id,{opponent:gameInfo.opponent,bestOf:gameInfo.bestOf,currentSet,homeScore,awayScore,homeSetsWon,awaySetsWon,sets,stats,lineup:roster.map(p=>({id:p.id,name:p.name,jersey_number:p.jersey_number,position:p.position,colors:p.colors,player_index:p.player_index,initials:p.initials})),isLeague:gameInfo.isLeague,leagueTeamId:gameInfo.leagueTeamId,scheduledGameId:gameInfo.scheduledGameId,gameDate:gameInfo.gameDate,location:gameInfo.location,history});},300);},[team.id,gameInfo,currentSet,homeScore,awayScore,homeSetsWon,awaySetsWon,sets,stats,roster,history]);
  useEffect(()=>{triggerSave();return()=>{if(saveTimer.current)clearTimeout(saveTimer.current);};},[triggerSave]);

  function isSetDone(hs,as){const t=currentSet>=bestOf?15:25;return(hs>=t||as>=t)&&Math.abs(hs-as)>=2;}
  function pushHistory(e){setHistory(p=>[...p,e]);}
  function addPoint(side){const nh=side==='home'?homeScore+1:homeScore,na=side==='away'?awayScore+1:awayScore;pushHistory({type:'point',homeScore,awayScore,currentSet,homeSetsWon,awaySetsWon});setHomeScore(nh);setAwayScore(na);if(isSetDone(nh,na)){const hw=nh>na,nhs=homeSetsWon+(hw?1:0),nas=awaySetsWon+(hw?0:1);setPendingSet({home:nh,away:na,nhs,nas});if(nhs>=setsToWin||nas>=setsToWin){finishSet(nh,na,nhs,nas);}else{setShowSetOver(true);}}}
  function subPoint(side){if(side==='home'&&homeScore>0){pushHistory({type:'point',homeScore,awayScore,currentSet,homeSetsWon,awaySetsWon});setHomeScore(homeScore-1);}if(side==='away'&&awayScore>0){pushHistory({type:'point',homeScore,awayScore,currentSet,homeSetsWon,awaySetsWon});setAwayScore(awayScore-1);}}
  function confirmEndSet(){if(!pendingSet)return;finishSet(pendingSet.home,pendingSet.away,pendingSet.nhs,pendingSet.nas);setPendingSet(null);setShowSetOver(false);}
  function keepPlaying(){setPendingSet(null);setShowSetOver(false);}
  function manualEndSet(){if(homeScore===0&&awayScore===0)return;if(homeScore===awayScore)return;const hw=homeScore>awayScore;finishSet(homeScore,awayScore,homeSetsWon+(hw?1:0),awaySetsWon+(hw?0:1));}

  function finishSet(hs, as, nhs, nas) {
    setSets(p => [...p, { home: hs, away: as }]);
    setHomeSetsWon(nhs);
    setAwaySetsWon(nas);
    setStats(prev => {
      const n = { ...prev };
      roster.forEach(p => {
        n[p.id] = {
          ...n[p.id],
          overall: { ...n[p.id].overall, sets_played: (n[p.id].overall.sets_played || 0) + 1 },
        };
      });
      return n;
    });
    if (nhs >= setsToWin || nas >= setsToWin) {
      setShowMatchOver(true);
    } else {
      setCurrentSet(c => c + 1);
      setHomeScore(0);
      setAwayScore(0);
      setHistory([]);
    }
  }

  function recordAction(action) {
    if (!selectedPlayer) return;
    const player = roster.find(p => p.id === selectedPlayer);
    const ps = stats[selectedPlayer];
    pushHistory({
      type: 'stat',
      playerId: selectedPlayer,
      playerName: player?.name || '?',
      setNum: currentSet,
      actionKey: action.key,
      actionAbbr: action.abbr,
      actionLabel: action.label,
      actionStat: action.stat,
      actionAutoAtt: !!action.autoAtt,
      actionErr: !!action.err,
      prevOverall: { ...ps.overall },
      prevSetStats: { ...(ps.sets[currentSet] || EMPTY_SET_STATS()) },
    });
    setStats(prev => {
      const cur = prev[selectedPlayer];
      const newOverall = { ...cur.overall };
      newOverall[action.stat] = (newOverall[action.stat] || 0) + 1;
      if (action.autoAtt) newOverall.attempts = (newOverall.attempts || 0) + 1;
      const newSet = { ...(cur.sets[currentSet] || EMPTY_SET_STATS()) };
      newSet[action.stat] = (newSet[action.stat] || 0) + 1;
      if (action.autoAtt) newSet.attempts = (newSet.attempts || 0) + 1;
      return {
        ...prev,
        [selectedPlayer]: { ...cur, overall: newOverall, sets: { ...cur.sets, [currentSet]: newSet } },
      };
    });
    setLastAction(`${player?.name?.split(' ')[0] || '?'} → ${action.label}`);
    setFlashId(action.key);
    setFlashKey(k => k + 1);
  }

  function handleUndo() {
    if (!history.length) return;
    const last = history[history.length - 1];
    if (last.type === 'point') {
      setHomeScore(last.homeScore);
      setAwayScore(last.awayScore);
      setCurrentSet(last.currentSet);
      setHomeSetsWon(last.homeSetsWon);
      setAwaySetsWon(last.awaySetsWon);
    } else if (last.type === 'stat') {
      setStats(prev => ({
        ...prev,
        [last.playerId]: {
          ...prev[last.playerId],
          overall: last.prevOverall,
          sets: { ...prev[last.playerId].sets, [last.setNum]: last.prevSetStats },
        },
      }));
    }
    setHistory(prev => prev.slice(0, -1));
    setLastAction('(undone)');
  }

  function removeAction(idx) {
    const entry = history[idx];
    if (!entry || entry.type !== 'stat') return;
    setStats(prev => {
      const cur = prev[entry.playerId];
      if (!cur) return prev;
      const newOverall = { ...cur.overall };
      newOverall[entry.actionStat] = Math.max(0, (newOverall[entry.actionStat] || 0) - 1);
      if (entry.actionAutoAtt) newOverall.attempts = Math.max(0, (newOverall.attempts || 0) - 1);
      const curSet = cur.sets[entry.setNum] || EMPTY_SET_STATS();
      const newSet = { ...curSet };
      newSet[entry.actionStat] = Math.max(0, (newSet[entry.actionStat] || 0) - 1);
      if (entry.actionAutoAtt) newSet.attempts = Math.max(0, (newSet.attempts || 0) - 1);
      return { ...prev, [entry.playerId]: { ...cur, overall: newOverall, sets: { ...cur.sets, [entry.setNum]: newSet } } };
    });
    setHistory(prev => prev.filter((_, i) => i !== idx));
    setLastAction(`Removed: ${entry.playerName?.split(' ')[0] || '?'} → ${entry.actionLabel}`);
  }

  function handleMatchConfirm() {
    // Flatten to overall stats for DB save
    const flatStats = {};
    Object.entries(stats).forEach(([pid, ps]) => { flatStats[pid] = { ...ps.overall }; });
    onEndMatch({ homeSetsWon, awaySetsWon, sets, result: homeSetsWon > awaySetsWon ? 'W' : 'L', stats: flatStats });
  }

  async function handleAbandon(){await abandonSession(team.id);setShowAbandonConfirm(false);if(onAbandon)onAbandon();}

  const selPlayer = roster.find(p => p.id === selectedPlayer);
  const selStats = selectedPlayer ? stats[selectedPlayer]?.overall : null;
  const sortedRoster = sortByJersey(roster);

  // Stats table helper: returns the right stat object for a player based on statsView
  function getViewStats(playerId) {
    const ps = stats[playerId];
    if (statsView === 'all') return ps.overall;
    return ps.sets[statsView] || EMPTY_SET_STATS();
  }

  return (
    <div className="lv">
      {/* ═══ TOP BAR ═══ */}
      <div className="lv-top">
        <div className="lv-sb">
          <div className="lv-sb-row1">
            <button className="lv-sb-pill lv-sb-pill-abandon" onClick={()=>setShowAbandonConfirm(true)} title="Abandon game" aria-label="Abandon game">✕</button>
            <button className="lv-sb-pill" onClick={handleUndo} disabled={!history.length}>↩</button>
            <button className="lv-sb-pill" onClick={()=>setShowHistory(true)} title="Action history" aria-label="Action history">🕐</button>
            <div className="lv-sb-set">SET {currentSet}</div>
            <div className="lv-sb-tabs">
              <button className={`lv-sb-tabtn ${view==='track'?'on':''}`} onClick={()=>setView('track')}>Live</button>
              <button className={`lv-sb-tabtn ${view==='stats'?'on':''}`} onClick={()=>setView('stats')}>Stats</button>
            </div>
            <button className="lv-sb-pill lv-sb-pill-fs" onClick={toggleFullscreen} title={isFullscreen?'Exit fullscreen':'Enter fullscreen'} aria-label="Toggle fullscreen">{isFullscreen?'🗗':'🗖'}</button>
            <button className="lv-sb-pill lv-sb-pill-end" onClick={manualEndSet} disabled={homeScore===0&&awayScore===0}>End Set</button>
          </div>
          <div className="lv-sb-scores">
            <div className="lv-sb-team">
              <div className="lv-sb-label">{team.name}</div>
              <div className="lv-sb-btns"><button className="lv-sb-b lv-sb-b-m" onClick={()=>subPoint('home')}>−</button><div className="lv-sb-score">{homeScore}</div><button className="lv-sb-b lv-sb-b-p" onClick={()=>addPoint('home')}>+</button></div>
            </div>
            <div className="lv-sb-center"><div className="lv-sb-setw">{homeSetsWon}–{awaySetsWon}</div></div>
            <div className="lv-sb-team lv-sb-opp">
              <div className="lv-sb-label">{gameInfo.opponent}</div>
              <div className="lv-sb-btns"><button className="lv-sb-b lv-sb-b-m" onClick={()=>subPoint('away')}>−</button><div className="lv-sb-score">{awayScore}</div><button className="lv-sb-b lv-sb-b-p" onClick={()=>addPoint('away')}>+</button></div>
            </div>
          </div>
          {(sets.length>0||isDeuce) && <div className="lv-sb-foot">{sets.map((s,i)=><span key={i} className="lv-sb-chip">S{i+1}: {s.home}–{s.away}</span>)}{isDeuce&&<span className="lv-sb-deuce">DEUCE</span>}</div>}
        </div>
        {lastAction && <div className="lv-lastbar">{lastAction}</div>}
      </div>

      {/* ═══ BODY ═══ */}
      {view==='track' ? (
        <div className="lv-split">
          {/* LEFT SIDEBAR */}
          <div className="lv-left">
            {sortedRoster.map((p) => {
              const sel = p.id === selectedPlayer;
              const s = stats[p.id].overall;
              return (
                <button key={p.id} className={`lv-plr ${sel?'lv-plr-sel':''}`} onMouseDown={e=>e.preventDefault()} onClick={e=>{e.preventDefault();e.stopPropagation();setSelectedPlayer(sel?null:p.id);}}>
                  {p.jersey_number && <span className="lv-plr-num">#{p.jersey_number}</span>}
                  <span className="lv-plr-name">{p.name}</span>
                  <span className="lv-plr-stats"><MiniStats s={s} /></span>
                </button>
              );
            })}
          </div>

          {/* RIGHT PANEL */}
          <div className="lv-right">
            {selPlayer && selStats ? (
              <>
                {/* Compact stat row */}
                <div className="lv-sr">
                  <span className="lv-sr-name">{selPlayer.name}</span>
                  <span className="lv-sr-line"><FullStats s={selStats} /></span>
                </div>
                {/* Action buttons — category grid */}
                <div className="lv-btns">
                  {CATEGORIES.map(cat => (
                    <div key={cat.label} className="lv-btns-cat">
                      <div className="lv-btns-cat-label">{cat.label}</div>
                      <div className="lv-btns-row">
                        {cat.actions.map(a => (
                          <ActBtn key={a.key} a={a} err={a.err} fid={flashId} fk={flashKey} onClick={()=>recordAction(a)} count={selStats[a.stat]||0} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="lv-empty"><span className="lv-empty-arrow">←</span> Select a player</div>
            )}
          </div>
        </div>
      ) : (
        <div className="lv-st-wrap">
          {/* Set toggle segmented control */}
          <div className="lv-set-toggle">
            <button className={`lv-set-btn${statsView==='all'?' on':''}`} onClick={()=>setStatsView('all')}>ALL</button>
            {Array.from({length:currentSet},(_,i)=>i+1).map(n=>(
              <button key={n} className={`lv-set-btn${statsView===n?' on':''}`} onClick={()=>setStatsView(n)}>S{n}</button>
            ))}
          </div>
          <table className="lv-st">
            <thead>
              <tr><th className="lv-st-l">#</th><th className="lv-st-l">Name</th><th>K</th><th>E</th><th>TA</th><th>K%</th><th>A</th><th>BHE</th><th>SA</th><th>SE</th><th>R</th><th>D</th><th>DE</th><th>BS</th><th>BA</th><th>BE</th></tr>
            </thead>
            <tbody>
              {sortedRoster.map(p => {
                const s = getViewStats(p.id);
                const hp = hpct(s.kills, s.errors, s.attempts);
                return (
                  <tr key={p.id}>
                    <td className="lv-st-l" style={{color:'#484f58'}}>{p.jersey_number||'—'}</td>
                    <td className="lv-st-l lv-st-n">{p.name}</td>
                    <td>{s.kills}</td>
                    <td style={{color:s.errors>0?'#f85149':'inherit'}}>{s.errors}</td>
                    <td>{s.attempts}</td>
                    <td style={{color:hcol(s.kills,s.errors,s.attempts),fontWeight:700}}>{s.attempts>0?n3(hp):'—'}</td>
                    <td>{s.assists}</td>
                    <td style={{color:(s.ball_handling_errors||0)>0?'#f85149':'inherit'}}>{s.ball_handling_errors||0}</td>
                    <td>{s.aces}</td>
                    <td style={{color:s.serve_errors>0?'#f85149':'inherit'}}>{s.serve_errors}</td>
                    <td>{s.receives||0}</td>
                    <td>{s.digs}</td>
                    <td style={{color:(s.digging_errors||0)>0?'#f85149':'inherit'}}>{s.digging_errors||0}</td>
                    <td>{s.blocks}</td>
                    <td>{s.block_assists}</td>
                    <td style={{color:(s.blocking_errors||0)>0?'#f85149':'inherit'}}>{s.blocking_errors||0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {showSetOver&&pendingSet&&(<div className="modal-overlay"><div className="modal-content" style={{textAlign:'center'}}><h2>Set {currentSet} Over!</h2><div style={{fontSize:40,fontWeight:900,margin:'12px 0',color:'var(--text)',fontFamily:'var(--mono)'}}>{pendingSet.home} – {pendingSet.away}</div><div style={{fontSize:13,color:'var(--text-secondary)',marginBottom:20}}>Sets: {pendingSet.nhs} – {pendingSet.nas}</div><div style={{display:'flex',gap:12,justifyContent:'center'}}><button className="modal-btn-cancel" onClick={keepPlaying}>Keep Playing</button><button className="modal-btn-primary" onClick={confirmEndSet}>End Set</button></div></div></div>)}
      {showMatchOver&&(<div className="modal-overlay"><div className="modal-content" style={{textAlign:'center'}}><h2>Match Over!</h2><div style={{fontSize:52,fontWeight:900,margin:'12px 0',color:'var(--text)',fontFamily:'var(--mono)'}}>{homeSetsWon} – {awaySetsWon}</div><div style={{fontSize:18,fontWeight:700,marginBottom:16,color:homeSetsWon>awaySetsWon?'#3fb950':'#f85149'}}>{homeSetsWon>awaySetsWon?'Victory!':'Defeat'}</div>{sets.map((s,i)=><div key={i} style={{fontSize:13,color:'var(--text-secondary)',marginBottom:4,fontFamily:'var(--mono)'}}>Set {i+1}: {s.home}–{s.away}</div>)}<button className="modal-btn-primary" onClick={handleMatchConfirm} style={{marginTop:20,width:'100%',padding:14,fontSize:16}}>Save &amp; Finish</button></div></div>)}
      {showHistory && (
        <div className="lv-hist-ov" onClick={()=>setShowHistory(false)}>
          <div className="lv-hist" onClick={e=>e.stopPropagation()}>
            <div className="lv-hist-hd">
              <span>Action History</span>
              <button className="lv-hist-x" onClick={()=>setShowHistory(false)} aria-label="Close">✕</button>
            </div>
            <div className="lv-hist-body">
              {history.filter(h=>h.type==='stat').length === 0 ? (
                <div className="lv-hist-empty">No actions logged yet</div>
              ) : (
                history.map((h, i) => ({h, i})).filter(({h})=>h.type==='stat').reverse().map(({h, i}) => (
                  <div key={i} className={`lv-hist-row ${h.actionErr?'lv-hist-err':'lv-hist-ok'}`}>
                    <span className="lv-hist-set">S{h.setNum}</span>
                    <span className="lv-hist-name">{h.playerName}</span>
                    <span className="lv-hist-stat"><b>{h.actionAbbr}</b> — {h.actionLabel}</span>
                    <button className="lv-hist-del" onClick={()=>setRemoveIdx(i)} aria-label="Remove">✕</button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {removeIdx !== null && (
        <div className="modal-overlay" onClick={()=>setRemoveIdx(null)}>
          <div className="modal-content" style={{ textAlign: 'center', maxWidth: 360 }} onClick={e=>e.stopPropagation()}>
            <h2 style={{marginBottom:8}}>Remove this stat?</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 18 }}>
              {history[removeIdx]?.playerName} → {history[removeIdx]?.actionLabel}
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                onClick={()=>setRemoveIdx(null)}
                style={{ background: 'transparent', color: 'var(--text-secondary)', padding: '10px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600, border: '1px solid var(--border)', cursor: 'pointer' }}
              >No</button>
              <button
                onClick={()=>{removeAction(removeIdx); setRemoveIdx(null);}}
                style={{ background: '#f85149', color: '#fff', padding: '10px 20px', borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}
              >Yes, Remove</button>
            </div>
          </div>
        </div>
      )}
      {showAbandonConfirm && (
        <div className="modal-overlay" onClick={()=>setShowAbandonConfirm(false)}>
          <div className="modal-content" style={{ textAlign: 'center', maxWidth: 420 }} onClick={e=>e.stopPropagation()}>
            <h2>Abandon Game?</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>
              All tracked stats will be deleted and this session will be removed. This cannot be undone.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={handleAbandon}
                style={{ background: '#f85149', color: '#fff', padding: '12px 16px', borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer' }}
              >
                Yes, Abandon Game
              </button>
              <button
                onClick={()=>setShowAbandonConfirm(false)}
                style={{ background: 'transparent', color: 'var(--text-secondary)', padding: '12px 16px', borderRadius: 10, fontSize: 14, fontWeight: 600, border: '1px solid var(--border)', cursor: 'pointer' }}
              >
                Keep Tracking
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActBtn({ a, err, fid, fk, onClick, count = 0 }) {
  const [fl,setFl]=useState(false); const pk=useRef(fk);
  useEffect(()=>{if(fk!==pk.current&&fid===a.key){setFl(true);const t=setTimeout(()=>setFl(false),150);pk.current=fk;return()=>clearTimeout(t);}pk.current=fk;},[fk,fid,a.key]);
  const flClass = fl ? (err ? 'lv-ab-fl-err' : 'lv-ab-fl-ok') : '';
  return (
    <button className={`lv-ab ${err?'lv-ab-err':'lv-ab-ok'} ${flClass}`} onClick={onClick}>
      {count > 0 && <span className={`lv-ab-badge ${err?'lv-ab-badge-err':''}`}>{count}</span>}
      <span className="lv-ab-a">{a.abbr}</span>
      <span className="lv-ab-l">{a.label}</span>
    </button>
  );
}
