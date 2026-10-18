/**
 * Old-school red kitchen timer: round red body, white clock face with tick
 * marks, a pointer hand, and a wind-up knob on top. Hand-drawn SVG so it reads
 * clearly at header size (≈20px) while still looking like a mechanical timer.
 */
export function KitchenTimerIcon({ size = 20, className }: { size?: number; className?: string }) {
  const RED = '#e11d2e'
  const DARK = '#a5121b'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      role="img"
      aria-label="Timer"
    >
      {/* wind-up knob */}
      <circle cx="12" cy="3.5" r="1.7" fill={RED} />
      <rect x="11.2" y="4.4" width="1.6" height="2.6" rx="0.6" fill={RED} />

      {/* red body */}
      <circle cx="12" cy="13.6" r="8" fill={RED} stroke={DARK} strokeWidth="0.6" />

      {/* white face */}
      <circle cx="12" cy="13.6" r="5.9" fill="#ffffff" />

      {/* tick marks at 12 / 3 / 6 / 9 */}
      <g stroke={RED} strokeWidth="0.8" strokeLinecap="round">
        <line x1="12" y1="8.4" x2="12" y2="9.3" />
        <line x1="17.2" y1="13.6" x2="16.3" y2="13.6" />
        <line x1="12" y1="18.8" x2="12" y2="17.9" />
        <line x1="6.8" y1="13.6" x2="7.7" y2="13.6" />
      </g>

      {/* pointer hand */}
      <line
        x1="12"
        y1="13.6"
        x2="14.7"
        y2="10.6"
        stroke={RED}
        strokeWidth="1.2"
        strokeLinecap="round"
      />

      {/* center pin */}
      <circle cx="12" cy="13.6" r="0.9" fill={DARK} />
    </svg>
  )
}
