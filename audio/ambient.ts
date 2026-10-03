// Procedural ambient sound generator.
// Generates on the fly via the Web Audio API (web only).
// On native, falls back to bundled WAV assets via expo-audio.

export type SoundType = 'rain' | 'waves' | 'bowl' | 'forest' | 'wind' | 'fire' | 'stream' | 'crickets'

export interface AmbientTrack {
  id: SoundType
  name: string
  emoji: string
  description: string
}

export const PRESETS: AmbientTrack[] = [
  { id: 'rain',     name: 'Rain',          emoji: '🌧️', description: 'Steady gentle rain' },
  { id: 'waves',    name: 'Ocean Waves',   emoji: '🌊', description: 'Soft ocean waves' },
  { id: 'bowl',     name: 'Singing Bowl',  emoji: '🪔', description: 'Resonant bowl tone' },
  { id: 'forest',   name: 'Forest',        emoji: '🌲', description: 'Birds & rustling leaves' },
  { id: 'wind',     name: 'Wind',          emoji: '💨', description: 'Gentle breeze' },
  { id: 'fire',     name: 'Campfire',      emoji: '🔥', description: 'Crackling fire' },
  { id: 'stream',   name: 'Stream',        emoji: '💧', description: 'Flowing water' },
  { id: 'crickets', name: 'Night Crickets',emoji: '🦗', description: 'Peaceful summer night' },
]

export const PRESET_AUDIO_SOURCES: Record<SoundType, any> = {
  rain:     require('../assets/audio/rain.wav'),
  waves:    require('../assets/audio/waves.wav'),
  bowl:     require('../assets/audio/bowl.wav'),
  forest:   require('../assets/audio/rain.wav'),    // fallback on native — same file, different synth on web
  wind:     require('../assets/audio/waves.wav'),
  fire:     require('../assets/audio/rain.wav'),
  stream:   require('../assets/audio/waves.wav'),
  crickets: require('../assets/audio/bowl.wav'),
}

// ---------------------------------------------------------------------------
// Web Audio synthesis
// ---------------------------------------------------------------------------
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

// Pink noise approximation (smoother than white)
function pinkNoiseBuffer(c: AudioContext, dur: number) {
  const len = Math.floor(c.sampleRate * dur)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  let b0=0, b1=0, b2=0, b3=0, b4=0, b5=0
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1
    b0 = 0.99886*b0 + w*0.0555179; b1 = 0.99332*b1 + w*0.0750759
    b2 = 0.96900*b2 + w*0.1538520; b3 = 0.86650*b3 + w*0.3104856
    b4 = 0.55000*b4 + w*0.5329522; b5 = -0.7616*b5 - w*0.0168980
    data[i] = (b0+b1+b2+b3+b4+b5+w*0.5362) * 0.11
  }
  return buf
}

export function startAmbient(type: SoundType) {
  const c = ensureCtx()
  if (!c || !master) return
  stopAmbient()
  const now = c.currentTime

  // ── Rain ──────────────────────────────────────────────────────────────────
  if (type === 'rain') {
    const src = c.createBufferSource()
    src.buffer = noiseBuffer(c, 2)
    src.loop = true
    const filter = c.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 900
    const gain = c.createGain()
    gain.gain.value = 0.5
    src.connect(filter).connect(gain).connect(master)
    src.start(now)
    nodes.push(src, filter, gain)

  // ── Ocean Waves ───────────────────────────────────────────────────────────
  } else if (type === 'waves') {
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
    src.connect(filter).connect(gain).connect(master)
    src.start(now); lfo.start(now)
    nodes.push(src, filter, lfo, lfoGain, gain)

  // ── Singing Bowl ──────────────────────────────────────────────────────────
  } else if (type === 'bowl') {
    const osc = c.createOscillator(); osc.type = 'sine'; osc.frequency.value = 210
    const osc2 = c.createOscillator(); osc2.type = 'sine'; osc2.frequency.value = 420
    const gain = c.createGain(); gain.gain.value = 0.18
    osc.connect(gain).connect(master); osc2.connect(gain)
    const env = c.createGain(); env.gain.value = 0
    gain.connect(env).connect(master)
    osc.start(now); osc2.start(now)
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

  // ── Forest (birds + leaf rustle) ──────────────────────────────────────────
  } else if (type === 'forest') {
    // Base rustle — pink noise highpass
    const rustle = c.createBufferSource()
    rustle.buffer = pinkNoiseBuffer(c, 3)
    rustle.loop = true
    const rustleFilter = c.createBiquadFilter()
    rustleFilter.type = 'highpass'; rustleFilter.frequency.value = 1800
    const rustleGain = c.createGain(); rustleGain.gain.value = 0.15
    rustle.connect(rustleFilter).connect(rustleGain).connect(master)
    rustle.start(now)

    // Bird chirps — short sine bursts
    const chirp = () => {
      if (!c || !master) return
      const t = c.currentTime
      const bird = c.createOscillator()
      bird.type = 'sine'
      bird.frequency.setValueAtTime(2200 + Math.random()*800, t)
      bird.frequency.linearRampToValueAtTime(3000 + Math.random()*600, t + 0.08)
      const bEnv = c.createGain(); bEnv.gain.setValueAtTime(0, t)
      bEnv.gain.linearRampToValueAtTime(0.12, t + 0.02)
      bEnv.gain.linearRampToValueAtTime(0, t + 0.12)
      bird.connect(bEnv).connect(master!)
      bird.start(t); bird.stop(t + 0.15)
    }
    chirp()
    const chirpInterval = setInterval(chirp, 800 + Math.random()*1200)
    ;(nodes as any).__forestInterval = chirpInterval
    nodes.push(rustle, rustleFilter, rustleGain)

  // ── Wind ──────────────────────────────────────────────────────────────────
  } else if (type === 'wind') {
    const src = c.createBufferSource()
    src.buffer = pinkNoiseBuffer(c, 4)
    src.loop = true
    const filter = c.createBiquadFilter()
    filter.type = 'bandpass'; filter.frequency.value = 400; filter.Q.value = 0.5
    // Slow LFO for gusts
    const lfo = c.createOscillator(); lfo.frequency.value = 0.04
    const lfoG = c.createGain(); lfoG.gain.value = 0.25
    lfo.connect(lfoG)
    const gain = c.createGain(); gain.gain.value = 0.3
    lfoG.connect(gain.gain)
    src.connect(filter).connect(gain).connect(master)
    src.start(now); lfo.start(now)
    nodes.push(src, filter, lfo, lfoG, gain)

  // ── Campfire ──────────────────────────────────────────────────────────────
  } else if (type === 'fire') {
    // Crackle = shaped noise bursts
    const crackle = c.createBufferSource()
    crackle.buffer = noiseBuffer(c, 1)
    crackle.loop = true
    const crackleFilter = c.createBiquadFilter()
    crackleFilter.type = 'bandpass'; crackleFilter.frequency.value = 1200; crackleFilter.Q.value = 0.8
    const crackleGain = c.createGain(); crackleGain.gain.value = 0.3
    crackle.connect(crackleFilter).connect(crackleGain).connect(master)
    crackle.start(now)

    // Low rumble base
    const base = c.createBufferSource()
    base.buffer = pinkNoiseBuffer(c, 2)
    base.loop = true
    const baseFilter = c.createBiquadFilter()
    baseFilter.type = 'lowpass'; baseFilter.frequency.value = 300
    const baseGain = c.createGain(); baseGain.gain.value = 0.2
    base.connect(baseFilter).connect(baseGain).connect(master)
    base.start(now)
    nodes.push(crackle, crackleFilter, crackleGain, base, baseFilter, baseGain)

  // ── Stream ────────────────────────────────────────────────────────────────
  } else if (type === 'stream') {
    // Babbling water — high freq noise + multiple modulated filters
    const src = c.createBufferSource()
    src.buffer = noiseBuffer(c, 2)
    src.loop = true

    const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 800; f1.Q.value = 1
    const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1400; f2.Q.value = 1.5
    const f3 = c.createBiquadFilter(); f3.type = 'highpass'; f3.frequency.value = 600

    // Modulate f1 for "babbling"
    const lfo1 = c.createOscillator(); lfo1.frequency.value = 0.6
    const lfoG1 = c.createGain(); lfoG1.gain.value = 200
    lfo1.connect(lfoG1).connect(f1.frequency)

    const mix = c.createGain(); mix.gain.value = 0.35
    src.connect(f3).connect(f1).connect(mix).connect(master)
    src.connect(f3).connect(f2).connect(mix)
    src.start(now); lfo1.start(now)
    nodes.push(src, f1, f2, f3, lfo1, lfoG1, mix)

  // ── Night Crickets ────────────────────────────────────────────────────────
  } else if (type === 'crickets') {
    // Constant cricket chirp — rapid AM modulation of a sine
    const carrier = c.createOscillator()
    carrier.type = 'sine'
    carrier.frequency.value = 4200

    const am = c.createOscillator()
    am.frequency.value = 18  // chirp rate ~18Hz
    const amGain = c.createGain(); amGain.gain.value = 0.5

    const outGain = c.createGain(); outGain.gain.value = 0.15

    am.connect(amGain).connect(outGain.gain)
    carrier.connect(outGain).connect(master)
    carrier.start(now); am.start(now)

    // Second layer — slightly different pitch for texture
    const carrier2 = c.createOscillator()
    carrier2.type = 'sine'; carrier2.frequency.value = 4350
    const am2 = c.createOscillator(); am2.frequency.value = 20
    const amGain2 = c.createGain(); amGain2.gain.value = 0.4
    const outGain2 = c.createGain(); outGain2.gain.value = 0.1
    am2.connect(amGain2).connect(outGain2.gain)
    carrier2.connect(outGain2).connect(master)
    carrier2.start(now); am2.start(now)

    nodes.push(carrier, am, amGain, outGain, carrier2, am2, amGain2, outGain2)
  }
}

export function stopAmbient() {
  if ((nodes as any).__bowlInterval) {
    clearInterval((nodes as any).__bowlInterval)
    delete (nodes as any).__bowlInterval
  }
  if ((nodes as any).__forestInterval) {
    clearInterval((nodes as any).__forestInterval)
    delete (nodes as any).__forestInterval
  }
  nodes.forEach((n) => {
    try { if ('stop' in n) (n as any).stop() } catch {}
    try { n.disconnect() } catch {}
  })
  nodes = []
}

export function setAmbientVolume(v: number) {
  if (master) master.gain.value = v
}
