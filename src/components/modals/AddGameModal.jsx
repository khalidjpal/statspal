import { useState, useEffect } from 'react';
import { supabase } from '../../supabase';

export default function AddGameModal({ teamId, leagueTeams, onClose, onSaved }) {
  const [opponent, setOpponent] = useState('');
  const [gameDate, setGameDate] = useState('');
  const [location, setLocation] = useState('Home');
  const [isLeague, setIsLeague] = useState(false);
  const [leagueTeamId, setLeagueTeamId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Filter league teams to only non-"us" opponents
  const opponentTeams = (leagueTeams || []).filter(lt => !lt.is_us);

  // When league team selected, auto-fill opponent name
  useEffect(() => {
    if (isLeague && leagueTeamId) {
      const lt = opponentTeams.find(t => t.id === leagueTeamId);
      if (lt) setOpponent(lt.name);
    }
  }, [leagueTeamId, isLeague]);

  async function handleSave() {
    if (!opponent.trim() || !gameDate) return;
    setSaving(true);
    setError('');

    // Build insert payload — base fields first
    const payload = {
      team_id: teamId,
      opponent: opponent.trim(),
      game_date: gameDate,
      location,
    };

    // Try with league fields first
    if (isLeague) {
      payload.is_league = true;
      payload.league_team_id = leagueTeamId || null;
    } else {
      payload.is_league = false;
      payload.league_team_id = null;
    }

    let { error: err } = await supabase.from('schedule').insert(payload);

    // If it failed (possibly because league columns don't exist), retry without them
    if (err) {
      console.warn('Insert with league fields failed, retrying without:', err.message);
      const fallback = {
        team_id: teamId,
        opponent: opponent.trim(),
        game_date: gameDate,
        location,
      };
      const { error: err2 } = await supabase.from('schedule').insert(fallback);
      if (err2) {
        console.error('Schedule insert failed:', err2);
        setError(err2.message || 'Failed to save game');
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    onSaved();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>Add Game</h2>

        {error && <div className="login-error" style={{ marginBottom: 12 }}>{error}</div>}

        {/* League toggle */}
        {opponentTeams.length > 0 && (
          <>
            <label>Game Type</label>
            <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderRadius: 8, overflow: 'hidden', border: '1px solid #e4e6ea' }}>
              <button
                type="button"
                onClick={() => { setIsLeague(false); setLeagueTeamId(''); }}
                style={{ flex: 1, padding: 10, fontSize: 13, fontWeight: 600, background: !isLeague ? '#1a3a8f' : '#fff', color: !isLeague ? '#fff' : '#555', border: 'none', cursor: 'pointer' }}
              >
                Non-League
              </button>
              <button
                type="button"
                onClick={() => setIsLeague(true)}
                style={{ flex: 1, padding: 10, fontSize: 13, fontWeight: 600, background: isLeague ? '#1a3a8f' : '#fff', color: isLeague ? '#fff' : '#555', border: 'none', cursor: 'pointer' }}
              >
                League Game
              </button>
            </div>
          </>
        )}

        {isLeague && opponentTeams.length > 0 && (
          <>
            <label>League Opponent</label>
            <select value={leagueTeamId} onChange={e => setLeagueTeamId(e.target.value)}>
              <option value="">Select league team...</option>
              {opponentTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </>
        )}

        <label>Opponent *</label>
        <input
          value={opponent}
          onChange={e => setOpponent(e.target.value)}
          placeholder="Team name"
        />

        <label>Date *</label>
        <input
          type="date"
          value={gameDate}
          onChange={e => setGameDate(e.target.value)}
        />

        <label>Location</label>
        <select value={location} onChange={e => setLocation(e.target.value)}>
          <option>Home</option>
          <option>Away</option>
          <option>Neutral</option>
        </select>

        <div className="modal-actions">
          <button className="modal-btn-cancel" type="button" onClick={onClose}>Cancel</button>
          <button
            className="modal-btn-primary"
            type="button"
            onClick={handleSave}
            disabled={saving || !opponent.trim() || !gameDate}
          >
            {saving ? 'Saving...' : 'Add Game'}
          </button>
        </div>
      </div>
    </div>
  );
}
