import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'error') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

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
              background: t.type === 'error' ? '#dc2626' : t.type === 'success' ? '#16a34a' : '#c9a84c',
              animation: 'toast-in 0.2s ease',
            }}>
              {t.type === 'error' && 'Error: '}{t.message}
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
