// Modals used during live game: LastPoint, SetOver, SetSummary, EndMatch

export function LastPointModal({ onUndo, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
        <h2>Undo Last Point?</h2>
        <p style={{ marginBottom: 20, color: '#888' }}>This will remove the last recorded point.</p>
        <div className="modal-actions" style={{ justifyContent: 'center' }}>
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-btn-primary" onClick={onUndo} style={{ background: '#C0392B' }}>Undo</button>
        </div>
      </div>
    </div>
  );
}

export function SetOverModal({ setNumber, homeScore, awayScore, onConfirm, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
        <h2>Set {setNumber} Complete!</h2>
        <div style={{ fontSize: 32, fontWeight: 700, margin: '16px 0' }}>
          {homeScore} - {awayScore}
        </div>
        <div className="modal-actions" style={{ justifyContent: 'center' }}>
          <button className="modal-btn-primary" onClick={onConfirm}>Continue</button>
        </div>
      </div>
    </div>
  );
}

export function SetSummaryModal({ sets, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>Set Scores</h2>
        {sets.map((s, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee' }}>
            <span>Set {i + 1}</span>
            <span style={{ fontWeight: 600 }}>{s.home} - {s.away}</span>
          </div>
        ))}
        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="modal-btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export function EndMatchModal({ homeSetsWon, awaySetsWon, sets, onConfirm, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
        <h2>Match Over!</h2>
        <div style={{ fontSize: 36, fontWeight: 700, margin: '16px 0' }}>
          {homeSetsWon} - {awaySetsWon}
        </div>
        <div style={{ fontSize: 14, color: '#888', marginBottom: 16 }}>
          {homeSetsWon > awaySetsWon ? 'Victory!' : 'Defeat'}
        </div>
        {sets.map((s, i) => (
          <div key={i} style={{ fontSize: 13, color: '#888' }}>
            Set {i + 1}: {s.home}-{s.away}
          </div>
        ))}
        <div className="modal-actions" style={{ justifyContent: 'center', marginTop: 20 }}>
          <button className="modal-btn-primary" onClick={onConfirm}>Save & Finish</button>
        </div>
      </div>
    </div>
  );
}
