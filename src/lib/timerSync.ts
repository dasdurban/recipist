/**
 * Keeps the kitchen timer in step across windows.
 *
 * The desktop shell can show the timer in its own window, and each window runs
 * its own copy of the store. Control changes — the dial, start/pause/reset, the
 * moment it finishes, and which window should ring — are posted to the other
 * windows over a `BroadcastChannel` (localStorage events are the fallback).
 * Ticks are never posted: every window derives the remaining seconds from the
 * absolute `endsAt` instant, so a countdown stays honest even if the window it
 * was started in goes away.
 */
import { windowLabel } from './native'

export interface TimerSnapshot {
  duration: number
  remaining: number
  running: boolean
  endsAt: number | null
  done: boolean
  /** Label of the window that last touched the timer; only that one rings. */
  owner: string
}

type Message = { t: 'state'; s: TimerSnapshot } | { t: 'want' }

const CHANNEL = 'recipist:timer'
const STORAGE_KEY = 'recipist:timer'

let applyRemote: ((s: TimerSnapshot) => void) | null = null
let readSnapshot: (() => TimerSnapshot) | null = null
/** True while a message from another window is being applied. */
let applying = false
let channel: BroadcastChannel | null = null

function post(msg: Message): void {
  if (channel) {
    channel.postMessage(msg)
    return
  }
  try {
    // A unique value each time so repeated identical states still fire.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...msg, nonce: Math.random() }))
  } catch {
    /* storage unavailable — nothing to sync with anyway */
  }
}

function deliver(msg: Message): void {
  if (!applyRemote || !readSnapshot) return
  if (msg.t === 'want') {
    // Another window just opened and needs to know where the timer stands.
    post({ t: 'state', s: readSnapshot() })
    return
  }
  applying = true
  try {
    applyRemote(msg.s)
  } finally {
    applying = false
  }
}

/** Tells the other windows about a change made here. */
export function broadcastTimer(): void {
  if (applying || !readSnapshot) return
  post({ t: 'state', s: readSnapshot() })
}

/**
 * Passes the ringing duty to another window, e.g. when this one is closing and
 * would otherwise take the alarm with it.
 */
export function handOverTimer(to: string): void {
  if (!readSnapshot) return
  const snapshot = readSnapshot()
  if (snapshot.owner === to) return
  post({ t: 'state', s: { ...snapshot, owner: to } })
}

/**
 * Wires this window to the others. `applyRemote` pushes an incoming state into
 * the store, `readSnapshot` reads the current one out.
 */
export function initTimerSync(
  applyIncoming: (s: TimerSnapshot) => void,
  snapshot: () => TimerSnapshot,
  needsCurrentState: boolean,
): void {
  applyRemote = applyIncoming
  readSnapshot = snapshot

  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(CHANNEL)
    channel.onmessage = (event) => deliver(event.data as Message)
  } else {
    window.addEventListener('storage', (event) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return
      try {
        deliver(JSON.parse(event.newValue) as Message)
      } catch {
        /* not ours */
      }
    })
  }

  // The timer window opens empty; ask whoever is already running for the state.
  if (needsCurrentState) post({ t: 'want' })

  // Closing this window must not take the alarm with it.
  window.addEventListener('pagehide', () => {
    const snapshot = readSnapshot?.()
    if (!snapshot || snapshot.owner !== windowLabel()) return
    handOverTimer(windowLabel() === 'timer' ? 'main' : 'timer')
  })
}
