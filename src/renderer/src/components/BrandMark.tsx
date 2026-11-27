/**
 * The app mark: an osu! hit circle broken open into a "C" with a mint spark.
 * Same geometry as build/icon.svg, drawn inline so it stays crisp in the titlebar.
 */
export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="brand-ring" x1="0.08" y1="0.92" x2="0.92" y2="0.08">
          <stop offset="0" stopColor="#9b6bff" />
          <stop offset="0.5" stopColor="#ff5fa2" />
          <stop offset="1" stopColor="#ffb3d1" />
        </linearGradient>
      </defs>
      <circle
        cx="128"
        cy="128"
        r="76"
        fill="none"
        stroke="url(#brand-ring)"
        strokeWidth="32"
        strokeLinecap="round"
        strokeDasharray="82 18"
        pathLength={100}
        transform="rotate(30 128 128)"
      />
      <path
        d="M128 106 Q131.08 124.92 150 128 Q131.08 131.08 128 150 Q124.92 131.08 106 128 Q124.92 124.92 128 106 Z"
        fill="#3ee6a4"
      />
    </svg>
  );
}
