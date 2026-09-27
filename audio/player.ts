import { useState, useEffect, useCallback, useRef } from 'react'
import { Audio } from 'expo-av'
import { Alert } from 'react-native'
import * as ambient from './ambient'
import type { AudioTrack } from '../data/storage'

type PlayerState = {
  track: AudioTrack | null
  playing: boolean
  position: number // ms
  duration: number // ms
  volume: number
  looping: boolean
  isAmbient: boolean
}

export function useAudioPlayer() {
  const [state, setState] = useState<PlayerState>({
    track: null,
    playing: false,
    position: 0,
    duration: 0,
    volume: 1,
    looping: false,
    isAmbient: false,
  })

  const soundRef = useRef<Audio.Sound | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)
  const loopingRef = useRef(false)

  const set = useCallback((patch: Partial<PlayerState>) => {
    if (mountedRef.current) setState((s) => ({ ...s, ...patch }))
  }, [])

  const clearPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  const poll = () => {
    clearPoll()
    pollRef.current = setInterval(async () => {
      const s = soundRef.current
      if (!s) return
      try {
        const status = await s.getStatusAsync()
        if (status.isLoaded) {
          set({
            position: status.positionMillis ?? 0,
            duration: status.durationMillis ?? 0,
            playing: status.shouldPlay && !status.isBuffering,
          })
        }
      } catch {}
    }, 500)
  }

  const unload = async () => {
    clearPoll()
    if (soundRef.current) {
      try { await soundRef.current.unloadAsync() } catch {}
      soundRef.current = null
    }
  }

  const load = async (track: AudioTrack) => {
    await unload()
    set({ track, position: 0, duration: 0, playing: false })

    if (track.kind === 'preset') {
      // Ambient presets are generated live via the Web Audio API on web.
      // On native there is no generator, so they are a no-op here.
      set({ isAmbient: true })
      return
    }

    if (!track.uri) return
    set({ isAmbient: false })
    try {
      const { sound, status } = await Audio.Sound.createAsync(
        { uri: track.uri },
        { shouldPlay: false, volume: state.volume, isLooping: loopingRef.current }
      )
      soundRef.current = sound
      if (status.isLoaded) {
        set({ duration: status.durationMillis ?? 0 })
      }
    } catch (e: any) {
      Alert.alert('Could not play track', e?.message ?? 'Unknown error')
      set({ track: null })
    }
  }

  const toggle = async () => {
    const t = state.track
    if (!t) return
    if (t.kind === 'preset') {
      if (state.playing) {
        ambient.stopAmbient()
        set({ playing: false })
      } else {
        ambient.startAmbient(t.presetId!)
        set({ playing: true })
      }
      return
    }
    const s = soundRef.current
    if (!s) return
    try {
      if (state.playing) {
        await s.pauseAsync()
        set({ playing: false })
      } else {
        await s.playAsync()
        set({ playing: true })
        poll()
      }
    } catch (e: any) {
      Alert.alert('Playback error', e?.message ?? 'Unknown error')
    }
  }

  const seek = async (positionMillis: number) => {
    const s = soundRef.current
    if (!s) return
    try {
      await s.setStatusAsync({ positionMillis })
      set({ position: positionMillis })
    } catch {}
  }

  const setLooping = async (looping: boolean) => {
    loopingRef.current = looping
    set({ looping })
    const s = soundRef.current
    if (s) {
      try { await s.setStatusAsync({ isLooping: looping }) } catch {}
    }
  }

  const setVolume = async (volume: number) => {
    set({ volume })
    const s = soundRef.current
    if (s) {
      try { await s.setVolumeAsync(volume) } catch {}
    }
    if (state.isAmbient) ambient.setAmbientVolume(volume)
  }

  const stop = async () => {
    if (state.track?.kind === 'preset') {
      ambient.stopAmbient()
    }
    await unload()
    set({ track: null, playing: false, position: 0, duration: 0, isAmbient: false })
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearPoll()
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {})
      }
    }
  }, [])

  return { state, load, toggle, seek, setLooping, setVolume, stop }
}