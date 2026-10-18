import { useEffect, useMemo, useState } from 'react'
import { Play, Pause, RotateCw, Timer as TimerIcon, X } from 'lucide-react'
import { Modal } from './ui/Modal'
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

export function TimerPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const duration = useApp((s) => s.timerDuration)
  const running = useApp((s) => s.timerRunning)
  const done = useApp((s) => s.timerDone)
  const setDuration = useApp((s) => s.setTimerDuration)
  const start = useApp((s) => s.startTimer)
  const pause = useApp((s) => s.pauseTimer)
  const reset = useApp((s) => s.resetTimer)

  const remaining = useRemaining()
  const total = duration > 0 ? duration : remaining
  const pct = total > 0 ? Math.max(0, Math.min(100, ((total - remaining) / total) * 100)) : 0

  const hhmmss = useMemo(() => {
    const h = Math.floor(remaining / 3600)
    const m = Math.floor((remaining % 3600) / 60)
    const s = remaining % 60
    return `${pad(h)}:${pad(m)}:${pad(s)}`
  }, [remaining])

  const [m, setM] = useState(0)
  const [s, setS] = useState(0)

  useEffect(() => {
    if (!open) return
    const mins = Math.floor(duration / 60)
    const secs = duration % 60
    setM(mins)
    setS(secs)
  }, [open, duration])

  function applyPreset() {
    setDuration(m * 60 + s)
  }

  useEffect(() => {
    if (done && open) {
      // ring already played; panel stays open so user can reset
    }
  }, [done, open])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <TimerIcon size={18} /> Kitchen timer
        </div>
      }
      size="sm"
    >
      <div className="space-y-5">
        {/* Time display + progress */}
        <div className="flex flex-col items-center justify-center py-4">
          <div
            className={
              done
                ? 'text-5xl font-semibold tabular-nums tracking-tight text-red-600 animate-pulse'
                : 'text-5xl font-semibold tabular-nums tracking-tight'
            }
          >
            {hhmmss}
          </div>
          {done && (
            <div className="mt-2 text-sm font-semibold text-red-600">Time’s up!</div>
          )}
          <div className="mt-3 w-full max-w-xs h-2 bg-surface-2 rounded-full overflow-hidden">
            <div className="h-full bg-brand transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* Preset / set duration */}
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
            <button className="btn-soft" onClick={applyPreset}>
              Set
            </button>
          </div>
          <div className="flex flex-wrap justify-center gap-1.5 pt-1">
            {[1, 2, 3, 5, 10, 15, 20, 25, 30, 45, 60].map((m2) => (
              <button
                key={m2}
                className="btn-ghost !py-1 !px-2 text-xs"
                onClick={() => setDuration(m2 * 60)}
              >
                {m2} min
              </button>
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-2">
          {running ? (
            <button className="btn-soft" onClick={() => pause()}>
              <Pause size={16} /> Pause
            </button>
          ) : (
            <button className="btn-primary" onClick={() => start()}>
              <Play size={16} /> Start
            </button>
          )}
          <button className="btn-ghost" onClick={() => reset()}>
            <RotateCw size={16} /> Reset
          </button>
          <button className="btn-ghost" onClick={onClose}>
            <X size={16} /> Close
          </button>
        </div>
      </div>
    </Modal>
  )
}
