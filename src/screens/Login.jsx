import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const ROLES = ['admin', 'coach', 'player'];

export default function Login({ onGodMode }) {
  const { login, loading, error, setError } = useAuth();
  const [role, setRole] = useState('admin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please enter username and password');
      return;
    }
    await login(username.trim(), password.trim());
  }

  return (
    <div className="login-container">
      <div className="login-logo">🏐</div>
      <div className="login-title">StatsPal</div>
      <div className="login-subtitle">West HS Volleyball</div>

      <div className="login-card">
        <h2>Sign In</h2>

        <div className="login-role-tabs">
          {ROLES.map(r => (
            <button
              key={r}
              className={`login-role-tab ${role === r ? 'active' : ''}`}
              onClick={() => { setRole(r); setError(''); }}
            >
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <label>Username</label>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder={`Enter ${role} username`}
            autoComplete="username"
          />

          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter password"
            autoComplete="current-password"
          />

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>

      <button className="login-god-btn" onClick={onGodMode}>
        God Mode
      </button>
    </div>
  );
}
