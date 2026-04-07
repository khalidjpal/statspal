export default function CredsModal({ creds, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>Account Created</h2>
        <div style={{ background: '#f8f9fa', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontWeight: 600 }}>Name:</span> {creds.name}
          </div>
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontWeight: 600 }}>Role:</span> {creds.role}
          </div>
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontWeight: 600 }}>Username:</span> {creds.username}
          </div>
          <div>
            <span style={{ fontWeight: 600 }}>Password:</span> {creds.password}
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#C0392B', marginBottom: 16 }}>
          Save these credentials — the password cannot be recovered later.
        </div>
        <div className="modal-actions">
          <button className="modal-btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
