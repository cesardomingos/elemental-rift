/**
 * Efeitos sintéticos (Web Audio API) para feedback imediato, sem ficheiros externos.
 */

let sharedCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    const AC =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    if (!sharedCtx) sharedCtx = new AC()
    if (sharedCtx.state === 'suspended') void sharedCtx.resume()
    return sharedCtx
  } catch {
    return null
  }
}

function scheduleBeep(
  ac: AudioContext,
  when: number,
  freq: number,
  dur: number,
  type: OscillatorType,
  peakGain: number,
) {
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, when)
  g.gain.setValueAtTime(0, when)
  g.gain.linearRampToValueAtTime(peakGain, when + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur)
  osc.connect(g)
  g.connect(ac.destination)
  osc.start(when)
  osc.stop(when + dur + 0.04)
}

/** Dano recebido (baixo, seco). */
export function sfxPlayerDamaged() {
  const ac = getAudioContext()
  if (!ac) return
  const t = ac.currentTime
  scheduleBeep(ac, t, 195, 0.1, 'triangle', 0.14)
  scheduleBeep(ac, t + 0.07, 140, 0.12, 'triangle', 0.09)
}

/** Dano causado ao inimigo (agudo, satisfatório). */
export function sfxEnemyDamaged() {
  const ac = getAudioContext()
  if (!ac) return
  const t = ac.currentTime
  scheduleBeep(ac, t, 720, 0.065, 'sine', 0.11)
  scheduleBeep(ac, t + 0.038, 1080, 0.085, 'sine', 0.09)
  scheduleBeep(ac, t + 0.095, 1380, 0.065, 'triangle', 0.055)
}

/** Câmara vencida ou run completa. */
export function sfxPhaseWon() {
  const ac = getAudioContext()
  if (!ac) return
  const t = ac.currentTime
  const notes = [523.25, 659.25, 783.99, 987.77]
  notes.forEach((f, i) => scheduleBeep(ac, t + i * 0.068, f, 0.15, 'sine', 0.088))
}

/** Câmara perdida (ainda há vidas) ou game over. */
export function sfxPhaseLost() {
  const ac = getAudioContext()
  if (!ac) return
  const t = ac.currentTime
  scheduleBeep(ac, t, 275, 0.15, 'triangle', 0.11)
  scheduleBeep(ac, t + 0.11, 185, 0.2, 'triangle', 0.08)
  scheduleBeep(ac, t + 0.24, 125, 0.3, 'sine', 0.05)
}
