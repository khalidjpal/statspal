import { createContext, useContext, useState, useCallback } from 'react';
import { supabase } from '../supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const login = useCallback(async (username, password) => {
    setLoading(true);
    setError('');
    try {
      const { data, error: err } = await supabase
        .from('accounts')
        .select('*, team:teams(*), player:players(*)')
        .eq('username', username)
        .eq('active', true)
        .single();

      if (err || !data) {
        setError('Invalid username or password');
        setLoading(false);
        return false;
      }

      // Check password against both possible columns
      const storedPassword = data.password_plain || data.password_hash;
      if (storedPassword !== password) {
        setError('Invalid username or password');
        setLoading(false);
        return false;
      }

      // For coaches, fetch all team assignments
      let teamIds = [];
      if (data.role === 'coach') {
        // Get assignments from coach_team_assignments table
        const { data: assignments } = await supabase
          .from('coach_team_assignments')
          .select('team_id')
          .eq('account_id', data.id);
        const assignedIds = (assignments || []).map(a => a.team_id);
        // Also include legacy accounts.team_id
        if (data.team_id && !assignedIds.includes(data.team_id)) {
          assignedIds.push(data.team_id);
        }
        teamIds = assignedIds;
      } else if (data.role === 'player' && data.team_id) {
        teamIds = [data.team_id];
      }

      setCurrentUser({ ...data, teamIds });
      setLoading(false);
      return true;
    } catch (e) {
      setError('Login failed');
      setLoading(false);
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    setCurrentUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, setCurrentUser, login, logout, loading, error, setError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
