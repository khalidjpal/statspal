import { createContext, useContext, useState, useCallback } from 'react';
import { supabase } from '../supabase';

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [completedGames, setCompletedGames] = useState([]);
  const [playerGameStats, setPlayerGameStats] = useState([]);
  const [leagueTeams, setLeagueTeams] = useState([]);
  const [leagueResults, setLeagueResults] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    console.log('[DataContext] refresh() START');
    setLoading(true);
    const [
      { data: t, error: e1 },
      { data: p, error: e2 },
      { data: s, error: e3 },
      { data: cg, error: e4 },
      { data: pgs, error: e5 },
      { data: lt, error: e6 },
      { data: lr, error: e7 },
      { data: acc, error: e8 },
    ] = await Promise.all([
      supabase.from('teams').select('*').order('created_at'),
      supabase.from('players').select('*').order('player_index'),
      supabase.from('schedule').select('*').order('game_date'),
      supabase.from('completed_games').select('*').order('game_date', { ascending: false }),
      supabase.from('player_game_stats').select('*'),
      supabase.from('league_teams').select('*'),
      supabase.from('league_results').select('*').order('game_date'),
      supabase.from('accounts').select('*').order('created_at'),
    ]);
    if (e1) console.error('[DataContext] teams fetch error:', e1.message);
    if (e2) console.error('[DataContext] players fetch error:', e2.message);
    if (e3) console.error('[DataContext] schedule fetch error:', e3.message);
    if (e4) console.error('[DataContext] completed_games fetch error:', e4.message);
    if (e5) console.error('[DataContext] player_game_stats fetch error:', e5.message);
    if (e6) console.error('[DataContext] league_teams fetch error:', e6.message);
    if (e7) console.error('[DataContext] league_results fetch error:', e7.message);
    if (e8) console.error('[DataContext] accounts fetch error:', e8.message);
    console.log('[DataContext] refresh() fetched — teams:', (t||[]).length, 'players:', (p||[]).length, 'games:', (cg||[]).length, 'playerGameStats:', (pgs||[]).length);
    setTeams(t || []);
    setPlayers(p || []);
    setSchedule(s || []);
    setCompletedGames(cg || []);
    setPlayerGameStats(pgs || []);
    setLeagueTeams(lt || []);
    setLeagueResults(lr || []);
    setAccounts(acc || []);
    setLoading(false);
    console.log('[DataContext] refresh() DONE — state updated');
  }, []);

  return (
    <DataContext.Provider value={{
      teams, players, schedule, completedGames, playerGameStats,
      leagueTeams, leagueResults, accounts, loading, refresh,
      setTeams, setPlayers, setSchedule, setCompletedGames,
      setPlayerGameStats, setLeagueTeams, setLeagueResults, setAccounts,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
