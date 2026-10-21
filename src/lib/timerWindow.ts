/**
 * The detached kitchen-timer window.
 *
 * The panel normally lives in a modal inside the app, but on the desktop it is
 * much more useful as a window of its own: it can be dragged off the main
 * window, stays open while the recipes are used, and keeps the timer visible
 * when the app is behind something else. The window loads the same bundle and
 * decides what to render from its label (see `isTimerWindow`).
 */
import { WebviewWindow, getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { currentMonitor } from '@tauri-apps/api/window'
import { isTauri, TIMER_WINDOW_LABEL, TIMER_PANEL_HEIGHT_EVENT } from './native'

/**
 * The window is sized to the panel, not the other way round.
 *
 * `height` in the window options is the *outer* height, so the OS title bar and
 * borders come out of it — and that frame is a different size on Windows, macOS
 * and Linux. Hard-coding one number therefore leaves the panel slightly clipped
 * on whichever platform the frame is tallest. Instead the window opens at a
 * sane default and then asks the panel how much room it actually needs.
 */
const WIDTH = 360
const HEIGHT = 700
const MARGIN = 16

/** Height to fall back on if the panel cannot report its own. */
const MIN_HEIGHT = 520

/** Guards against a second click creating a duplicate window. */
let opening = false

/**
 * Brings up the timer window, or focuses the one that is already open.
 * Returns false when there is no desktop shell to open one in (the browser
 * build keeps using the panel inside the page).
 */
export async function openTimerWindow(): Promise<boolean> {
  if (!isTauri()) return false
  if (opening) return true
  opening = true

  try {
    const existing = await WebviewWindow.getByLabel(TIMER_WINDOW_LABEL)
    if (existing) {
      await existing.unminimize().catch(() => {})
      await existing.setFocus()
      return true
    }

    const position = await besideMainWindow()
    const timer = new WebviewWindow(TIMER_WINDOW_LABEL, {
      url: 'index.html',
      title: 'Kitchen timer',
      width: WIDTH,
      height: HEIGHT,
      minWidth: 300,
      minHeight: MIN_HEIGHT,
      resizable: true,
      maximizable: false,
      ...position,
    })

    return await new Promise<boolean>((resolve) => {
      // The panel measures itself once it has rendered and asks for whatever
      // height it needs; see `fitTimerWindow`.
      timer.once('tauri://error', () => resolve(false))
      timer.once('tauri://created', () => {
        resolve(true)
        void fitTimerWindow(timer)
      })
    })
  } catch {
    return false
  } finally {
    opening = false
  }
}

/**
 * Grows the timer window to fit the panel exactly.
 *
 * The panel cannot be measured before it has rendered, and the frame the OS
 * draws around the window differs per platform, so instead of guessing we
 * measure from inside: the panel reports the height its content needs
 * (`TIMER_PANEL_HEIGHT_EVENT`), and here we set the outer height to that plus
 * whatever frame the window currently has.
 */
async function fitTimerWindow(win: WebviewWindow): Promise<void> {
  try {
    const { listen } = await import('@tauri-apps/api/event')
    const { LogicalSize } = await import('@tauri-apps/api/window')
    const stop = await listen<number>(TIMER_PANEL_HEIGHT_EVENT, async (event) => {
      const needed = event.payload
      if (!Number.isFinite(needed) || needed <= 0) return
      try {
        const [outer, inner, scale] = await Promise.all([
          win.outerSize(),
          win.innerSize(),
          win.scaleFactor(),
        ])
        // Frame = outer minus inner, in physical pixels.
        const frame = Math.max(0, (outer.height - inner.height) / scale)
        await win.setSize(new LogicalSize(Math.round(WIDTH), Math.round(needed + frame)))
      } catch {
        /* resizing is cosmetic — never let it break the window */
      }
      stop()
    })
  } catch {
    /* the event API is unavailable; the default height stands */
  }
}

/** Puts the timer just outside the app, or centred if that cannot be worked out. */
async function besideMainWindow(): Promise<{ x?: number; y?: number }> {
  try {
    const main = getCurrentWebviewWindow()
    const [position, size, scale, monitor] = await Promise.all([
      main.outerPosition(),
      main.outerSize(),
      main.scaleFactor(),
      currentMonitor(),
    ])

    const left = position.x / scale
    const top = position.y / scale
    let x = left + size.width / scale + MARGIN
    let y = top + 56

    if (monitor) {
      const areaLeft = monitor.position.x / scale
      const areaTop = monitor.position.y / scale
      const areaRight = areaLeft + monitor.size.width / scale
      const areaBottom = areaTop + monitor.size.height / scale
      // No room to the right? Sit to the left of the app instead.
      if (x + WIDTH > areaRight - MARGIN) x = left - WIDTH - MARGIN
      x = clamp(x, areaLeft + 8, areaRight - WIDTH - 8)
      y = clamp(y, areaTop + 8, areaBottom - HEIGHT - 8)
    }

    return { x: Math.round(x), y: Math.round(y) }
  } catch {
    return {} // no position — let the shell centre it
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, Math.max(min, max)))
}
