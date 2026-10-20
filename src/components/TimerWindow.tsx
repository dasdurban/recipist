import { useEffect, useRef } from 'react'
import { TimerPanelBody } from './TimerPanel'
import { applyTheme } from '../store/useApp'
import { loadSettings } from '../db/database'
import { TIMER_PANEL_HEIGHT_EVENT } from '../lib/native'
import type { ThemeMode } from '../types'

/**
 * The detached kitchen-timer window.
 *
 * It is the same app bundle as the main window (see `openTimerWindow`), but it
 * needs nothing from the database boot or the navigation state: just the dial,
 * so it renders the panel body by itself. The theme is read straight from the
 * saved settings because the store's `init` never runs in this window.
 */
export function TimerWindow() {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let theme: ThemeMode = 'system'
    const followSystem = () => applyTheme(theme)

    loadSettings()
      .then((settings) => {
        theme = settings.theme
        applyTheme(theme)
      })
      .catch(() => applyTheme(theme))

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', followSystem)
    return () => media.removeEventListener('change', followSystem)
  }, [])

  // Tell the host window how tall the panel actually is, so it can be sized to
  // the content. The wrapping padding counts too, and the measurement repeats
  // when the panel changes size (a longer timer, the "Time's up" state).
  useEffect(() => {
    const el = panelRef.current
    if (!el) return

    let cancelled = false

    const report = async () => {
      const panel = el.firstElementChild as HTMLElement | null
      if (!panel || cancelled) return
      const padding = 16 * 2 // the p-4 wrapper, top and bottom
      const needed = Math.ceil(panel.getBoundingClientRect().height) + padding
      try {
        const { emit } = await import('@tauri-apps/api/event')
        await emit(TIMER_PANEL_HEIGHT_EVENT, needed)
      } catch {
        /* not in the desktop shell — the modal in the app is unaffected */
      }
    }

    // Wait a frame so fonts and the dial have settled before measuring.
    const frame = requestAnimationFrame(() => void report())
    const observer = new ResizeObserver(() => void report())
    observer.observe(el)

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [])

  return (
    // `min-h-screen` with `items-center` centres the panel when it is taller
    // than the window, which pushes its top out of reach above the scroll
    // area. `justify-center` on a column flex centres horizontally without
    // that side effect, and `min-h-full` lets the content grow past the
    // viewport instead of being pinned to it.
    <div className="min-h-full bg-surface">
      <div ref={panelRef} className="min-h-full flex flex-col items-center justify-center p-4">
        <TimerPanelBody />
      </div>
    </div>
  )
}
