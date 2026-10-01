import { useState, useEffect, useCallback, useRef } from 'react'
import { Audio, AVPlaybackStatus } from 'expo-av'
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
    looping: true,
    isAmbient: false,
  })

  const soundRef = useRef<Audio.Sound | null>(null)
  const mountedRef = useRef(true)
  const loopingRef = useRef(true)
  const volumeRef = useRef(1)

  const set = useCallback((patch: Partial<PlayerState>) => {
    if (mountedRef.current) setState((s) => ({ ...s, ...patch }))
  }, [])

  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!mountedRef.current) return
    if (status.isLoaded) {
      set({
        position: status.positionMillis ?? 0,
        duration: status.durationMillis ?? 0,
        playing: status.isPlaying,
      })
      if (status.didJustFinish && !status.isLooping) {
        set({ playing: false, position: 0 })
      }
    }
  }, [set])

  const unload = async () => {
    if (soundRef.current) {
      const s = soundRef.current
      soundRef.current = null
      try {
        await s.stopAsync()
        await s.unloadAsync()
      } catch {}
    }
  }

  const load = async (track: AudioTrack) => {
    await unload()
    const isAmbient = track.kind === 'preset'
    set({ track, position: 0, duration: 0, playing: false, isAmbient })

    try {
      let source: any = null
      if (isAmbient && track.presetId) {
        source = ambient.PRESET_AUDIO_SOURCES[track.presetId as ambient.SoundType]
      } else if (track.uri) {
        source = { uri: track.uri }
      }

      if (!source) return

      const { sound, status } = await Audio.Sound.createAsync(
        source,
        {
          shouldPlay: true,
          volume: volumeRef.current,
          isLooping: loopingRef.current,
        },
        onPlaybackStatusUpdate
      )

      soundRef.current = sound
      if (status.isLoaded) {
        set({
          duration: status.durationMillis ?? 0,
          position: status.positionMillis ?? 0,
          playing: status.isPlaying,
        })
      }
    } catch (e: any) {
      Alert.alert('Playback error', e?.message ?? 'Could not play audio track')
      set({ track: null, playing: false })
    }
  }

  const toggle = async () => {
    const s = soundRef.current
    if (!s) {
      if (state.track) await load(state.track)
      return
    }
    try {
      if (state.playing) {
        await s.pauseAsync()
        set({ playing: false })
      } else {
        await s.playAsync()
        set({ playing: true })
      }
    } catch (e: any) {
      Alert.alert('Playback error', e?.message ?? 'Could not toggle playback')
    }
  }

  const seek = async (positionMillis: number) => {
    const s = soundRef.current
    if (!s) return
    try {
      await s.setPositionAsync(positionMillis)
      set({ position: positionMillis })
    } catch {}
  }

  const setLooping = async (looping: boolean) => {
    loopingRef.current = looping
    set({ looping })
    const s = soundRef.current
    if (s) {
      try {
        await s.setIsLoopingAsync(looping)
      } catch {}
    }
  }

  const setVolume = async (volume: number) => {
    const clamped = Math.max(0, Math.min(1, volume))
    volumeRef.current = clamped
    set({ volume: clamped })
    const s = soundRef.current
    if (s) {
      try {
        await s.setVolumeAsync(clamped)
      } catch {}
    }
  }

  const stop = async () => {
    await unload()
    set({ track: null, playing: false, position: 0, duration: 0, isAmbient: false })
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {})
      }
    }
  }, [])

  return { state, load, toggle, seek, setLooping, setVolume, stop }
}