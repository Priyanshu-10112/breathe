import { View, Text, Pressable, ScrollView, StyleSheet, Alert, Modal } from 'react-native'
import { useState, useEffect } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as DocumentPicker from 'expo-document-picker'
import { setAudioModeAsync } from 'expo-audio'
import { useAudioPlayer } from '../../audio/player'
import { PRESETS } from '../../audio/ambient'
import { readAudioLibrary, addAudioTrack, removeAudioTrack, AudioTrack } from '../../data/storage'
import { colors } from '../../theme'

export default function AudioScreen() {
  const [library, setLibrary] = useState<AudioTrack[]>([])
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progressWidth, setProgressWidth] = useState(200)
  const [volumeWidth, setVolumeWidth] = useState(200)
  const { state, load, toggle, seek, setLooping, setVolume, stop } = useAudioPlayer()

  useEffect(() => {
    let isMounted = true
    readAudioLibrary().then((tracks) => {
      if (isMounted) setLibrary(tracks)
    })

    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'mixWithOthers',
    }).catch(() => {})

    return () => {
      isMounted = false
    }
  }, [])

  const handlePresetPress = async (preset: typeof PRESETS[0]) => {
    const track = library.find((t) => t.kind === 'preset' && t.presetId === preset.id)
    if (!track) return

    if (state.track?.id === track.id) {
      await toggle()
    } else {
      await load(track)
    }
  }

  const handleUploadPress = async (track: AudioTrack) => {
    if (state.track?.id === track.id) {
      await toggle()
    } else {
      await load(track)
    }
  }

  const handleUploadNew = async () => {
    try {
      setUploading(true)
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      })
      if (result.canceled) return

      const asset = result.assets?.[0]
      const uri = asset?.uri
      if (!uri) return

      const newTrack: AudioTrack = {
        id: Date.now().toString(),
        name: asset.name || 'Uploaded Track',
        kind: 'upload',
        uri,
        emoji: '📁',
        createdAt: Date.now(),
      }

      const updated = await addAudioTrack(newTrack)
      setLibrary(updated)
      setShowUploadModal(false)
      await load(newTrack)
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Could not pick audio file')
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteTrack = async (id: string) => {
    Alert.alert('Delete track?', 'This cannot be undone.', [
      { text: 'Cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const updated = await removeAudioTrack(id)
          setLibrary(updated)
          if (state.track?.id === id) await stop()
        },
      },
    ])
  }

  const formatTime = (ms: number) => {
    if (!ms || ms <= 0) return '0:00'
    const total = Math.floor(ms / 1000)
    const m = Math.floor(total / 60)
    const s = total % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  const isCurrentTrack = (track: AudioTrack) => {
    return state.track?.id === track.id
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Sound Library</Text>
        <Pressable onPress={() => setShowUploadModal(true)} style={styles.addBtn}>
          <Text style={styles.addBtnText}>＋</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Preset sounds */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Presets</Text>
          <View style={styles.grid}>
            {PRESETS.map((preset) => {
              const track = library.find((t) => t.kind === 'preset' && t.presetId === preset.id)
              const isActive = track ? isCurrentTrack(track) : false
              const isPlaying = isActive && state.playing

              return (
                <Pressable
                  key={preset.id}
                  onPress={() => handlePresetPress(preset)}
                  style={[
                    styles.presetCard,
                    isActive && styles.presetCardActive,
                  ]}
                >
                  <Text style={styles.presetEmoji}>{preset.emoji}</Text>
                  <Text style={styles.presetName}>{preset.name}</Text>
                  <Text style={styles.presetDesc}>{preset.description}</Text>
                  <View style={styles.presetStatus}>
                    <Ionicons
                      name={isPlaying ? 'pause-circle' : isActive ? 'play-circle' : 'volume-medium-outline'}
                      size={24}
                      color={isActive ? colors.brand : colors.muted}
                    />
                  </View>
                </Pressable>
              )
            })}
          </View>
        </View>

        {/* Uploaded sounds */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your Sounds</Text>
            {library.filter((t) => t.kind === 'upload').length === 0 && (
              <Pressable onPress={() => setShowUploadModal(true)} style={styles.addInline}>
                <Text style={styles.addInlineText}>＋ Add sound</Text>
              </Pressable>
            )}
          </View>

          {library.filter((t) => t.kind === 'upload').length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🎵</Text>
              <Text style={styles.emptyTitle}>No uploaded sounds</Text>
              <Text style={styles.emptySub}>
                Tap ＋ to add your own audio files (MP3, WAV, M4A)
              </Text>
            </View>
          ) : (
            <View style={styles.list}>
              {library
                .filter((t) => t.kind === 'upload')
                .map((track) => {
                  const isActive = isCurrentTrack(track)
                  const isPlaying = isActive && state.playing
                  return (
                    <Pressable
                      key={track.id}
                      onPress={() => handleUploadPress(track)}
                      onLongPress={() => handleDeleteTrack(track.id)}
                      style={[styles.uploadCard, isActive && styles.uploadCardActive]}
                    >
                      <View style={styles.uploadLeft}>
                        <Text style={styles.uploadEmoji}>{track.emoji}</Text>
                        <View style={styles.uploadTextContainer}>
                          <Text style={styles.uploadName} numberOfLines={1}>
                            {track.name}
                          </Text>
                          <Text style={styles.uploadMeta}>
                            {isActive
                              ? `${formatTime(state.position)} / ${formatTime(state.duration)}`
                              : 'Tap to play · Long press to delete'}
                          </Text>
                        </View>
                      </View>
                      <Ionicons
                        name={isPlaying ? 'pause-circle' : 'play-circle'}
                        size={28}
                        color={isActive ? colors.brand : colors.muted}
                      />
                    </Pressable>
                  )
                })}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Floating Now Playing Bar */}
      {state.track && (
        <View style={styles.player}>
          <View style={styles.playerTrack}>
            <Text style={styles.playerEmoji}>{state.track.emoji || '🎵'}</Text>
            <View style={styles.playerInfo}>
              <Text style={styles.playerName} numberOfLines={1}>
                {state.track.name}
              </Text>
              <Text style={styles.playerType}>
                {state.track.kind === 'preset' ? 'Ambient Sound' : 'User Sound'}
              </Text>
            </View>
            <Pressable onPress={stop} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={colors.inkSoft} />
            </Pressable>
          </View>

          {/* Progress bar with seek */}
          <View style={styles.progressContainer}>
            <Text style={styles.timeText}>{formatTime(state.position)}</Text>
            <Pressable
              style={styles.progressBar}
              onLayout={(e) => setProgressWidth(e.nativeEvent.layout.width)}
              onPress={(e) => {
                if (state.duration > 0 && progressWidth > 0) {
                  const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / progressWidth))
                  seek(ratio * state.duration)
                }
              }}
            >
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${state.duration > 0 ? (state.position / state.duration) * 100 : 0}%`,
                  },
                ]}
              />
            </Pressable>
            <Text style={styles.timeText}>{formatTime(state.duration)}</Text>
          </View>

          {/* Controls */}
          <View style={styles.playerControls}>
            <Pressable
              onPress={() => setLooping(!state.looping)}
              style={[styles.controlBtn, state.looping && styles.controlBtnActive]}
            >
              <Ionicons
                name="repeat"
                size={22}
                color={state.looping ? colors.brand : colors.inkSoft}
              />
            </Pressable>

            <Pressable onPress={toggle} style={styles.playBtn}>
              <Ionicons
                name={state.playing ? 'pause' : 'play'}
                size={28}
                color={colors.white}
              />
            </Pressable>

            <Pressable onPress={stop} style={styles.controlBtn}>
              <Ionicons name="stop" size={22} color={colors.inkSoft} />
            </Pressable>
          </View>

          {/* Volume slider */}
          <View style={styles.volumeContainer}>
            <Pressable onPress={() => setVolume(Math.max(0, state.volume - 0.2))}>
              <Ionicons name="volume-low" size={18} color={colors.inkSoft} />
            </Pressable>
            <Pressable
              style={styles.volumeSlider}
              onLayout={(e) => setVolumeWidth(e.nativeEvent.layout.width)}
              onPress={(e) => {
                if (volumeWidth > 0) {
                  setVolume(Math.max(0, Math.min(1, e.nativeEvent.locationX / volumeWidth)))
                }
              }}
            >
              <View
                style={[
                  styles.volumeFill,
                  { width: `${state.volume * 100}%` },
                ]}
              />
            </Pressable>
            <Pressable onPress={() => setVolume(Math.min(1, state.volume + 0.2))}>
              <Ionicons name="volume-high" size={18} color={colors.inkSoft} />
            </Pressable>
          </View>
        </View>
      )}

      {/* Upload Modal */}
      <Modal visible={showUploadModal} animationType="slide" transparent={true}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowUploadModal(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Add Sound</Text>
            <Text style={styles.modalSub}>
              Pick an audio file from your device. Supports MP3, WAV, M4A, and more.
            </Text>
            <View style={styles.modalButtons}>
              <Pressable onPress={() => setShowUploadModal(false)} style={styles.modalBtnCancel}>
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleUploadNew}
                style={styles.modalBtnConfirm}
                disabled={uploading}
              >
                <Text style={styles.modalBtnConfirmText}>
                  {uploading ? 'Adding...' : 'Pick File'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerTitle: { fontSize: 26, fontWeight: '700', color: colors.ink },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { color: colors.white, fontSize: 24, lineHeight: 26, fontWeight: '300' },
  content: { padding: 20, gap: 24, paddingBottom: 220 },
  section: { gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  addInline: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: colors.brandSoft },
  addInlineText: { color: colors.brand, fontWeight: '600', fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  presetCard: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  presetCardActive: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  presetEmoji: { fontSize: 34, marginBottom: 6 },
  presetName: { fontSize: 16, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  presetDesc: { fontSize: 12, color: colors.inkSoft, textAlign: 'center', marginTop: 2, lineHeight: 16 },
  presetStatus: { marginTop: 8 },
  list: { gap: 10 },
  uploadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1,
  },
  uploadCardActive: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  uploadLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  uploadEmoji: { fontSize: 26 },
  uploadTextContainer: { flex: 1 },
  uploadName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  uploadMeta: { fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  empty: { alignItems: 'center', padding: 32, gap: 8 },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: colors.ink },
  emptySub: { fontSize: 13, color: colors.inkSoft, textAlign: 'center' },

  /* Player Dock */
  player: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingHorizontal: 20,
    paddingVertical: 14,
    paddingBottom: 20,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
  },
  playerTrack: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  playerEmoji: { fontSize: 24 },
  playerInfo: { flex: 1 },
  playerName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  playerType: { fontSize: 11, color: colors.inkSoft },
  closeBtn: { padding: 4 },
  progressContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  timeText: { fontSize: 11, color: colors.inkSoft, fontFamily: 'monospace', minWidth: 36 },
  progressBar: { flex: 1, height: 16, justifyContent: 'center' },
  progressFill: { height: 4, backgroundColor: colors.brand, borderRadius: 2 },
  playerControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28, marginBottom: 10 },
  controlBtn: { padding: 6 },
  controlBtnActive: { opacity: 1 },
  playBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  volumeContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10 },
  volumeSlider: { flex: 1, height: 16, justifyContent: 'center' },
  volumeFill: { height: 4, backgroundColor: colors.brand, borderRadius: 2 },

  /* Modal */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(43,38,34,0.4)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
    gap: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  modalSub: { fontSize: 14, color: colors.inkSoft, textAlign: 'center', lineHeight: 20 },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalBtnCancel: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.line, alignItems: 'center' },
  modalBtnCancelText: { color: colors.ink, fontWeight: '600', fontSize: 15 },
  modalBtnConfirm: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center' },
  modalBtnConfirmText: { color: colors.white, fontWeight: '600', fontSize: 15 },
})