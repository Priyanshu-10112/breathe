import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useState, useEffect, useRef } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import { colors } from '../../theme'

const DURATIONS = [1, 3, 5, 10, 15]
const PHASES = ['Inhale', 'Hold', 'Exhale', 'Hold'] as const
const PHASE_DURATION_SEC = 4

export default function BreatheScreen() {
  const [running, setRunning] = useState(false)
  const [total, setTotal] = useState(5)
  const [secondsLeft, setSecondsLeft] = useState(5 * 60)
  const [phaseIndex, setPhaseIndex] = useState(0)

  const scale = useSharedValue(1)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const phaseTimerRef = useRef(0)
  const currentPhaseRef = useRef(0)
  const stopBreathingRef = useRef<() => void>(() => {})
  const triggerPhaseAnimationRef = useRef<(phase: number) => void>(() => {})

  const triggerPhaseAnimation = (phase: number) => {
    if (phase === 0) {
      // Inhale: expand smoothly
      scale.value = withTiming(1.22, {
        duration: PHASE_DURATION_SEC * 1000,
        easing: Easing.inOut(Easing.ease),
      })
    } else if (phase === 1) {
      // Hold after inhale: stay full
      scale.value = withTiming(1.22, { duration: 200 })
    } else if (phase === 2) {
      // Exhale: shrink smoothly
      scale.value = withTiming(0.85, {
        duration: PHASE_DURATION_SEC * 1000,
        easing: Easing.inOut(Easing.ease),
      })
    } else if (phase === 3) {
      // Hold after exhale: stay empty
      scale.value = withTiming(0.85, { duration: 200 })
    }
  }

  const stopBreathing = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setRunning(false)
    setPhaseIndex(0)
    setSecondsLeft(total * 60)
    scale.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.ease) })
  }

  useEffect(() => {
    stopBreathingRef.current = stopBreathing
    triggerPhaseAnimationRef.current = triggerPhaseAnimation
  })

  const startBreathing = () => {
    setRunning(true)
    setPhaseIndex(0)
    setSecondsLeft(total * 60)
    phaseTimerRef.current = 0
    currentPhaseRef.current = 0

    triggerPhaseAnimation(0)
  }

  useEffect(() => {
    if (!running) return

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          stopBreathingRef.current()
          return 0
        }
        return prev - 1
      })

      phaseTimerRef.current += 1
      if (phaseTimerRef.current >= PHASE_DURATION_SEC) {
        phaseTimerRef.current = 0
        currentPhaseRef.current = (currentPhaseRef.current + 1) % PHASES.length
        const nextPhase = currentPhaseRef.current
        setPhaseIndex(nextPhase)
        triggerPhaseAnimationRef.current(nextPhase)
      }
    }, 1000)

    timerRef.current = interval
    return () => clearInterval(interval)
  }, [running])

  const handleToggle = () => {
    if (running) {
      stopBreathing()
    } else {
      startBreathing()
    }
  }

  const handleSelectDuration = (d: number) => {
    if (running) stopBreathing()
    setTotal(d)
    setSecondsLeft(d * 60)
  }

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const ss = String(secondsLeft % 60).padStart(2, '0')

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.center}>
        <Text style={styles.title}>Breathe</Text>
        <Text style={styles.subtitle}>Follow the rhythm. Let go.</Text>

        <Animated.View style={[styles.circle, animatedStyle]}>
          <View style={styles.innerCircle}>
            <Text style={styles.phase}>{running ? PHASES[phaseIndex] : 'Ready'}</Text>
            <Text style={styles.time}>{running ? `${mm}:${ss}` : `${total}:00`}</Text>
          </View>
        </Animated.View>

        <View style={styles.durations}>
          {DURATIONS.map((d) => (
            <Pressable
              key={d}
              onPress={() => handleSelectDuration(d)}
              style={[styles.chip, total === d && styles.chipActive]}
            >
              <Text style={[styles.chipText, total === d && styles.chipTextActive]}>
                {d}m
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={handleToggle}
          style={[styles.button, running && styles.buttonStop]}
        >
          <Text style={styles.buttonText}>{running ? 'Stop' : 'Begin'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 32, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  subtitle: { fontSize: 15, color: colors.inkSoft, textAlign: 'center', marginBottom: 36, lineHeight: 22 },
  circle: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#c85a3c22',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.brand,
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 6,
  },
  innerCircle: { alignItems: 'center' },
  phase: { fontSize: 20, fontWeight: '600', color: colors.brand, marginBottom: 6, letterSpacing: 1 },
  time: { fontSize: 34, fontWeight: '700', color: colors.ink },
  durations: { flexDirection: 'row', gap: 10, marginTop: 36, flexWrap: 'wrap', justifyContent: 'center' },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: '#ece7de',
    borderWidth: 1,
    borderColor: '#ece7de',
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { color: colors.inkSoft, fontWeight: '600', fontSize: 14 },
  chipTextActive: { color: colors.white },
  button: {
    marginTop: 36,
    paddingHorizontal: 44,
    paddingVertical: 14,
    borderRadius: 30,
    backgroundColor: colors.brand,
  },
  buttonStop: { backgroundColor: colors.rose },
  buttonText: { color: colors.white, fontSize: 17, fontWeight: '700', textAlign: 'center' },
})