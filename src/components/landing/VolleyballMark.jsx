// The VolleyballPal mark: three curved seams turning around the centre, each
// with a parallel panel line, so it reads as a volleyball at any size.
// Colours come from the MD3 roles, so it follows the active seed.
const SEAM = (
  <>
    <path d="M24 24c-6.5-3-9.5-9.6-8.2-18.7" />
    <path d="M31.4 20.2c-3.4-5.2-4-10.8-1.6-15.3" />
  </>
);

export default function VolleyballMark({ className = '' }) {
  return (
    <svg className={`vp-mark ${className}`} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle className="vp-mark__ball" cx="24" cy="24" r="21" />
      <g className="vp-mark__seams">
        {SEAM}
        <g transform="rotate(120 24 24)">{SEAM}</g>
        <g transform="rotate(240 24 24)">{SEAM}</g>
      </g>
    </svg>
  );
}
