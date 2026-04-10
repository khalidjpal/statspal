import StatInput from './StatInput';
import { hfmt } from '../utils/stats';

export default function PlayerStatsEntry({ player, stats, onUpdate, errorField, errorMessage }) {
  const s = stats || {};
  const set = (field) => (val) => onUpdate(player.id, field, val);
  const errOf = (field) => (errorField === field ? errorMessage : null);

  return (
    <div className="pse-card">
      <div className="pse-header">
        <span className="pse-jersey">{player.jersey_number ? `#${player.jersey_number}` : '—'}</span>
        <span className="pse-name">{player.name}</span>
      </div>

      <div className="pse-group">
        <div className="pse-group-label">SETS PLAYED</div>
        <div className="pse-group-row pse-sp-row">
          <StatInput label="Sets Played" value={s.sets_played || 0} onChange={set('sets_played')} size="lg" />
        </div>
      </div>

      <div className="pse-group">
        <div className="pse-group-label">ATTACK</div>
        <div className="pse-group-row">
          <StatInput label="K"  value={s.kills || 0}    onChange={set('kills')}    error={errOf('kills')} />
          <StatInput label="E"  value={s.errors || 0}   onChange={set('errors')}   error={errOf('errors')} />
          <StatInput label="TA" value={s.attempts || 0} onChange={set('attempts')} error={errOf('attempts')} />
          <div className="pse-kpct">
            <div className="stat-in-label">K%</div>
            <div className="pse-kpct-val">{hfmt(s.kills || 0, s.errors || 0, s.attempts || 0)}</div>
          </div>
        </div>
      </div>

      <div className="pse-group">
        <div className="pse-group-label">SET</div>
        <div className="pse-group-row">
          <StatInput label="A" value={s.assists || 0} onChange={set('assists')} />
        </div>
      </div>

      <div className="pse-group">
        <div className="pse-group-label">SERVE</div>
        <div className="pse-group-row">
          <StatInput label="SA" value={s.aces || 0}         onChange={set('aces')} />
          <StatInput label="SE" value={s.serve_errors || 0} onChange={set('serve_errors')} />
        </div>
      </div>

      <div className="pse-group">
        <div className="pse-group-label">DIG</div>
        <div className="pse-group-row">
          <StatInput label="D" value={s.digs || 0} onChange={set('digs')} />
        </div>
      </div>

      <div className="pse-group">
        <div className="pse-group-label">BLOCK</div>
        <div className="pse-group-row">
          <StatInput label="BS" value={s.blocks || 0}        onChange={set('blocks')} />
          <StatInput label="BA" value={s.block_assists || 0} onChange={set('block_assists')} />
        </div>
      </div>
    </div>
  );
}
