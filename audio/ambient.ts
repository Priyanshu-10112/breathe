// Procedural ambient sound generator (rain / waves / singing bowl).
// No bundled assets needed — generates on the fly via the Web Audio API.
// Works on web (AudioContext) and is a no-op on native where we fall back
// to the user's uploaded tracks only.

type SoundType = 'rain' | 'waves' | 'bowl'

export interface AmbientTrack {
  id: SoundType
  name: string
  emoji: string
  description: string
}

export const PRESETS: AmbientTrack[] = [
  { id: 'rain', name: 'Rain', emoji: '🌧️', description: 'Steady gentle rain' },
  { id: 'waves', name: 'Waves', emoji: '🌊', description: 'Soft ocean waves' },
  { id: 'bowl', name: 'Singing Bowl', emoji: '🪔', description: 'Resonant bowl tone' },
]

let ctx: AudioContext | null = null
let nodes: AudioNode[] = []
let master: GainNode | null = null

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!AC) return null
    const newCtx = new AC()
    ctx = newCtx
    const newMaster = newCtx.createGain()
    newMaster.gain.value = 0.35
    newMaster.connect(newCtx.destination)
    master = newMaster
  }
  const c = ctx
  if (!c) return null
  if (c.state === 'suspended') c.resume()
  return c
}

function noiseBuffer(c: AudioContext, dur: number) {
  const len = Math.floor(c.sampleRate * dur)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  return buf
}

export function startAmbient(type: SoundType) {
  const c = ensureCtx()
  if (!c) return
  if (!master) return
  stopAmbient()
  const now = c.currentTime

  if (type === 'rain') {
    const src = c.createBufferSource()
    src.buffer = noiseBuffer(c, 2)
    src.loop = true
    const filter = c.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 900
    const gain = c.createGain()
    gain.gain.value = 0.5
    src.connect(filter).connect(gain).connect(master!)
    src.start(now)
    nodes.push(src, filter, gain)
  } else if (type === 'waves') {
    // Slowly modulated pink-ish noise => surf
    const src = c.createBufferSource()
    src.buffer = noiseBuffer(c, 4)
    src.loop = true
    const filter = c.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 500
    const lfo = c.createOscillator()
    lfo.frequency.value = 0.08
    const lfoGain = c.createGain()
    lfoGain.gain.value = 250
    lfo.connect(lfoGain).connect(filter.frequency)
    const gain = c.createGain()
    gain.gain.value = 0.4
    src.connect(filter).connect(gain).connect(master!)
    src.start(now)
    lfo.start(now)
    nodes.push(src, filter, lfo, lfoGain, gain)
  } else if (type === 'bowl') {
    // Resonant sine with harmonics and a long decay, re-triggered
    const osc = c.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = 210
    const osc2 = c.createOscillator()
    osc2.type = 'sine'
    osc2.frequency.value = 420
    const gain = c.createGain()
    gain.gain.value = 0.18
    osc.connect(gain).connect(master!)
    osc2.connect(gain)
    const env = c.createGain()
    env.gain.value = 0
    gain.connect(env).connect(master!)
    osc.start(now)
    osc2.start(now)
    const pulse = () => {
      const t = c.currentTime
      env.gain.cancelScheduledValues(t)
      env.gain.setValueAtTime(0.0001, t)
      env.gain.exponentialRampToValueAtTime(0.5, t + 0.05)
      env.gain.exponentialRampToValueAtTime(0.0001, t + 6)
    }
    pulse()
    const interval = setInterval(pulse, 6500)
    ;(nodes as any).__bowlInterval = interval
    nodes.push(osc, osc2, gain, env)
  }
}

export function stopAmbient() {
  if ((nodes as any).__bowlInterval) {
    clearInterval((nodes as any).__bowlInterval)
    delete (nodes as any).__bowlInterval
  }
  nodes.forEach((n) => {
    try {
      if ('stop' in n) (n as any).stop()
    } catch {}
    try { n.disconnect() } catch {}
  })
  nodes = []
}

export function setAmbientVolume(v: number) {
  if (master) master.gain.value = v
}