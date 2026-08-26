import { IconExpand, IconCollapse } from './Icons';
import { useFullscreen } from '../hooks/useFullscreen';

// The fullscreen control, sized and styled by whichever header hosts it.
//
// `className` is the host header's own button class, so the control inherits
// that header's look instead of importing a competing style of its own — the
// app has several different headers and this appears in most of them.
//
// Renders nothing where fullscreen cannot work (an iframe without the
// permission, iPhone Safari) rather than offering a button that does nothing.
export default function FullscreenButton({ className = '', size = 15, label = false }) {
  const { isFullscreen, toggle, supported } = useFullscreen();
  if (!supported) return null;

  const title = isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)';
  return (
    <button
      type="button"
      className={className}
      onClick={toggle}
      title={title}
      aria-label={title}
      aria-pressed={isFullscreen}
    >
      {isFullscreen ? <IconCollapse size={size} /> : <IconExpand size={size} />}
      {label && <span className="fs-btn-label">{isFullscreen ? 'Exit' : 'Full'}</span>}
    </button>
  );
}
