import React from 'react'
import { StyleSheet } from 'react-native'

export const colors = {
  bg: '#f6f4f0',
  bgSoft: '#fbf8f3',
  ink: '#2b2622',
  inkSoft: '#6b635b',
  muted: '#a99f91',
  line: '#ece7de',
  brand: '#c85a3c',
  brandSoft: '#f6e3d8',
  teal: '#5b9a8b',
  tealSoft: '#d7ece6',
  lavender: '#8a7fd0',
  lavenderSoft: '#eae4f6',
  amber: '#c9933a',
  amberSoft: '#f7ecdc',
  rose: '#c85a6e',
  roseSoft: '#f7dde3',
  white: '#ffffff',
  shadow: 'rgba(43,38,34,0.12)',
}

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 28, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  subtitle: { fontSize: 15, color: colors.inkSoft, textAlign: 'center', lineHeight: 22 },
})