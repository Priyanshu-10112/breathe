import AsyncStorage from '@react-native-async-storage/async-storage'

const KEYS = {
  journal: 'breathe_journal_entries',
  audio: 'breathe_audio_tracks',
  drawings: 'breathe_drawing_index',
  settings: 'breathe_settings',
} as const

type Key = keyof typeof KEYS
type KeyValue = typeof KEYS[Key]

export async function readJson<T>(key: Key | KeyValue, fallback: T): Promise<T> {
  try {
    const actualKey = key in KEYS ? KEYS[key as Key] : key
    const raw = await AsyncStorage.getItem(actualKey)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export async function writeJson<T>(key: Key | KeyValue, value: T): Promise<void> {
  try {
    const actualKey = key in KEYS ? KEYS[key as Key] : key
    await AsyncStorage.setItem(actualKey, JSON.stringify(value))
  } catch {}
}

export const SETTINGS_KEY = KEYS.settings
export const JOURNAL_KEY = KEYS.journal
export const AUDIO_KEY = KEYS.audio
export const DRAWING_KEY = KEYS.drawings

export const settings = {
  get: () => readJson<Record<string, unknown>>(KEYS.settings, {}),
  set: (v: Record<string, unknown>) => writeJson(KEYS.settings, v),
}

// --- Drawing index ---------------------------------------------------------
// Each drawing is a page. We keep a compact index in AsyncStorage; the
// per-page data (strokes) lives in the in-memory store and is persisted as
// JSON on save so it survives restarts.
export type DrawingStroke = {
  id: string
  points: { x: number; y: number }[]
  color: string
  size: number
  opacity: number
}

export type DrawingPage = {
  id: string
  strokes: DrawingStroke[]
  createdAt: number
  updatedAt: number
}

export type DrawingIndex = {
  pages: DrawingPage[]
}

export async function readDrawingIndex(): Promise<DrawingIndex> {
  return readJson<DrawingIndex>(DRAWING_KEY, { pages: [] })
}

export async function writeDrawingIndex(index: DrawingIndex): Promise<void> {
  await writeJson(DRAWING_KEY, index)
}

export async function upsertDrawingPage(page: DrawingPage): Promise<void> {
  const idx = await readDrawingIndex()
  const next = idx.pages.filter((p) => p.id !== page.id)
  next.push(page)
  await writeDrawingIndex({ pages: next })
}

export async function deleteDrawingPage(id: string): Promise<void> {
  const idx = await readDrawingIndex()
  await writeDrawingIndex({ pages: idx.pages.filter((p) => p.id !== id) })
}

// --- Audio library ---------------------------------------------------------
export type AudioTrack = {
  id: string
  name: string
  kind: 'preset' | 'upload'
  presetId?: 'rain' | 'waves' | 'bowl'
  uri?: string
  emoji: string
  createdAt: number
}

export async function readAudioLibrary(): Promise<AudioTrack[]> {
  return readJson<AudioTrack[]>(AUDIO_KEY, [])
}

export async function writeAudioLibrary(tracks: AudioTrack[]): Promise<void> {
  await writeJson(AUDIO_KEY, tracks)
}

export async function addAudioTrack(track: AudioTrack): Promise<AudioTrack[]> {
  const lib = await readAudioLibrary()
  const next = [track, ...lib.filter((t) => t.id !== track.id)]
  await writeAudioLibrary(next)
  return next
}

export async function removeAudioTrack(id: string): Promise<AudioTrack[]> {
  const lib = await readAudioLibrary()
  const next = lib.filter((t) => t.id !== id)
  await writeAudioLibrary(next)
  return next
}