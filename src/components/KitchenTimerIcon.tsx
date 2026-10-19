/**
 * The red kitchen timer from the reference photo: a thick glossy red bezel
 * around a pale face, a ring of dark minute marks, a red hand turning on a dark
 * centre hub, and a small dark mark on the bezel at twelve o'clock. Nothing
 * sticks out of the top.
 *
 * The colours live here so the timer panel can use the same red for its dial.
 */
export const TIMER_COLORS = {
  bezel: '#d5202c',
  bezelDark: '#8e1119',
  bezelLight: '#f2616c',
  face: '#f6f8f8',
  faceEdge: '#ccd4d6',
  mark: '#3c3c3c',
  hub: '#241a1a',
}

export function KitchenTimerIcon({
  size = 20,
  className,
}: {
  size?: number
  className?: string
}) {
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
      {/* glossy red bezel */}
      <circle cx="12" cy="12" r="11.4" fill={TIMER_COLORS.bezelDark} />
      <circle cx="12" cy="12" r="11" fill={TIMER_COLORS.bezel} />
      {/* the shine along the top-left of the bezel */}
      <path
        d="M4.8 8.2A8.4 8.4 0 0 1 15.6 3.7"
        stroke={TIMER_COLORS.bezelLight}
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity="0.8"
      />
      {/* dark mark on the bezel at twelve o'clock */}
      <rect x="11.35" y="0.9" width="1.3" height="1.7" rx="0.6" fill={TIMER_COLORS.hub} />

      {/* pale face */}
      <circle cx="12" cy="12" r="8.2" fill={TIMER_COLORS.face} />
      <circle cx="12" cy="12" r="8.2" stroke={TIMER_COLORS.faceEdge} strokeWidth="0.4" />

      {/* minute marks around the rim, the quarters a little longer */}
      <g stroke={TIMER_COLORS.mark} strokeLinecap="round">
        {Array.from({ length: 12 }, (_, i) => (
          <line
            key={i}
            x1="12"
            y1="4.1"
            x2="12"
            y2={i % 3 === 0 ? 5.7 : 5}
            strokeWidth={i % 3 === 0 ? 0.85 : 0.55}
            transform={`rotate(${i * 30} 12 12)`}
          />
        ))}
      </g>

      {/* dark hub, with the red hand turning on it */}
      <line
        x1="12"
        y1="12"
        x2="12"
        y2="5.4"
        stroke={TIMER_COLORS.bezel}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="1.5" fill={TIMER_COLORS.hub} />
    </svg>
  )
}
