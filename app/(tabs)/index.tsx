import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useState, useEffect } from 'react'
import { useSharedValue, withRepeat, withTiming, useDerivedValue } from 'react-native-reanimated'
import Animated, { useAnimatedStyle } from 'react-native-reanimated'

const DURATIONS = [1, 3, 5, 10, 15]
const PHASES = ['Inhale', 'Hold', 'Exhale', 'Hold'] as const

export default function BreatheScreen() {
  const [running, setRunning] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [total, setTotal] = useState(5)
  const [phaseIndex, setPhaseIndex] = useState(0)

  const progress = useSharedValue(0) // 0..1 within current phase

  // Animate the circle: 0.85 -> 1.15 scale
  const scale = useDerivedValue(() => {
    const p = progress.value
    return 0.85 + 0.3 * p
  })

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  useEffect(() => {
    if (!running) return
    const phaseDur = 4 // 4s per phase
    const totalSec = total * 60
    let elapsed = 0
    let phase = 0
    let phaseTimer = 0

    progress.value = 0
    setPhaseIndex(0)
    setSecondsLeft(totalSec)

    const id = setInterval(() => {
      elapsed++
      phaseTimer++
      if (phaseTimer >= phaseDur) {
        phaseTimer = 0
        phase = (phase + 1) % PHASES.length
        setPhaseIndex(phase)
      }
      const p = phaseTimer / phaseDur
      progress.value = withTiming(p, { duration: 200 })

      const left = totalSec - elapsed
      setSecondsLeft(Math.max(0, left))
      if (left <= 0) {
        clearInterval(id)
        setRunning(false)
        progress.value = 0
      }
    }, 1000)

    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, total])

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const ss = String(secondsLeft % 60).padStart(2, '0')

  return (
    <View style={[styles.screen, styles.center]}>
      <Text style={styles.title}>Breathe</Text>
      <Text style={styles.subtitle}>Follow the rhythm. Let go.</Text>

      <Animated.View style={[styles.circle, animatedStyle]}>
        <View style={styles.innerCircle}>
          <Text style={styles.phase}>{running ? PHASES[phaseIndex] : 'Ready'}</Text>
          <Text style={styles.time}>
            {running ? `${mm}:${ss}` : `${total}:00`}
          </Text>
        </View>
      </Animated.View>

      <View style={styles.durations}>
        {DURATIONS.map((d) => (
          <Pressable
            key={d}
            onPress={() => { setTotal(d); setRunning(false) }}
            style={[styles.chip, total === d && styles.chipActive]}
          >
            <Text style={[styles.chipText, total === d && styles.chipTextActive]}>{d}m</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={() => setRunning((r) => !r)}
        style={[styles.button, running && styles.buttonStop]}
      >
        <Text style={styles.buttonText}>{running ? 'Stop' : 'Begin'}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f6f4f0' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 30, fontWeight: '700', color: '#2b2622', marginBottom: 6 },
  subtitle: { fontSize: 15, color: '#6b635b', textAlign: 'center', marginBottom: 36, lineHeight: 22 },
  circle: {
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: '#c85a3c22',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#c85a3c',
    shadowColor: '#c85a3c', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25, shadowRadius: 24, elevation: 6,
  },
  innerCircle: { alignItems: 'center' },
  phase: { fontSize: 20, fontWeight: '600', color: '#c85a3c', marginBottom: 6, letterSpacing: 1 },
  time: { fontSize: 34, fontWeight: '700', color: '#2b2622' },
  durations: { flexDirection: 'row', gap: 10, marginTop: 36, flexWrap: 'wrap', justifyContent: 'center' },
  chip: {
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20,
    backgroundColor: '#ece7de', borderWidth: 1, borderColor: '#ece7de',
  },
  chipActive: { backgroundColor: '#c85a3c', borderColor: '#c85a3c' },
  chipText: { color: '#6b635b', fontWeight: '600', fontSize: 14 },
  chipTextActive: { color: '#fff' },
  button: {
    marginTop: 36, paddingHorizontal: 44, paddingVertical: 14, borderRadius: 30,
    backgroundColor: '#c85a3c',
  },
  buttonStop: { backgroundColor: '#c85a6e' },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center' },
})