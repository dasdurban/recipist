/** Gap between the three quick strikes of one ring. */
const STRIKE_GAP = 0.16
/** Gap between the three rings — long enough that each reads as its own bell. */
const ROUND_GAP = 0.95
/** How many times the three-strike ring repeats before it stops. */
const ROUNDS = 10

type AudioBits = {
  ctx: AudioContext
  master: GainNode
  timer: number | null
}

let bits: AudioBits | null = null

function audioContextCtor(): typeof AudioContext | undefined {
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  )
}

/**
 * The one audio context the timer uses. It has to be created before the alarm
 * goes off: a context made at ring time was never touched by a user gesture,
 * and WebView2 leaves those suspended, which is how the ringer ended up silent.
 */
function getBits(): AudioBits | null {
  if (bits) return bits
  const Ctx = audioContextCtor()
  if (!Ctx) return null
  try {
    const ctx = new Ctx()
    const master = ctx.createGain()
    master.gain.value = 1
    master.connect(ctx.destination)
    bits = { ctx, master, timer: null }
    return bits
  } catch {
    return null
  }
}

/**
 * Call from the click that starts the timer. Resuming inside the gesture is
 * what lets the sound play later, when the timer runs out and no gesture is in
 * flight.
 */
export function primeTimerAudio() {
  const b = getBits()
  if (!b) return
  try {
    if (b.ctx.state === 'suspended') void b.ctx.resume()
    // A silent buffer counts as playback for the autoplay policy.
    const buffer = b.ctx.createBuffer(1, 1, b.ctx.sampleRate)
    const source = b.ctx.createBufferSource()
    source.buffer = buffer
    source.connect(b.master)
    source.start()
  } catch {
    // Audio is unavailable; the ring will simply be silent.
  }
}

/** Stops a ring that is still going. Safe to call when nothing is ringing. */
export function stopTimerRing() {
  if (!bits) return
  const b = bits
  if (b.timer !== null) {
    window.clearTimeout(b.timer)
    b.timer = null
  }
  try {
    const now = b.ctx.currentTime
    b.master.gain.cancelScheduledValues(now)
    b.master.gain.setValueAtTime(b.master.gain.value, now)
    b.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.08)
  } catch {}
}

/**
 * A bright mechanical "ring" for the kitchen timer — three quick bell strikes
 * synthesized with the Web Audio API (no asset file needed), repeated ten
 * times so it carries across a room. Silently no-ops if audio is unavailable
 * (e.g. autoplay policy or no AudioContext).
 */
export function playTimerDing() {
  const b = getBits()
  if (!b) return

  try {
    if (b.ctx.state === 'suspended') void b.ctx.resume()
    const t0 = b.ctx.currentTime
    b.master.gain.cancelScheduledValues(t0)
    b.master.gain.setValueAtTime(1, t0)

    for (let round = 0; round < ROUNDS; round++) {
      const base = t0 + round * ROUND_GAP
      for (let strike = 0; strike < 3; strike++) {
        const at = base + strike * STRIKE_GAP
        // each strike is a bright two-partial bell (E6 + B6)
        for (const freq of [1318.5, 1975.5]) {
          const osc = b.ctx.createOscillator()
          const gain = b.ctx.createGain()
          osc.type = 'sine'
          osc.frequency.value = freq
          gain.gain.setValueAtTime(0.0001, at)
          gain.gain.exponentialRampToValueAtTime(0.3, at + 0.008)
          gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.45)
          osc.connect(gain)
          gain.connect(b.master)
          osc.start(at)
          osc.stop(at + 0.5)
        }
      }
    }

    if (b.timer !== null) window.clearTimeout(b.timer)
    b.timer = window.setTimeout(() => {
      stopTimerRing()
    }, ((ROUNDS - 1) * ROUND_GAP + 1.7) * 1000)
  } catch {
    // audio not available — ignore
  }
}
