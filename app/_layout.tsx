import { Stack } from 'expo-router'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useEffect } from 'react'
import { Audio } from 'expo-av'
import { ThemeProvider } from '../theme'

export default function RootLayout() {
  useEffect(() => {
    // Allow audio to play even when the phone is on silent/vibrate.
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      interruptionModeIOS: 0, // MixWithOthers
    }).catch(() => {})
  }, [])

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="journal/[id]"
              options={{
                headerShown: true,
                headerTitle: 'Journal',
                headerBackTitle: 'Back',
              }}
            />
          </Stack>
        </GestureHandlerRootView>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}