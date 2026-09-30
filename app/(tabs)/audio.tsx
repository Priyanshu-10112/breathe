import { View, Text, Pressable, ScrollView, StyleSheet, Alert, Modal, Platform } from 'react-native'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as DocumentPicker from 'expo-document-picker'
import { Audio } from 'expo-av'
import { useAudioPlayer } from '../../audio/player'
import { PRESETS } from '../../audio/ambient'
import { readAudioLibrary, addAudioTrack, removeAudioTrack } from '../../data/storage'
import { colors, s } from '../../theme'

export default function AudioScreen() {
  const router = useRouter()
  const [library, setLibrary] = useState<Awaited<ReturnType<typeof readAudioLibrary>>>([])
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploading, setUploading] = useState(false)
  const { state, load, toggle, seek, setLooping, setVolume, stop } = useAudioPlayer()

  const loadLibrary = async () => {
    const tracks = await readAudioLibrary()
    setLibrary(tracks)
  }

  useEffect(() => {
    loadLibrary()
    // Set audio mode for background playback
    Audio.setAudioModeAsync({
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      interruptionModeIOS: 0, // MixWithOthers
    }).catch(() => {})
  }, [])

  const handlePresetPress = async (preset: typeof PRESETS[0]) => {
    const track = library.find((t) => t.kind === 'preset' && t.presetId === preset.id)
    if (track) {
      await load(track)
    }
  }

  const handleUploadPress = async (track: Awaited<ReturnType<typeof readAudioLibrary>>[0]) => {
    await load(track)
  }

  const handleUploadNew = async () => {
    try {
      setUploading(true)
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      })
      if (result.canceled) return

      const uri = result.assets[0]?.uri
      if (!uri) return

      const newTrack: Awaited<ReturnType<typeof readAudioLibrary>>[0] = {
        id: Date.now().toString(),
        name: result.assets[0]?.name || 'Uploaded Track',
        kind: 'upload',
        uri,
        emoji: '📁',
        createdAt: Date.now(),
      }

      const updated = await addAudioTrack(newTrack)
      setLibrary(updated)
      setShowUploadModal(false)
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

  const isCurrentTrack = (track: Awaited<ReturnType<typeof readAudioLibrary>>[0]) => {
    return state.track?.id === track.id
  }

  return (
    <View style={styles.screen}>
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
              const isActive = isCurrentTrack(track!) && state.playing
              return (
                <Pressable
                  key={preset.id}
                  onPress={() => track && handlePresetPress(preset)}
                  style={[
                    styles.presetCard,
                    isActive && styles.presetCardActive,
                    !track && styles.presetCardDisabled,
                  ]}
                  disabled={!track}
                >
                  <Text style={styles.presetEmoji}>{preset.emoji}</Text>
                  <Text style={styles.presetName}>{preset.name}</Text>
                  <Text style={styles.presetDesc}>{preset.description}</Text>
                  {isActive && <Ionicons name="pause-circle" size={24} color={colors.brand} />}
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
                Tap ＋ to add your own audio files
              </Text>
            </View>
          ) : (
            <View style={styles.list}>
              {library
                .filter((t) => t.kind === 'upload')
                .map((track) => {
                  const isActive = isCurrentTrack(track) && state.playing
                  return (
                        <Pressable
                          key={track.id}
                          onPress={() => handleUploadPress(track)}
                          onLongPress={() => handleDeleteTrack(track.id)}
                          style={[styles.uploadCard, isActive && styles.uploadCardActive]}
                        >
                          <View style={styles.uploadLeft}>
                            <Text style={styles.uploadEmoji}>{track.emoji}</Text>
                            <View>
                              <Text style={styles.uploadName}>{track.name}</Text>
                              <Text style={styles.uploadMeta}>
                                {isActive
                                  ? `${formatTime(state.position)} / ${formatTime(state.duration)}`
                                  : 'Tap to play · Long press to delete'}
                              </Text>
                            </View>
                          </View>
                          {isActive && (
                            <Ionicons
                              name={state.playing ? 'pause-circle' : 'play-circle'}
                              size={28}
                              color={colors.brand}
                            />
                          )}
                        </Pressable>
                      )
                })}
            </View>
          )}
        </View>

        {/* Current playing track controls */}
        {state.track && (
          <View style={styles.player}>
            <View style={styles.playerTrack}>
              <Text style={styles.playerEmoji}>
                {state.track.emoji || (state.isAmbient ? '🌿' : '🎵')}
              </Text>
              <View style={styles.playerInfo}>
                <Text style={styles.playerName}>{state.track.name}</Text>
                <Text style={styles.playerType}>
                  {state.track.kind === 'preset' ? 'Preset' : 'Uploaded'}
                </Text>
              </View>
            </View>

            <View style={styles.progressContainer}>
              <Text style={styles.timeText}>{formatTime(state.position)}</Text>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${state.duration > 0 ? (state.position / state.duration) * 100 : 0}%` },
                  ]}
                />
              </View>
              <Text style={styles.timeText}>{formatTime(state.duration)}</Text>
            </View>

            <View style={styles.playerControls}>
              <Pressable onPress={() => setLooping(!state.looping)} style={[
                styles.controlBtn,
                state.looping && styles.controlBtnActive,
              ]}>
                <Ionicons name="repeat" size={24} color={state.looping ? colors.brand : colors.inkSoft} />
              </Pressable>

              <Pressable onPress={toggle} style={styles.playBtn}>
                <Ionicons
                  name={state.playing ? 'pause-circle' : 'play-circle'}
                  size={48}
                  color={colors.white}
                />
              </Pressable>

              <Pressable onPress={stop} style={styles.controlBtn}>
                <Ionicons name="stop-circle" size={24} color={colors.inkSoft} />
              </Pressable>
            </View>

            <View style={styles.volumeContainer}>
              <Ionicons name="volume-low" size={20} color={colors.inkSoft} />
              <View style={styles.volumeSlider}>
                <View
                  style={[
                    styles.volumeFill,
                    { width: `${state.volume * 100}%` },
                  ]}
                />
              </View>
              <Ionicons name="volume-high" size={20} color={colors.inkSoft} />
            </View>
          </View>
        )}
      </ScrollView>

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
              <Pressable onPress={handleUploadNew} style={styles.modalBtnConfirm} disabled={uploading}>
                <Text style={styles.modalBtnConfirmText}>
                  {uploading ? 'Adding...' : 'Pick File'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerTitle: { fontSize: 28, fontWeight: '700', color: colors.ink },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: colors.white, fontSize: 26, lineHeight: 28, fontWeight: '300' },
  content: { padding: 20, gap: 28, paddingBottom: 140 },
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
    padding: 16,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  presetCardActive: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  presetCardDisabled: { opacity: 0.5, borderColor: colors.muted },
  presetEmoji: { fontSize: 36, marginBottom: 8 },
  presetName: { fontSize: 16, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  presetDesc: { fontSize: 12, color: colors.inkSoft, textAlign: 'center', marginTop: 4, lineHeight: 18 },
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
  uploadEmoji: { fontSize: 28 },
  uploadName: { fontSize: 16, fontWeight: '600', color: colors.ink },
  uploadMeta: { fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  empty: { alignItems: 'center', padding: 40, gap: 10 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.ink },
  emptySub: { fontSize: 14, color: colors.inkSoft, textAlign: 'center' },

  /* Player */
  player: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 32,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
  },
  playerTrack: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  playerEmoji: { fontSize: 28 },
  playerInfo: { flex: 1 },
  playerName: { fontSize: 16, fontWeight: '600', color: colors.ink },
  playerType: { fontSize: 12, color: colors.inkSoft },
  progressContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  timeText: { fontSize: 12, color: colors.inkSoft, fontFamily: 'monospace', minWidth: 40 },
  progressBar: { flex: 1, height: 4, backgroundColor: colors.line, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.brand, borderRadius: 2 },
  playerControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 32, marginBottom: 12 },
  controlBtn: { padding: 8 },
  controlBtnActive: { transform: [{ rotate: '360deg' }] },
  playBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', shadowColor: colors.brand, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 4 },
  volumeContainer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  volumeSlider: { flex: 1, height: 4, backgroundColor: colors.line, borderRadius: 2, overflow: 'hidden' },
  volumeFill: { height: '100%', backgroundColor: colors.brand, borderRadius: 2 },

  /* Modal */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(43,38,34,0.4)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 32,
    gap: 16,
  },
  modalTitle: { fontSize: 22, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  modalSub: { fontSize: 15, color: colors.inkSoft, textAlign: 'center', lineHeight: 22 },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalBtnCancel: { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.line, alignItems: 'center' },
  modalBtnCancelText: { color: colors.ink, fontWeight: '600', fontSize: 16 },
  modalBtnConfirm: { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.brand, alignItems: 'center' },
  modalBtnConfirmText: { color: colors.white, fontWeight: '600', fontSize: 16 },
})