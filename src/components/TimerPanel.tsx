import { useEffect, useRef, useState } from 'react'
import { Pause, Play, RotateCw } from 'lucide-react'
import clsx from 'clsx'
import { Modal } from './ui/Modal'
import { TIMER_COLORS } from './KitchenTimerIcon'
import { useApp } from '../store/useApp'

const pad = (n: number) => n.toString().padStart(2, '0')

/** Returns remaining seconds based on endsAt if running (most accurate). */
function useRemaining() {
  const running = useApp((s) => s.timerRunning)
  const remaining = useApp((s) => s.timerRemaining)
  const endsAt = useApp((s) => s.timerEndsAt)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!running || endsAt === null) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [running, endsAt])

  if (running && endsAt !== null) {
    const r = Math.max(0, Math.ceil((endsAt - now) / 1000))
    return r
  }
  return remaining
}

/**
 * The dial is drawn in a 100 × 100 box: a pale face inside the red bezel, a ring
 * of minute marks with the numbers every five minutes, and a red hand turning
 * on a dark hub — the same timer as the header icon, big enough to turn.
 * One turn is an hour, or the whole duration when the timer runs longer.
 */
const FACE_R = 43.5
const TICKS = Array.from({ length: 60 }, (_, i) => i)
const LABELS = Array.from({ length: 12 }, (_, i) => ({ value: i * 5, deg: i * 30 }))
const PRESETS = [1, 2, 3, 5, 10, 15, 20, 25, 30, 45, 60]

export function TimerPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Kitchen timer">
      <TimerPanelBody />
    </Modal>
  )
}

/**
 * The dial and its controls, without the surrounding chrome: the modal in the
 * browser build and the detached desktop window both show this.
 */
export function TimerPanelBody() {
  const duration = useApp((s) => s.timerDuration)
  const running = useApp((s) => s.timerRunning)
  const done = useApp((s) => s.timerDone)
  const setDuration = useApp((s) => s.setTimerDuration)
  const start = useApp((s) => s.startTimer)
  const pause = useApp((s) => s.pauseTimer)
  const reset = useApp((s) => s.resetTimer)

  const remaining = useRemaining()

  // An hour fits the numbered dial; a longer timer uses the whole turn instead.
  const scaleMinutes = duration > 3600 ? Math.ceil(duration / 60) : 60
  const numbered = duration <= 3600
  const handDeg = Math.min(360, (remaining / 60 / scaleMinutes) * 360)
  const idle = !running && remaining === 0 && duration === 0

  const dialRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const face = `${pad(Math.floor(remaining / 60))}:${pad(remaining % 60)}`
  const clock = `${pad(Math.floor(remaining / 3600))}:${face}`

  function minutesAt(clientX: number, clientY: number) {
    const el = dialRef.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    const dx = clientX - (r.left + r.width / 2)
    const dy = clientY - (r.top + r.height / 2)
    // 0° is twelve o'clock, growing clockwise; the scale runs 1 … 60 so that
    // the very top is one minute rather than none
    let deg = (Math.atan2(dx, -dy) * 180) / Math.PI
    if (deg < 0) deg += 360
    return Math.min(scaleMinutes, Math.max(1, Math.round((deg / 360) * scaleMinutes)))
  }

  function setFromPointer(clientX: number, clientY: number) {
    const minutes = minutesAt(clientX, clientY)
    if (minutes !== null && minutes * 60 !== duration) setDuration(minutes * 60)
  }

  const [m, setM] = useState(0)
  const [s, setS] = useState(0)

  useEffect(() => {
    setM(Math.floor(duration / 60))
    setS(duration % 60)
  }, [duration])

  const settable = !running

  return (
    <div className="space-y-5">
      {/* the dial */}
      <div className="flex flex-col items-center">
        <div
          ref={dialRef}
          role="slider"
          aria-label="Timer length in minutes"
          aria-valuemin={1}
          aria-valuemax={scaleMinutes}
          aria-valuenow={Math.max(1, Math.round(remaining / 60))}
          aria-disabled={running}
          title={settable ? 'Turn the dial to set the timer' : undefined}
          onPointerDown={(e) => {
            if (!settable) return
            dragging.current = true
            try {
              e.currentTarget.setPointerCapture(e.pointerId)
            } catch {
              /* the pointer can already be gone */
            }
            setFromPointer(e.clientX, e.clientY)
          }}
          onPointerMove={(e) => {
            if (dragging.current) setFromPointer(e.clientX, e.clientY)
          }}
          onPointerUp={(e) => {
            dragging.current = false
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId)
            }
          }}
          onPointerCancel={() => {
            dragging.current = false
          }}
          className={clsx(
            'relative h-56 w-56 shrink-0 rounded-full select-none',
            settable && 'cursor-grab touch-none active:cursor-grabbing',
            done && 'animate-pulse',
          )}
          style={{
            background:
              'radial-gradient(circle at 34% 26%, #f4656f 0%, #dc2230 34%, #b01521 66%, #7d0c14 100%)',
            boxShadow:
              '0 14px 26px -14px rgba(120, 10, 20, 0.7), inset 0 2px 4px rgba(255, 255, 255, 0.35), inset 0 -8px 16px rgba(0, 0, 0, 0.3)',
          }}
        >
          {/* pale face */}
          <div
            className="absolute rounded-full"
            style={{
              inset: `${50 - FACE_R}%`,
              background:
                'radial-gradient(circle at 38% 30%, #ffffff 0%, #f4f7f7 55%, #e6ebec 100%)',
              boxShadow:
                'inset 0 2px 6px rgba(0, 0, 0, 0.16), inset 0 -3px 8px rgba(255, 255, 255, 0.9)',
            }}
          />
          {/* the gloss across the face */}
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              inset: `${50 - FACE_R}%`,
              background:
                'radial-gradient(38% 30% at 32% 22%, rgba(255, 255, 255, 0.85), rgba(255, 255, 255, 0) 70%)',
            }}
          />

          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full pointer-events-none">
            {/* minute marks */}
            <g stroke={TIMER_COLORS.mark} strokeLinecap="round">
              {TICKS.map((i) => {
                const major = i % 5 === 0
                return (
                  <line
                    key={i}
                    x1="50"
                    y1="8"
                    x2="50"
                    y2={major ? 14 : 11}
                    strokeWidth={major ? 1.1 : 0.6}
                    transform={`rotate(${i * 6} 50 50)`}
                  />
                )
              })}
            </g>

            {/* the minute numbers, kept upright */}
            {numbered &&
              LABELS.map(({ value, deg }) => (
                <g key={value} transform={`rotate(${deg} 50 50)`}>
                  <text
                    x="50"
                    y="22"
                    transform={`rotate(${-deg} 50 22)`}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="8.5"
                    fill="#575757"
                  >
                    {value}
                  </text>
                </g>
              ))}

            {/* the hand, on a dark hub */}
            <g transform={`rotate(${handDeg} 50 50)`}>
              <line
                x1="50"
                y1="56"
                x2="50"
                y2="10"
                stroke="rgba(0, 0, 0, 0.13)"
                strokeWidth="2.8"
                strokeLinecap="round"
                transform="translate(1 1.2)"
              />
              <line
                x1="50"
                y1="56"
                x2="50"
                y2="10"
                stroke={TIMER_COLORS.bezel}
                strokeWidth="2.8"
                strokeLinecap="round"
              />
            </g>
            <circle cx="50" cy="50" r="3.4" fill={TIMER_COLORS.hub} />
          </svg>
        </div>

        <div className="mt-3 text-center">
          <div
            className={clsx(
              'text-4xl font-semibold tabular-nums tracking-tight',
              done && 'text-red-600 animate-pulse',
            )}
          >
            {remaining >= 3600 ? clock : face}
          </div>
          <div className="mt-1 text-xs text-content-muted">
            {done
              ? 'Time’s up!'
              : running
                ? 'Counting down'
                : 'Turn the dial, or pick a time below'}
          </div>
        </div>
      </div>

      {/* a precise duration, on top of the dial */}
      <div className="space-y-2">
        <div className="field-label">Set duration</div>
        <div className="flex items-center justify-center gap-2">
          <input
            type="number"
            min={0}
            max={99}
            value={m}
            onChange={(e) => setM(Math.max(0, Math.min(99, Number(e.target.value) || 0)))}
            className="w-14 text-center"
            aria-label="Minutes"
          />
          <span className="text-sm text-content-muted">min</span>
          <input
            type="number"
            min={0}
            max={59}
            value={s}
            onChange={(e) => setS(Math.max(0, Math.min(59, Number(e.target.value) || 0)))}
            className="w-14 text-center"
            aria-label="Seconds"
          />
          <span className="text-sm text-content-muted">sec</span>
          <button className="btn-soft" onClick={() => setDuration(m * 60 + s)}>
            Set
          </button>
        </div>
        <div className="flex flex-wrap justify-center gap-1.5 pt-1">
          {PRESETS.map((p) => {
            const active = duration === p * 60
            return (
              <button
                key={p}
                className={clsx(
                  'btn-ghost !py-1 !px-2 text-xs',
                  active && '!bg-surface-3 text-brand ring-1 ring-brand/40',
                )}
                aria-pressed={active}
                onClick={() => setDuration(p * 60)}
              >
                {p} min
              </button>
            )
          })}
        </div>
      </div>

      {/* controls */}
      <div className="flex items-center justify-center gap-2">
        {running ? (
          <button className="btn-soft" onClick={() => pause()}>
            <Pause size={16} /> Pause
          </button>
        ) : (
          <button className="btn-primary" onClick={() => start()} disabled={idle}>
            <Play size={16} /> Start
          </button>
        )}
        <button className="btn-ghost" onClick={() => reset()} disabled={duration === 0}>
          <RotateCw size={16} /> Reset
        </button>
      </div>
    </div>
  )
}
