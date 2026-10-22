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
 * older install is cleared out here on the next start. The native side does
 * the same job, because the page that has to do it may itself be the stale
 * copy - see `PURGE_SERVICE_WORKER_JS` in `src-tauri/src/lib.rs`.
 */
import { isTauri } from './native'

/**
 * How many times the window may be reloaded to shed a worker. A worker that
 * refuses to go must not be able to start a reload loop.
 */
const PURGE_ROUNDS = '__recipist_service_worker_purge_rounds'
const MAX_ROUNDS = 4

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

  let rounds = 0
  try {
    rounds = Number(window.sessionStorage.getItem(PURGE_ROUNDS) || '0')
  } catch {
    return false
  }
  if (rounds >= MAX_ROUNDS) return false

  // A page that is being served by a worker is showing the bundle from the
  // cache rather than from the binary.
  const wasControlled = !!navigator.serviceWorker.controller

  // The stale bundle is still trying to register its worker, so the
  // registration is removed again and again until it really stays gone.
  for (let attempt = 0; attempt < 10; attempt++) {
    let registrations: readonly ServiceWorkerRegistration[]
    try {
      registrations = await navigator.serviceWorker.getRegistrations()
    } catch {
      return false
    }
    if (registrations.length === 0) break
    await Promise.all(registrations.map((r) => r.unregister().catch(() => {})))
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  let left: readonly ServiceWorkerRegistration[]
  try {
    left = await navigator.serviceWorker.getRegistrations()
  } catch {
    return false
  }
  if (left.length > 0) return false

  // Caches can outlive the worker that filled them, so they go either way.
  if ('caches' in window) {
    try {
      for (const key of await caches.keys()) await caches.delete(key)
    } catch {
      /* the cache is not the point; the worker is */
    }
  }

  if (!wasControlled) return false

  try {
    window.sessionStorage.setItem(PURGE_ROUNDS, String(rounds + 1))
  } catch {
    /* the reload still works without the counter */
  }
  window.location.reload()
  return true
}
