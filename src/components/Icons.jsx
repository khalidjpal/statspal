// Lightweight inline SVG icons used across VolleyballPal UI.
// All icons are 1em by default, use currentColor, and accept className/size.

const base = (size) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
});

export function IconLink({ size = 16, className }) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M10 14a4.5 4.5 0 0 0 6.36 0l2.83-2.83a4.5 4.5 0 0 0-6.36-6.36l-1.06 1.06" />
      <path d="M14 10a4.5 4.5 0 0 0-6.36 0l-2.83 2.83a4.5 4.5 0 0 0 6.36 6.36l1.06-1.06" />
    </svg>
  );
}

export function IconHome({ size = 16, className }) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}

export function IconChart({ size = 16, className }) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-8" />
      <path d="M22 20v-5" />
      <path d="M3 20h19" />
    </svg>
  );
}

export function IconRotate({ size = 16, className }) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

export function IconArrowRight({ size = 14, className }) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export function IconArrowLeft({ size = 14, className }) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </svg>
  );
}

export function IconDotted({ size = 16, className }) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <circle cx="6" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="18" cy="12" r="1.4" />
    </svg>
  );
}

export function IconSwap({ size = 14, className }) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M7 7h13" />
      <path d="m16 3 4 4-4 4" />
      <path d="M17 17H4" />
      <path d="m8 13-4 4 4 4" />
    </svg>
  );
}

export function IconUsers({ size = 16, className }) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 20v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function IconBolt({ size = 16, className }) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M13 2 4 14h8l-1 8 9-12h-8z" />
    </svg>
  );
}

export function IconClipboard({ size = 16, className }) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M9 12h6" />
      <path d="M9 16h6" />
    </svg>
  );
}

export function IconCalendar({ size = 16, className }) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </svg>
  );
}

export function IconPlay({ size = 16, className }) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <polygon points="6 4 20 12 6 20 6 4" />
    </svg>
  );
}
