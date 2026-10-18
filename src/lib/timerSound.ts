/**
 * A short, bright mechanical "ring" for the kitchen timer — a few quick bell
 * strikes synthesized with the Web Audio API (no asset file needed). Silently
 * no-ops if audio is unavailable (e.g. autoplay policy or no AudioContext).
 */
export function playTimerDing() {
  try {
    const Ctx: typeof AudioContext | undefined =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const t0 = ctx.currentTime

    // three quick strikes, each a bright two-partial bell (E6 + B6)
    for (let i = 0; i < 3; i++) {
      const at = t0 + i * 0.16
      for (const freq of [1318.5, 1975.5]) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.0001, at)
        gain.gain.exponentialRampToValueAtTime(0.28, at + 0.008)
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.45)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(at)
        osc.stop(at + 0.5)
      }
    }

    window.setTimeout(() => {
      ctx.close().catch(() => {})
    }, 1600)
  } catch {
    // audio not available — ignore
  }
}
