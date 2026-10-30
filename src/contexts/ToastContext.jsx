import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  // `action` (optional): { label, onClick } — a button on the toast, such
  // as "Undo". Clicking it runs the action and dismisses the toast.
  const addToast = useCallback((message, type = 'error', action = null) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type, action }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), action ? 6000 : 4000);
  }, []);
  const dismiss = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {toasts.length > 0 && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          zIndex: 99999, display: 'flex', flexDirection: 'column', gap: 8,
          maxWidth: '90vw', width: 400,
        }}>
          {toasts.map(t => (
            <div key={t.id} style={{
              padding: '12px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
              color: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
              background: t.type === 'error' ? '#dc2626' : t.type === 'success' ? '#16a34a'
                : t.type === 'info' ? '#1c1c21' : '#c9a84c',
              border: t.type === 'info' ? '1px solid #2e2e35' : 'none',
              display: 'flex', alignItems: 'center', gap: 12,
              animation: 'toast-in 0.2s ease',
            }}>
              <span style={{ flex: '1 1 auto' }}>{t.type === 'error' && 'Error: '}{t.message}</span>
              {t.action && (
                <button
                  type="button"
                  onClick={() => { dismiss(t.id); t.action.onClick(); }}
                  style={{
                    flex: '0 0 auto', padding: '4px 10px', borderRadius: 6,
                    background: 'transparent', border: '1px solid rgba(255,255,255,0.35)',
                    color: t.type === 'info' ? '#f472b6' : '#fff',
                    font: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  }}
                >{t.action.label}</button>
              )}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
