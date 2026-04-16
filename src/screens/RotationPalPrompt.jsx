import { useState } from 'react';
import { IconLink } from '../components/Icons';

// Small quick-confirm shown when entering RotationPal and at least one team is
// linked. Picks a roster or drops into standalone mode.
//
// Props:
//   linkedTeams — array of { id, name, color? } sorted by relevance
//   onConfirm({ mode: 'linked'|'standalone', teamId? })
//   onCancel()
export default function RotationPalPrompt({ linkedTeams, onConfirm, onCancel }) {
  const [choice, setChoice] = useState(linkedTeams[0]?.id || null);

  const only = linkedTeams.length === 1 ? linkedTeams[0] : null;

  return (
    <div className="vp-prompt-backdrop" onClick={onCancel}>
      <div className="vp-prompt" onClick={e => e.stopPropagation()}>
        <div className="vp-prompt-icon">
          <IconLink size={28} />
        </div>
        {only ? (
          <>
            <h2 className="vp-prompt-title">
              Use <span className="vp-prompt-team">{only.name}</span> roster?
            </h2>
            <p className="vp-prompt-sub">
              RotationPal will pull players straight from StatsPal.
            </p>
            <div className="vp-prompt-actions">
              <button
                className="vp-prompt-btn vp-prompt-no"
                onClick={() => onConfirm({ mode: 'standalone' })}
              >
                No, standalone
              </button>
              <button
                className="vp-prompt-btn vp-prompt-yes"
                onClick={() => onConfirm({ mode: 'linked', teamId: only.id })}
              >
                Yes, use roster
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="vp-prompt-title">Which linked team?</h2>
            <p className="vp-prompt-sub">
              Pick the team RotationPal should share a roster with, or skip to run standalone.
            </p>
            <div className="vp-prompt-choices">
              {linkedTeams.map(t => (
                <label key={t.id} className={`vp-prompt-choice ${choice === t.id ? 'on' : ''}`}>
                  <input
                    type="radio"
                    name="linked-team"
                    checked={choice === t.id}
                    onChange={() => setChoice(t.id)}
                  />
                  <span
                    className="vp-prompt-choice-dot"
                    style={{ background: t.color || '#3fb950' }}
                  />
                  <span className="vp-prompt-choice-name">{t.name}</span>
                </label>
              ))}
            </div>
            <div className="vp-prompt-actions">
              <button
                className="vp-prompt-btn vp-prompt-no"
                onClick={() => onConfirm({ mode: 'standalone' })}
              >
                Skip — standalone
              </button>
              <button
                className="vp-prompt-btn vp-prompt-yes"
                onClick={() => onConfirm({ mode: 'linked', teamId: choice })}
                disabled={!choice}
              >
                Use selected roster
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
