import { useEffect } from 'react'
import { TimerPanelBody } from './TimerPanel'
import { applyTheme } from '../store/useApp'
import { loadSettings } from '../db/database'
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

  return (
    <div className="min-h-screen bg-surface overflow-y-auto">
      <div className="min-h-screen flex items-center justify-center p-4">
        <TimerPanelBody />
      </div>
    </div>
  )
}
