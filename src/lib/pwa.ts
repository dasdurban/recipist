/**
 * The desktop app must not be served by a service worker.
 *
 * The browser build is a PWA, so it registers a worker to keep working offline
 * and to pick up new versions. The desktop build has no such need: its assets
 * live inside the binary, and a worker only ever gets in the way there.
 *
 * A worker caches the bundle, and a cached bundle outlives an app update. The
 * worker keeps serving the JavaScript of the version that first cached it, so
 * an update could ship a new build while the window still ran the old one.
 * That is not a cosmetic problem: the manual arrangement of recipes and the
 * bookmarklet section were both added in one commit, and an app that kept
 * serving the bundle from before it had neither.
 *
 * So the desktop build never registers a worker, and anything left behind by an
 * older install is cleared out here on the next start.
 */
import { isTauri } from './native'

/**
 * Set once the cleanup has run, so the desktop app and the native side (which
 * has to do the same job for a page that is itself the stale copy) do not
 * both reload the window.
 */
const PURGE_MARKER = '__recipist_service_worker_purged'

/**
 * Unregisters any service worker and drops its caches.
 *
 * Returns true when the page is being reloaded to shed a stale bundle, in
 * which case the caller should not carry on starting the app: the reload
 * brings up the assets that are actually in the binary.
 */
export async function purgeServiceWorker(): Promise<boolean> {
  if (!isTauri()) return false
  if (!('serviceWorker' in navigator)) return false
  if (window.sessionStorage.getItem(PURGE_MARKER)) return false

  let registrations: readonly ServiceWorkerRegistration[] = []
  try {
    registrations = await navigator.serviceWorker.getRegistrations()
  } catch {
    return false
  }

  // Caches can outlive the worker that filled them, so they go either way.
  if ('caches' in window) {
    try {
      for (const key of await caches.keys()) await caches.delete(key)
    } catch {
      /* the cache is not the point; the worker is */
    }
  }

  if (registrations.length === 0) return false

  // A controlled page is being served by the worker, so what is on screen
  // came from the cache rather than from the binary.
  const wasControlled = !!navigator.serviceWorker.controller

  await Promise.all(registrations.map((r) => r.unregister().catch(() => {})))

  window.sessionStorage.setItem(PURGE_MARKER, '1')

  if (wasControlled) {
    window.location.reload()
    return true
  }
  return false
}
