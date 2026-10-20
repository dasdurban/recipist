/**
 * Deep links: the receiving end of the "Save to Recipe App" bookmarklet.
 *
 * The bookmarklet opens `recipist://import?url=<page>`. The Rust side parses and
 * validates that link, then hands over just the page URL through one of two
 * paths:
 *
 *   - the app was already running: a `deep-link://import` event fires;
 *   - the link started the app: there was no listener yet, so the URL waits and
 *     `take_pending_import_url` collects it on mount.
 *
 * Both are funnelled into a single callback here, so the rest of the frontend
 * never has to care which happened.
 */
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { isTauri } from './native'

/** The event the Rust side emits for a link that arrives while running. */
const IMPORT_EVENT = 'deep-link://import'

/**
 * Calls `onUrl` for every imported page URL, whether the link started the app or
 * arrived while it was running.
 *
 * Returns an unsubscribe function. In a plain browser build this does nothing,
 * which keeps the web version working.
 */
export async function onImportUrl(onUrl: (url: string) => void): Promise<() => void> {
  if (!isTauri()) return () => {}

  // A link that launched the process is waiting on the Rust side.
  try {
    const pending = await invoke<string | null>('take_pending_import_url')
    if (pending) onUrl(pending)
  } catch {
    // Not fatal: the event below still covers links opened while running.
  }

  const unlisten = await listen<string>(IMPORT_EVENT, (event) => {
    if (typeof event.payload === 'string' && event.payload) onUrl(event.payload)
  })

  return unlisten
}
