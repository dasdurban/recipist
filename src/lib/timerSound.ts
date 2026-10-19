/** Gap between the three quick strikes of one ring. */
const STRIKE_GAP = 0.16
/** Gap between the three rings — long enough that each reads as its own bell. */
const ROUND_GAP = 0.95
/** How many times the three-strike ring repeats before it stops. */
const ROUNDS = 3

/**
 * A bright mechanical "ring" for the kitchen timer — three quick bell strikes
 * synthesized with the Web Audio API (no asset file needed), repeated three
 * times so it carries across a room. Silently no-ops if audio is unavailable
 * (e.g. autoplay policy or no AudioContext).
 */
export function playTimerDing() {
  try {
    const Ctx: typeof AudioContext | undefined =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const t0 = ctx.currentTime

    for (let round = 0; round < ROUNDS; round++) {
      const base = t0 + round * ROUND_GAP
      for (let strike = 0; strike < 3; strike++) {
        const at = base + strike * STRIKE_GAP
        // each strike is a bright two-partial bell (E6 + B6)
        for (const freq of [1318.5, 1975.5]) {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = 'sine'
          osc.frequency.value = freq
          gain.gain.setValueAtTime(0.0001, at)
          gain.gain.exponentialRampToValueAtTime(0.3, at + 0.008)
          gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.45)
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.start(at)
          osc.stop(at + 0.5)
        }
      }
    }

    window.setTimeout(() => {
      ctx.close().catch(() => {})
    }, (ROUNDS - 1) * ROUND_GAP * 1000 + 1700)
  } catch {
    // audio not available — ignore
  }
}
