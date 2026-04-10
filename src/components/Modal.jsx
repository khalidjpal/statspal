import { useEffect, useRef, useState } from 'react';

export default function Modal({ open, onClose, children, maxWidth = 480 }) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const closingRef = useRef(false);

  useEffect(() => {
    if (open) {
      closingRef.current = false;
      setMounted(true);
      // next frame so the initial styles apply, then transition to visible
      const t = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(t);
    } else if (mounted) {
      // play exit animation
      closingRef.current = true;
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 200);
      return () => clearTimeout(t);
    }
  }, [open, mounted]);

  useEffect(() => {
    if (!mounted) return;
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [mounted, onClose]);

  if (!mounted) return null;

  return (
    <div
      className={`pop-overlay${visible ? ' open' : ''}`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`pop-card${visible ? ' open' : ''}`}
        style={{ maxWidth }}
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          className="pop-close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        <div className="pop-content">
          {children}
        </div>
      </div>
    </div>
  );
}
