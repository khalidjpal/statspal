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
    setLoading(true);
    const [
      { data: t },
      { data: p },
      { data: s },
      { data: cg },
      { data: pgs },
      { data: lt },
      { data: lr },
      { data: acc },
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
    setTeams(t || []);
    setPlayers(p || []);
    setSchedule(s || []);
    setCompletedGames(cg || []);
    setPlayerGameStats(pgs || []);
    setLeagueTeams(lt || []);
    setLeagueResults(lr || []);
    setAccounts(acc || []);
    setLoading(false);
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
