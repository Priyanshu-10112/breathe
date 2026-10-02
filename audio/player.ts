import { useState, useEffect, useCallback } from 'react'
import {
  useAudioPlayer as useExpoAudioPlayer,
  useAudioPlayerStatus,
  setAudioModeAsync,
  type AudioPlayer,
} from 'expo-audio'
import { Alert } from 'react-native'
import * as ambient from './ambient'
import type { AudioTrack } from '../data/storage'

type PlayerState = {
  track: AudioTrack | null
  volume: number
  looping: boolean
}

/**
 * Wraps expo-audio's useAudioPlayer into the same API shape the UI expects.
 * Position/duration come from useAudioPlayerStatus (in seconds → converted to ms).
 */
export function useAudioPlayer() {
  const [state, setState] = useState<PlayerState>({
    track: null,
    volume: 1,
    looping: true,
  })

  const set = useCallback((patch: Partial<PlayerState>) => {
    setState((s) => ({ ...s, ...patch }))
  }, [])

  // Single persistent player, source swapped via player.replace()
  const player: AudioPlayer = useExpoAudioPlayer(null, { updateInterval: 250 })
  const status = useAudioPlayerStatus(player)

  // Sync volume whenever it changes
  useEffect(() => {
    player.volume = state.volume
  }, [state.volume, player])

  // Sync loop whenever it changes
  useEffect(() => {
    player.loop = state.looping
  }, [state.looping, player])

  // Configure audio session once on mount
  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'mixWithOthers',
    }).catch(() => {})
  }, [])

  const load = useCallback(async (track: AudioTrack): Promise<void> => {
    try {
      let source: any = null
      if (track.kind === 'preset' && track.presetId) {
        source = ambient.PRESET_AUDIO_SOURCES[track.presetId as ambient.SoundType]
      } else if (track.uri) {
        source = { uri: track.uri }
      }

      if (!source) return

      // replace() swaps the audio source and player continues from the new source
      player.replace(source)
      player.loop = state.looping
      player.volume = state.volume
      player.play()

      set({ track })
    } catch (e: any) {
      Alert.alert('Playback error', e?.message ?? 'Could not play audio track')
    }
  }, [player, state.looping, state.volume, set])

  const toggle = useCallback(async (): Promise<void> => {
    if (!state.track) return
    if (status.playing) {
      player.pause()
    } else {
      player.play()
    }
  }, [player, state.track, status.playing])

  const seek = useCallback(async (positionMillis: number): Promise<void> => {
    try {
      await player.seekTo(positionMillis / 1000) // expo-audio works in seconds
    } catch {}
  }, [player])

  const setLooping = useCallback((looping: boolean): void => {
    player.loop = looping
    set({ looping })
  }, [player, set])

  const setVolume = useCallback((volume: number): void => {
    const clamped = Math.max(0, Math.min(1, volume))
    player.volume = clamped
    set({ volume: clamped })
  }, [player, set])

  const stop = useCallback(async (): Promise<void> => {
    player.pause()
    try { await player.seekTo(0) } catch {}
    set({ track: null })
  }, [player, set])

  // Expose unified state — UI uses milliseconds for position/duration
  const combinedState = {
    track: state.track,
    playing: status.playing,
    position: (status.currentTime ?? 0) * 1000,
    duration: (status.duration ?? 0) * 1000,
    volume: state.volume,
    looping: state.looping,
    isAmbient: state.track?.kind === 'preset',
  }

  return { state: combinedState, load, toggle, seek, setLooping, setVolume, stop }
}
