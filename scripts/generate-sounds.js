/**
 * Generates procedural ambient WAV files for the Breathe app.
 * Each sound is distinctly different — no repeats.
 * Run: node scripts/generate-sounds.js
 */

const fs = require('fs')
const path = require('path')

const SAMPLE_RATE = 44100
const DURATION = 8 // seconds — long enough to loop seamlessly
const OUT_DIR = path.join(__dirname, '..', 'assets', 'audio')

// ---------------------------------------------------------------------------
// WAV writer
// ---------------------------------------------------------------------------
function writeWav(filename, samples) {
  const numSamples = samples.length
  const byteRate = SAMPLE_RATE * 2
  const blockAlign = 2
  const dataSize = numSamples * 2

  const buf = Buffer.alloc(44 + dataSize)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataSize, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)        // chunk size
  buf.writeUInt16LE(1, 20)         // PCM
  buf.writeUInt16LE(1, 22)         // mono
  buf.writeUInt32LE(SAMPLE_RATE, 24)
  buf.writeUInt32LE(byteRate, 28)
  buf.writeUInt16LE(blockAlign, 32)
  buf.writeUInt16LE(16, 34)        // bits per sample
  buf.write('data', 36)
  buf.writeUInt32LE(dataSize, 40)

  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2)
  }

  const outPath = path.join(OUT_DIR, filename)
  fs.writeFileSync(outPath, buf)
  console.log(`✅  ${filename}`)
}

// ---------------------------------------------------------------------------
// Noise generators
// ---------------------------------------------------------------------------
function whiteNoise(n) {
  return Array.from({ length: n }, () => (Math.random() * 2 - 1))
}

function pinkNoise(n) {
  const out = new Float32Array(n)
  let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1
    b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759
    b2=0.96900*b2+w*0.1538520; b3=0.86650*b3+w*0.3104856
    b4=0.55000*b4+w*0.5329522; b5=-0.7616*b5-w*0.0168980
    out[i] = (b0+b1+b2+b3+b4+b5+w*0.5362)*0.11
  }
  return out
}

// Simple one-pole lowpass
function lowpass(samples, freq) {
  const rc = 1.0 / (2 * Math.PI * freq)
  const dt = 1.0 / SAMPLE_RATE
  const a = dt / (rc + dt)
  const out = new Float32Array(samples.length)
  out[0] = samples[0]
  for (let i = 1; i < samples.length; i++) out[i] = out[i-1] + a*(samples[i]-out[i-1])
  return out
}

// Simple one-pole highpass
function highpass(samples, freq) {
  const rc = 1.0 / (2 * Math.PI * freq)
  const dt = 1.0 / SAMPLE_RATE
  const a = rc / (rc + dt)
  const out = new Float32Array(samples.length)
  out[0] = samples[0]
  for (let i = 1; i < samples.length; i++) out[i] = a*(out[i-1]+samples[i]-samples[i-1])
  return out
}

function mix(...arrays) {
  const len = arrays[0].length
  const out = new Float32Array(len)
  for (const arr of arrays) for (let i = 0; i < len; i++) out[i] += arr[i]
  return out
}

function gain(samples, g) {
  return samples.map(s => s * g)
}

function normalize(samples, targetPeak = 0.8) {
  let peak = 0
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i])
    if (a > peak) peak = a
  }
  if (peak === 0) return samples
  const g = targetPeak / peak
  return samples.map(s => s * g)
}

// Fade in+out to avoid clicks on loop
function fadeEnds(samples, ms = 50) {
  const n = Math.floor(SAMPLE_RATE * ms / 1000)
  const out = Float32Array.from(samples)
  for (let i = 0; i < n; i++) {
    const g = i / n
    out[i] *= g
    out[out.length - 1 - i] *= g
  }
  return out
}

// AM modulate with a sine LFO
function amMod(samples, lfoFreq, depth = 0.5) {
  const out = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const lfo = 1 - depth + depth * Math.sin(2 * Math.PI * lfoFreq * i / SAMPLE_RATE)
    out[i] = samples[i] * lfo
  }
  return out
}

// Sine wave
function sine(freq, n, amp = 1) {
  return Float32Array.from({ length: n }, (_, i) => amp * Math.sin(2 * Math.PI * freq * i / SAMPLE_RATE))
}

// ---------------------------------------------------------------------------
// Sound generators
// ---------------------------------------------------------------------------
const N = SAMPLE_RATE * DURATION

function makeRain() {
  // White noise → lowpass 900Hz → slight AM for drizzle variation
  const w = whiteNoise(N)
  const filtered = lowpass(w, 900)
  const modulated = amMod(filtered, 0.3, 0.15)
  return fadeEnds(normalize(modulated, 0.7))
}

function makeWaves() {
  // Pink noise → lowpass 500Hz → slow AM 0.08Hz for wave swell
  const p = pinkNoise(N)
  const filtered = lowpass(p, 500)
  const swelled = amMod(filtered, 0.08, 0.6)
  return fadeEnds(normalize(swelled, 0.75))
}

function makeBowl() {
  // Resonant sine 210Hz + harmonic 420Hz + 630Hz, slow decay envelope repeated
  const n = N
  const out = new Float32Array(n)
  const period = Math.floor(SAMPLE_RATE * 6.5)
  for (let i = 0; i < n; i++) {
    const t = i % period
    const env = Math.exp(-t / (SAMPLE_RATE * 2.5)) * 0.7
    out[i] =
      env * Math.sin(2 * Math.PI * 210 * i / SAMPLE_RATE) * 0.5 +
      env * Math.sin(2 * Math.PI * 420 * i / SAMPLE_RATE) * 0.3 +
      env * Math.sin(2 * Math.PI * 630 * i / SAMPLE_RATE) * 0.15
  }
  return fadeEnds(normalize(out, 0.75))
}

function makeForest() {
  // High-pass pink noise (leaves) + random bird chirps
  const leaves = highpass(pinkNoise(N), 1800)
  const out = Float32Array.from(gain(leaves, 0.15))

  // Scatter ~30 bird chirps across the buffer
  const chirpCount = 30
  for (let c = 0; c < chirpCount; c++) {
    const start = Math.floor(Math.random() * (N - SAMPLE_RATE))
    const baseFreq = 2200 + Math.random() * 1200
    const sweepFreq = baseFreq + 400 + Math.random() * 600
    const chirpLen = Math.floor(SAMPLE_RATE * (0.06 + Math.random() * 0.1))
    for (let i = 0; i < chirpLen; i++) {
      const t = i / chirpLen
      const freq = baseFreq + (sweepFreq - baseFreq) * t
      const env = Math.sin(Math.PI * t) * 0.18
      out[start + i] += env * Math.sin(2 * Math.PI * freq * i / SAMPLE_RATE)
    }
  }
  return fadeEnds(normalize(out, 0.75))
}

function makeWind() {
  // Pink noise bandpass ~400Hz + slow gust LFO 0.04Hz
  const p = pinkNoise(N)
  const lp = lowpass(p, 600)
  const hp = highpass(lp, 200)
  const gusted = amMod(hp, 0.04, 0.7)
  // Add whistle overtone
  const whistle = gain(amMod(sine(650, N), 0.07, 0.6), 0.05)
  const combined = mix(gain(gusted, 0.5), whistle)
  return fadeEnds(normalize(combined, 0.72))
}

function makeFire() {
  // White noise bandpass ~1200Hz (crackle) + low pink noise (rumble)
  const crackle = lowpass(highpass(whiteNoise(N), 800), 2500)
  const rumble = lowpass(pinkNoise(N), 180)
  // Random pops
  const out = Float32Array.from(mix(gain(crackle, 0.35), gain(rumble, 0.25)))
  // Add ~50 random sharp pops
  for (let i = 0; i < 50; i++) {
    const pos = Math.floor(Math.random() * (N - 100))
    const popLen = Math.floor(20 + Math.random() * 60)
    for (let j = 0; j < popLen; j++) {
      const env = Math.exp(-j / 10)
      out[pos + j] += env * (Math.random() * 2 - 1) * 0.4
    }
  }
  return fadeEnds(normalize(out, 0.73))
}

function makeStream() {
  // White noise → multiple bandpass filters (800Hz, 1400Hz, 2200Hz) → mix
  const w = whiteNoise(N)
  const hp = highpass(w, 400)

  // Approximate bandpass by chaining LP + HP at different freqs
  const b1 = lowpass(highpass(w, 600), 1200)
  const b2 = lowpass(highpass(w, 1200), 2200)
  const b3 = lowpass(highpass(w, 2000), 3500)

  // Slow burble modulation on each band
  const m1 = amMod(b1, 0.55, 0.45)
  const m2 = amMod(b2, 0.83, 0.35)
  const m3 = amMod(b3, 1.1, 0.25)

  const combined = mix(gain(m1, 0.4), gain(m2, 0.35), gain(m3, 0.25), gain(hp, 0.05))
  return fadeEnds(normalize(combined, 0.72))
}

function makeCrickets() {
  // Rapidly AM-modulated sine ~4200Hz (chirp ~18Hz) + secondary 4350Hz (20Hz)
  const carrier1 = sine(4200, N)
  const carrier2 = sine(4350, N)
  const out = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    const am1 = 0.5 + 0.5 * Math.sin(2 * Math.PI * 18 * i / SAMPLE_RATE)
    const am2 = 0.5 + 0.5 * Math.sin(2 * Math.PI * 20.5 * i / SAMPLE_RATE)
    // Night ambience: quiet pink noise underneath
    out[i] = carrier1[i] * am1 * 0.22 + carrier2[i] * am2 * 0.16
  }
  // Add quiet background night hum
  const bg = gain(lowpass(pinkNoise(N), 300), 0.04)
  const combined = mix(out, bg)
  return fadeEnds(normalize(combined, 0.65))
}

// ---------------------------------------------------------------------------
// Generate all files
// ---------------------------------------------------------------------------
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

console.log('\n🎵 Generating ambient sounds...\n')

writeWav('rain.wav',     makeRain())
writeWav('waves.wav',    makeWaves())
writeWav('bowl.wav',     makeBowl())
writeWav('forest.wav',   makeForest())
writeWav('wind.wav',     makeWind())
writeWav('fire.wav',     makeFire())
writeWav('stream.wav',   makeStream())
writeWav('crickets.wav', makeCrickets())

console.log('\n✨ Done! All sounds generated in assets/audio/\n')
