import { useState, useRef, useEffect, useCallback } from 'react';
import { pColors, mkInit } from '../utils/colors';
import { hpct, n3, hcol } from '../utils/stats';
import { saveSession, abandonSession } from '../utils/liveSession';
import { sortByJersey } from '../utils/sort';

const GOOD = [
  { key:'kill', abbr:'K', label:'Kill', stat:'kills', autoAtt:true, big:true },
  { key:'assist', abbr:'A', label:'Assist', stat:'assists' },
  { key:'dig', abbr:'D', label:'Dig', stat:'digs' },
  { key:'ace', abbr:'SA', label:'Ace', stat:'aces' },
  { key:'block_solo', abbr:'BS', label:'Block', stat:'blocks' },
  { key:'block_assist', abbr:'BA', label:'Blk Ast', stat:'block_assists' },
  { key:'attempt', abbr:'Att', label:'Attempt', stat:'attempts' },
];
const ERR = [
  { key:'attack_error', abbr:'E', label:'Atk Err', stat:'errors', autoAtt:true },
  { key:'serve_error', abbr:'SE', label:'Srv Err', stat:'serve_errors' },
  { key:'recv_error', abbr:'RE', label:'Rcv Err', stat:'digs' },
];

// Compact stat line with dot separators, only non-zero
function MiniStats({ s }) {
  const hp = hpct(s.kills, s.errors, s.attempts);
  const pairs = [
    [s.kills,'K'],[s.errors,'E'],[s.attempts,'TA'],
    [s.assists,'A'],[s.aces,'SA'],[s.serve_errors,'SE'],
    [s.digs,'D'],[s.blocks,'BS'],[s.block_assists,'BA'],
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
  const [stats, setStats] = useState(()=>{if(rs?.player_stats&&Object.keys(rs.player_stats).length>0)return rs.player_stats;const o={};roster.forEach(p=>{o[p.id]={kills:0,aces:0,digs:0,assists:0,blocks:0,errors:0,attempts:0,sets_played:0,block_assists:0,serve_errors:0};});return o;});
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [view, setView] = useState('track');
  const [history, setHistory] = useState(rs?(rs.history||[]):[]);
  const [lastAction, setLastAction] = useState('');
  const [flashKey, setFlashKey] = useState(0);
  const [flashId, setFlashId] = useState(null);
  const [showSetOver, setShowSetOver] = useState(false);
  const [showMatchOver, setShowMatchOver] = useState(false);
  const [pendingSet, setPendingSet] = useState(null);
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
  const isDeuce = homeScore>=(currentSet===bestOf?14:24)&&awayScore>=(currentSet===bestOf?14:24)&&homeScore>0;

  const saveTimer=useRef(null);
  const triggerSave=useCallback(()=>{if(saveTimer.current)clearTimeout(saveTimer.current);saveTimer.current=setTimeout(()=>{saveSession(team.id,{opponent:gameInfo.opponent,bestOf:gameInfo.bestOf,currentSet,homeScore,awayScore,homeSetsWon,awaySetsWon,sets,stats,lineup:roster.map(p=>({id:p.id,name:p.name,jersey_number:p.jersey_number,position:p.position,colors:p.colors,player_index:p.player_index,initials:p.initials})),isLeague:gameInfo.isLeague,leagueTeamId:gameInfo.leagueTeamId,scheduledGameId:gameInfo.scheduledGameId,gameDate:gameInfo.gameDate,location:gameInfo.location,history});},300);},[team.id,gameInfo,currentSet,homeScore,awayScore,homeSetsWon,awaySetsWon,sets,stats,roster,history]);
  useEffect(()=>{triggerSave();return()=>{if(saveTimer.current)clearTimeout(saveTimer.current);};},[triggerSave]);

  function isSetDone(hs,as){const t=currentSet>=bestOf?15:25;return(hs>=t||as>=t)&&Math.abs(hs-as)>=2;}
  function pushHistory(e){setHistory(p=>[...p,e]);}
  function addPoint(side){const nh=side==='home'?homeScore+1:homeScore,na=side==='away'?awayScore+1:awayScore;pushHistory({type:'point',homeScore,awayScore,currentSet,homeSetsWon,awaySetsWon});setHomeScore(nh);setAwayScore(na);if(isSetDone(nh,na)){const hw=nh>na,nhs=homeSetsWon+(hw?1:0),nas=awaySetsWon+(hw?0:1);setPendingSet({home:nh,away:na,nhs,nas});if(nhs>=setsToWin||nas>=setsToWin){setSets(p=>[...p,{home:nh,away:na}]);setHomeSetsWon(nhs);setAwaySetsWon(nas);setShowMatchOver(true);}else{setShowSetOver(true);}}}
  function subPoint(side){if(side==='home'&&homeScore>0){pushHistory({type:'point',homeScore,awayScore,currentSet,homeSetsWon,awaySetsWon});setHomeScore(homeScore-1);}if(side==='away'&&awayScore>0){pushHistory({type:'point',homeScore,awayScore,currentSet,homeSetsWon,awaySetsWon});setAwayScore(awayScore-1);}}
  function confirmEndSet(){if(!pendingSet)return;finishSet(pendingSet.home,pendingSet.away,pendingSet.nhs,pendingSet.nas);setPendingSet(null);setShowSetOver(false);}
  function keepPlaying(){setPendingSet(null);setShowSetOver(false);}
  function manualEndSet(){if(homeScore===0&&awayScore===0)return;if(homeScore===awayScore)return;const hw=homeScore>awayScore;finishSet(homeScore,awayScore,homeSetsWon+(hw?1:0),awaySetsWon+(hw?0:1));}
  function finishSet(hs,as,nhs,nas){setSets(p=>[...p,{home:hs,away:as}]);setHomeSetsWon(nhs);setAwaySetsWon(nas);setStats(prev=>{const n={...prev};roster.forEach(p=>{n[p.id]={...n[p.id],sets_played:(n[p.id].sets_played||0)+1};});return n;});if(nhs>=setsToWin||nas>=setsToWin){setShowMatchOver(true);}else{setCurrentSet(c=>c+1);setHomeScore(0);setAwayScore(0);setHistory([]);}}
  function recordAction(action){if(!selectedPlayer)return;const player=roster.find(p=>p.id===selectedPlayer);pushHistory({type:'stat',playerId:selectedPlayer,prevStats:{...stats[selectedPlayer]}});setStats(prev=>{const ps={...prev[selectedPlayer]};ps[action.stat]=(ps[action.stat]||0)+1;if(action.autoAtt)ps.attempts=(ps.attempts||0)+1;return{...prev,[selectedPlayer]:ps};});setLastAction(`${player?.name?.split(' ')[0]||'?'} → ${action.label}`);setFlashId(action.key);setFlashKey(k=>k+1);}
  function handleUndo(){if(!history.length)return;const last=history[history.length-1];if(last.type==='point'){setHomeScore(last.homeScore);setAwayScore(last.awayScore);setCurrentSet(last.currentSet);setHomeSetsWon(last.homeSetsWon);setAwaySetsWon(last.awaySetsWon);}else if(last.type==='stat'){setStats(prev=>({...prev,[last.playerId]:last.prevStats}));}setHistory(prev=>prev.slice(0,-1));setLastAction('(undone)');}
  function handleMatchConfirm(){onEndMatch({homeSetsWon,awaySetsWon,sets,result:homeSetsWon>awaySetsWon?'W':'L',stats:{...stats}});}
  async function handleAbandon(){await abandonSession(team.id);setShowAbandonConfirm(false);if(onAbandon)onAbandon();}

  const selPlayer=roster.find(p=>p.id===selectedPlayer);
  const selStats=selectedPlayer?stats[selectedPlayer]:null;
  const sortedRoster=sortByJersey(roster);

  return (
    <div className="lv">
      {/* ═══ TOP BAR ═══ */}
      <div className="lv-top">
        <div className="lv-sb">
          <div className="lv-sb-row1">
            <button className="lv-sb-pill lv-sb-pill-abandon" onClick={()=>setShowAbandonConfirm(true)} title="Abandon game" aria-label="Abandon game">✕</button>
            <button className="lv-sb-pill" onClick={handleUndo} disabled={!history.length}>↩</button>
            <div className="lv-sb-set">SET {currentSet}</div>
            <div className="lv-sb-tabs">
              <button className={`lv-sb-tabtn ${view==='track'?'on':''}`} onClick={()=>setView('track')}>Live</button>
              <button className={`lv-sb-tabtn ${view==='stats'?'on':''}`} onClick={()=>setView('stats')}>Stats</button>
            </div>
            <button className="lv-sb-pill lv-sb-pill-end" onClick={manualEndSet} disabled={homeScore===0&&awayScore===0}>End Set</button>
          </div>
          <div className="lv-sb-scores">
            <div className="lv-sb-team">
              <div className="lv-sb-label">{team.name}</div>
              <div className="lv-sb-score">{homeScore}</div>
              <div className="lv-sb-btns"><button className="lv-sb-b lv-sb-b-m" onClick={()=>subPoint('home')}>−</button><button className="lv-sb-b lv-sb-b-p" onClick={()=>addPoint('home')}>+</button></div>
            </div>
            <div className="lv-sb-center"><div className="lv-sb-setw">{homeSetsWon}–{awaySetsWon}</div></div>
            <div className="lv-sb-team lv-sb-opp">
              <div className="lv-sb-label">{gameInfo.opponent}</div>
              <div className="lv-sb-score">{awayScore}</div>
              <div className="lv-sb-btns"><button className="lv-sb-b lv-sb-b-m" onClick={()=>subPoint('away')}>−</button><button className="lv-sb-b lv-sb-b-p" onClick={()=>addPoint('away')}>+</button></div>
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
              const s = stats[p.id];
              return (
                <button key={p.id} className={`lv-plr ${sel?'lv-plr-sel':''}`} onClick={()=>setSelectedPlayer(sel?null:p.id)}>
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
                {/* Action buttons fill remaining space */}
                <div className="lv-btns">
                  <div className="lv-btns-label lv-btns-ok-l">POSITIVE</div>
                  <div className="lv-btns-row">
                    {GOOD.map(a=><ActBtn key={a.key} a={a} err={false} fid={flashId} fk={flashKey} onClick={()=>recordAction(a)} count={selStats[a.stat]||0} />)}
                  </div>
                  <div className="lv-btns-label lv-btns-err-l">ERROR</div>
                  <div className="lv-btns-row">
                    {ERR.map(a=><ActBtn key={a.key} a={a} err={true} fid={flashId} fk={flashKey} onClick={()=>recordAction(a)} count={selStats[a.stat]||0} />)}
                  </div>
                </div>
              </>
            ) : (
              <div className="lv-empty"><span className="lv-empty-arrow">←</span> Select a player</div>
            )}
          </div>
        </div>
      ) : (
        <div className="lv-st-wrap"><table className="lv-st"><thead><tr><th className="lv-st-l">#</th><th className="lv-st-l">Name</th><th>K</th><th>E</th><th>TA</th><th>K%</th><th>A</th><th>SA</th><th>SE</th><th>D</th><th>BS</th><th>BA</th></tr></thead><tbody>
          {sortedRoster.map(p=>{const s=stats[p.id];const hp=hpct(s.kills,s.errors,s.attempts);return(<tr key={p.id}><td className="lv-st-l" style={{color:'#484f58'}}>{p.jersey_number||'—'}</td><td className="lv-st-l lv-st-n">{p.name}</td><td>{s.kills}</td><td style={{color:s.errors>0?'#f85149':'inherit'}}>{s.errors}</td><td>{s.attempts}</td><td style={{color:hcol(s.kills,s.errors,s.attempts),fontWeight:700}}>{s.attempts>0?n3(hp):'—'}</td><td>{s.assists}</td><td>{s.aces}</td><td style={{color:s.serve_errors>0?'#f85149':'inherit'}}>{s.serve_errors}</td><td>{s.digs}</td><td>{s.blocks}</td><td>{s.block_assists}</td></tr>);})}
        </tbody></table></div>
      )}

      {/* Modals */}
      {showSetOver&&pendingSet&&(<div className="modal-overlay"><div className="modal-content" style={{textAlign:'center'}}><h2>Set {currentSet} Over!</h2><div style={{fontSize:40,fontWeight:900,margin:'12px 0',color:'var(--text)',fontFamily:'var(--mono)'}}>{pendingSet.home} – {pendingSet.away}</div><div style={{fontSize:13,color:'var(--text-secondary)',marginBottom:20}}>Sets: {pendingSet.nhs} – {pendingSet.nas}</div><div style={{display:'flex',gap:12,justifyContent:'center'}}><button className="modal-btn-cancel" onClick={keepPlaying}>Keep Playing</button><button className="modal-btn-primary" onClick={confirmEndSet}>End Set</button></div></div></div>)}
      {showMatchOver&&(<div className="modal-overlay"><div className="modal-content" style={{textAlign:'center'}}><h2>Match Over!</h2><div style={{fontSize:52,fontWeight:900,margin:'12px 0',color:'var(--text)',fontFamily:'var(--mono)'}}>{homeSetsWon} – {awaySetsWon}</div><div style={{fontSize:18,fontWeight:700,marginBottom:16,color:homeSetsWon>awaySetsWon?'#3fb950':'#f85149'}}>{homeSetsWon>awaySetsWon?'Victory!':'Defeat'}</div>{sets.map((s,i)=><div key={i} style={{fontSize:13,color:'var(--text-secondary)',marginBottom:4,fontFamily:'var(--mono)'}}>Set {i+1}: {s.home}–{s.away}</div>)}<button className="modal-btn-primary" onClick={handleMatchConfirm} style={{marginTop:20,width:'100%',padding:14,fontSize:16}}>Save &amp; Finish</button></div></div>)}
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
  return (
    <button className={`lv-ab ${err?'lv-ab-err':'lv-ab-ok'} ${a.big?'lv-ab-big':''} ${fl?'lv-ab-fl':''}`} onClick={onClick}>
      {count > 0 && <span className={`lv-ab-badge ${err?'lv-ab-badge-err':''}`}>{count}</span>}
      <span className="lv-ab-a">{a.abbr}</span>
      <span className="lv-ab-l">{a.label}</span>
    </button>
  );
}
