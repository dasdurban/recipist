/**
 * The native (Tauri) shell surface.
 *
 * Every helper here degrades to the web behaviour when the app runs in a plain
 * browser or in the Capacitor mobile builds, so callers never need to branch.
 * New native features belong in this module rather than as `__TAURI_INTERNALS__`
 * checks scattered through components.
 */
import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { openUrl, revealItemInDir } from '@tauri-apps/plugin-opener'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import type { BackupFile } from '../types'
import { backupToJson, downloadBackup, fileNameFor } from './backup'

/** True when running inside the Tauri shell rather than a browser. */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/** Label of the detached kitchen-timer window. */
export const TIMER_WINDOW_LABEL = 'timer'

/**
 * Emitted by the panel once it knows how tall it is, so the detached window can
 * size itself to the content instead of to a guess. The OS adds its own title
 * bar and borders, and that frame differs per platform, so the reporter sends
 * the *inner* height the panel needs and `fitTimerWindow` adds the frame.
 */
export const TIMER_PANEL_HEIGHT_EVENT = 'recipist:timer-panel-height'

/**
 * Which surface this window is: the main app, the detached timer, or a plain
 * browser tab. Used to route rendering and to decide which window rings the
 * timer (see the store's timer slice).
 */
export function windowLabel(): 'main' | 'timer' | 'web' {
  if (!isTauri()) return 'web'
  try {
    return getCurrentWebviewWindow().label === TIMER_WINDOW_LABEL ? 'timer' : 'main'
  } catch {
    return 'main'
  }
}

/** True when this window is the detached kitchen timer. */
export function isTimerWindow(): boolean {
  return windowLabel() === 'timer'
}

/**
 * Opens a link in the user's default browser.
 *
 * The desktop webview denies new windows — wry only creates one when a
 * `new_window_req_handler` is registered, and this app registers none — so
 * `target="_blank"` goes nowhere. Handing the URL to the OS is what makes
 * links work on the desktop.
 */
export async function openExternal(url: string): Promise<void> {
  if (!isTauri()) {
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }
  await openUrl(url)
}

/** Reveals a file in Finder. Desktop only; a no-op elsewhere. */
export async function revealInFolder(path: string): Promise<void> {
  if (!isTauri()) return
  await revealItemInDir(path)
}

export type SaveResult =
  | { status: 'saved'; path: string }
  | { status: 'downloaded' }
  | { status: 'cancelled' }

/**
 * Writes a backup to a file the user picks.
 *
 * Desktop gets the system save panel; the browser build falls back to a
 * download (and the webview would need an `on_download` hook to do anything
 * else, so this is also the reliable path there).
 */
export async function saveBackupToFile(backup: BackupFile): Promise<SaveResult> {
  if (!isTauri()) {
    downloadBackup(backup)
    return { status: 'downloaded' }
  }

  const path = await save({
    title: 'Save backup',
    defaultPath: fileNameFor(),
    filters: [{ name: 'The Recipe App backup', extensions: ['json'] }],
  })
  if (!path) return { status: 'cancelled' }

  await writeTextFile(path, backupToJson(backup))
  return { status: 'saved', path }
}

/**
 * Asks the user for a backup file.
 *
 * Desktop only — outside Tauri this returns `undefined` immediately, and callers
 * fall back to the browser's file input. In Tauri `undefined` means the user
 * cancelled the dialog.
 */
export async function openBackupFile(): Promise<{ name: string; text: string } | undefined> {
  if (!isTauri()) return undefined

  const picked = await open({
    title: 'Open backup',
    multiple: false,
    directory: false,
    filters: [{ name: 'The Recipe App backup', extensions: ['json'] }],
  })
  if (!picked || Array.isArray(picked)) return undefined

  return { name: fileName(picked), text: await readTextFile(picked) }
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}
