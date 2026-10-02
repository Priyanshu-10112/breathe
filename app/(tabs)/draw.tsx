/* eslint-disable react-hooks/refs */
/**
 * Drawing Room — a virtual artist's studio.
 *
 * Layout (single screen, no scroll needed):
 *   TOP HALF  : Easel with canvas — draw here
 *   BOTTOM HALF: Floor — crumpled page-balls scattered around, dustbin in corner
 *
 * Interactions:
 *   • Canvas  → draw with finger
 *   • Toolbar → colors, brush sizes, undo, new page
 *   • Tear    → long-press canvas → drag down → page tears, crumples, flies to floor
 *   • Floor ball → drag to canvas  → unfolds back onto easel
 *   • Floor ball → drag to dustbin → goes into bin (counter shown)
 *   • Bin full (5) → "Empty Bin" button appears → permanently deletes
 *   • Bin 2-finger pinch → tips over → all balls scatter on floor
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler'
import type { SharedValue } from 'react-native-reanimated'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence,
  runOnJS,
  interpolate,
} from 'react-native-reanimated'
import { Canvas, Path, Skia, useCanvasRef } from '@shopify/react-native-skia'
import * as MediaLibrary from 'expo-media-library/legacy'
import { Paths, EncodingType } from 'expo-file-system'
import { writeAsStringAsync } from 'expo-file-system/legacy'
import {
  readDrawingRoom,
  writeDrawingRoom,
  RoomPage,
  DrawingRoom,
  DrawingStroke,
  BIN_CAPACITY,
} from '../../data/storage'
import { colors } from '../../theme'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const { width: SW, height: SH } = Dimensions.get('window')
const FLOOR_TOP = SH * 0.52          // where floor starts
const CANVAS_W = SW - 48
const CANVAS_H = SH * 0.38
const BALL_SIZE = 52
const TAB_BAR_H = 80                           // tab bar + safe area
const BIN_X = SW - 72                          // floor-relative X
const BIN_Y = (SH - FLOOR_TOP) - TAB_BAR_H - 70  // floor-relative Y, above tab bar
const BIN_HIT_RADIUS = 56

const MIN_BRUSH = 2
const MAX_BRUSH = 40

const PALETTE = [
  '#2b2622', // Ink (default)
  '#c85a3c', // Terracotta
  '#5b9a8b', // Sage
  '#8a7fd0', // Lavender
  '#c9933a', // Amber
  '#c85a6e', // Rose
  '#ffffff',  // White
  '__custom__', // Custom (placeholder — picker coming later)
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeId() {
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

function makeStrokeId() {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

function randomFloorPos() {
  const floorHeight = SH - FLOOR_TOP - TAB_BAR_H - 20
  return {
    floorX: 20 + Math.random() * (SW - BALL_SIZE - 80),
    floorY: 20 + Math.random() * Math.max(40, floorHeight - BALL_SIZE - 40),
    floorRotation: (Math.random() - 0.5) * 60,
  }
}

function buildPath(points: { x: number; y: number }[]) {
  if (points.length === 0) return Skia.Path.Make()
  if (points.length === 1) {
    const p = Skia.Path.Make()
    p.moveTo(points[0].x, points[0].y)
    p.lineTo(points[0].x + 0.1, points[0].y + 0.1)
    return p
  }
  const svg = points
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
    .join(' ')
  return Skia.Path.MakeFromSVGString(svg) ?? Skia.Path.Make()
}

function makeEmptyPage(): RoomPage {
  return {
    id: makeId(),
    strokes: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    floorX: 0,
    floorY: 0,
    floorRotation: 0,
    location: 'canvas',
  }
}

// ---------------------------------------------------------------------------
// Color Picker Modal — Categorized named colors, scrollable, accordion groups
// ---------------------------------------------------------------------------

type NamedColor = { name: string; hex: string }
type ColorGroup = { group: string; colors: NamedColor[] }

const COLOR_LIBRARY: ColorGroup[] = [
  {
    group: 'Reds',
    colors: [
      { name: 'Red', hex: '#FF0000' }, { name: 'Crimson', hex: '#DC143C' },
      { name: 'Firebrick', hex: '#B22222' }, { name: 'Dark Red', hex: '#8B0000' },
      { name: 'Indian Red', hex: '#CD5C5C' }, { name: 'Light Coral', hex: '#F08080' },
      { name: 'Salmon', hex: '#FA8072' }, { name: 'Dark Salmon', hex: '#E9967A' },
      { name: 'Tomato', hex: '#FF6347' }, { name: 'Orange Red', hex: '#FF4500' },
    ],
  },
  {
    group: 'Pinks',
    colors: [
      { name: 'Pink', hex: '#FFC0CB' }, { name: 'Hot Pink', hex: '#FF69B4' },
      { name: 'Deep Pink', hex: '#FF1493' }, { name: 'Light Pink', hex: '#FFB6C1' },
      { name: 'Medium Violet Red', hex: '#C71585' }, { name: 'Pale Violet Red', hex: '#DB7093' },
      { name: 'Rose', hex: '#FF007F' }, { name: 'Blush', hex: '#DE5D83' },
      { name: 'Flamingo', hex: '#FC8EAC' }, { name: 'Carnation', hex: '#FFA6C9' },
    ],
  },
  {
    group: 'Oranges',
    colors: [
      { name: 'Orange', hex: '#FFA500' }, { name: 'Dark Orange', hex: '#FF8C00' },
      { name: 'Coral', hex: '#FF7F50' }, { name: 'Tangerine', hex: '#F28500' },
      { name: 'Amber', hex: '#FFBF00' }, { name: 'Pumpkin', hex: '#FF7518' },
      { name: 'Burnt Orange', hex: '#CC5500' }, { name: 'Peach', hex: '#FFCBA4' },
      { name: 'Apricot', hex: '#FBCEB1' }, { name: 'Terracotta', hex: '#E2725B' },
    ],
  },
  {
    group: 'Yellows',
    colors: [
      { name: 'Yellow', hex: '#FFFF00' }, { name: 'Gold', hex: '#FFD700' },
      { name: 'Khaki', hex: '#F0E68C' }, { name: 'Lemon', hex: '#FFF44F' },
      { name: 'Banana', hex: '#FFE135' }, { name: 'Saffron', hex: '#F4C430' },
      { name: 'Corn', hex: '#FBEC5D' }, { name: 'Mustard', hex: '#FFDB58' },
      { name: 'Cream', hex: '#FFFDD0' }, { name: 'Vanilla', hex: '#F3E5AB' },
    ],
  },
  {
    group: 'Greens',
    colors: [
      { name: 'Green', hex: '#008000' }, { name: 'Lime', hex: '#00FF00' },
      { name: 'Forest Green', hex: '#228B22' }, { name: 'Dark Green', hex: '#006400' },
      { name: 'Olive', hex: '#808000' }, { name: 'Sage', hex: '#8FBC8F' },
      { name: 'Mint', hex: '#98FF98' }, { name: 'Emerald', hex: '#50C878' },
      { name: 'Sea Green', hex: '#2E8B57' }, { name: 'Spring Green', hex: '#00FF7F' },
      { name: 'Chartreuse', hex: '#7FFF00' }, { name: 'Moss', hex: '#8A9A5B' },
    ],
  },
  {
    group: 'Teals & Cyans',
    colors: [
      { name: 'Teal', hex: '#008080' }, { name: 'Cyan', hex: '#00FFFF' },
      { name: 'Aqua', hex: '#00FFFF' }, { name: 'Dark Cyan', hex: '#008B8B' },
      { name: 'Turquoise', hex: '#40E0D0' }, { name: 'Medium Turquoise', hex: '#48D1CC' },
      { name: 'Light Sea Green', hex: '#20B2AA' }, { name: 'Cadet Blue', hex: '#5F9EA0' },
      { name: 'Aquamarine', hex: '#7FFFD4' }, { name: 'Pale Turquoise', hex: '#AFEEEE' },
    ],
  },
  {
    group: 'Blues',
    colors: [
      { name: 'Blue', hex: '#0000FF' }, { name: 'Dark Blue', hex: '#00008B' },
      { name: 'Navy', hex: '#000080' }, { name: 'Royal Blue', hex: '#4169E1' },
      { name: 'Steel Blue', hex: '#4682B4' }, { name: 'Dodger Blue', hex: '#1E90FF' },
      { name: 'Cornflower Blue', hex: '#6495ED' }, { name: 'Sky Blue', hex: '#87CEEB' },
      { name: 'Light Blue', hex: '#ADD8E6' }, { name: 'Persian Blue', hex: '#1C39BB' },
      { name: 'Cobalt', hex: '#0047AB' }, { name: 'Baby Blue', hex: '#89CFF0' },
    ],
  },
  {
    group: 'Purples & Violets',
    colors: [
      { name: 'Purple', hex: '#800080' }, { name: 'Violet', hex: '#EE82EE' },
      { name: 'Lavender', hex: '#E6E6FA' }, { name: 'Mauve', hex: '#E0B0FF' },
      { name: 'Orchid', hex: '#DA70D6' }, { name: 'Plum', hex: '#DDA0DD' },
      { name: 'Indigo', hex: '#4B0082' }, { name: 'Dark Violet', hex: '#9400D3' },
      { name: 'Blue Violet', hex: '#8A2BE2' }, { name: 'Medium Purple', hex: '#9370DB' },
      { name: 'Wisteria', hex: '#C9A0DC' }, { name: 'Amethyst', hex: '#9966CC' },
    ],
  },
  {
    group: 'Browns',
    colors: [
      { name: 'Brown', hex: '#A52A2A' }, { name: 'Maroon', hex: '#800000' },
      { name: 'Sienna', hex: '#A0522D' }, { name: 'Chocolate', hex: '#D2691E' },
      { name: 'Peru', hex: '#CD853F' }, { name: 'Sandy Brown', hex: '#F4A460' },
      { name: 'Tan', hex: '#D2B48C' }, { name: 'Wheat', hex: '#F5DEB3' },
      { name: 'Burlywood', hex: '#DEB887' }, { name: 'Mocha', hex: '#967969' },
    ],
  },
  {
    group: 'Pastels',
    colors: [
      { name: 'Pastel Pink', hex: '#FFD1DC' }, { name: 'Pastel Blue', hex: '#AEC6CF' },
      { name: 'Pastel Green', hex: '#B5EAD7' }, { name: 'Pastel Yellow', hex: '#FDFD96' },
      { name: 'Pastel Purple', hex: '#C3B1E1' }, { name: 'Pastel Orange', hex: '#FFB347' },
      { name: 'Pastel Red', hex: '#FF6961' }, { name: 'Pastel Mint', hex: '#B2F2BB' },
      { name: 'Pastel Lavender', hex: '#D8B4FE' }, { name: 'Pastel Peach', hex: '#FFDAB9' },
    ],
  },
  {
    group: 'Neons',
    colors: [
      { name: 'Neon Red', hex: '#FF0033' }, { name: 'Neon Orange', hex: '#FF6600' },
      { name: 'Neon Yellow', hex: '#FFFF00' }, { name: 'Neon Green', hex: '#39FF14' },
      { name: 'Neon Blue', hex: '#00BFFF' }, { name: 'Neon Purple', hex: '#BF00FF' },
      { name: 'Neon Pink', hex: '#FF44CC' }, { name: 'Neon Cyan', hex: '#00FFEF' },
      { name: 'Electric Lime', hex: '#CCFF00' }, { name: 'Hot Magenta', hex: '#FF00AF' },
    ],
  },
  {
    group: 'Greys & Blacks',
    colors: [
      { name: 'White', hex: '#FFFFFF' }, { name: 'Snow', hex: '#FFFAFA' },
      { name: 'Light Grey', hex: '#D3D3D3' }, { name: 'Silver', hex: '#C0C0C0' },
      { name: 'Grey', hex: '#808080' }, { name: 'Dark Grey', hex: '#A9A9A9' },
      { name: 'Dim Grey', hex: '#696969' }, { name: 'Charcoal', hex: '#36454F' },
      { name: 'Slate Grey', hex: '#708090' }, { name: 'Black', hex: '#000000' },
    ],
  },
  {
    group: 'Metallics',
    colors: [
      { name: 'Gold', hex: '#FFD700' }, { name: 'Old Gold', hex: '#CFB53B' },
      { name: 'Silver', hex: '#C0C0C0' }, { name: 'Platinum', hex: '#E5E4E2' },
      { name: 'Bronze', hex: '#CD7F32' }, { name: 'Copper', hex: '#B87333' },
      { name: 'Rose Gold', hex: '#B76E79' }, { name: 'Brass', hex: '#B5A642' },
      { name: 'Gunmetal', hex: '#2A3439' }, { name: 'Titanium', hex: '#878681' },
    ],
  },
  {
    group: 'Earth Tones',
    colors: [
      { name: 'Clay', hex: '#B66A50' }, { name: 'Sand', hex: '#C2B280' },
      { name: 'Rust', hex: '#B7410E' }, { name: 'Mud', hex: '#70543E' },
      { name: 'Ochre', hex: '#CC7722' }, { name: 'Umber', hex: '#635147' },
      { name: 'Raw Sienna', hex: '#C68642' }, { name: 'Brick', hex: '#CB4154' },
      { name: 'Soil', hex: '#6B3F2A' }, { name: 'Desert', hex: '#EDC9AF' },
    ],
  },
  {
    group: 'Skin Tones',
    colors: [
      { name: 'Porcelain', hex: '#F8EDE3' }, { name: 'Fair', hex: '#FDDBB4' },
      { name: 'Ivory', hex: '#F6D7B0' }, { name: 'Peach', hex: '#FFCBA4' },
      { name: 'Sand', hex: '#E8C49A' }, { name: 'Honey', hex: '#D4956A' },
      { name: 'Tan', hex: '#C68B5A' }, { name: 'Caramel', hex: '#A0522D' },
      { name: 'Chestnut', hex: '#7B4028' }, { name: 'Espresso', hex: '#4A2912' },
    ],
  },
  {
    group: 'Jewel Tones',
    colors: [
      { name: 'Ruby', hex: '#9B111E' }, { name: 'Sapphire', hex: '#0F52BA' },
      { name: 'Emerald', hex: '#50C878' }, { name: 'Topaz', hex: '#FFC87C' },
      { name: 'Amethyst', hex: '#9966CC' }, { name: 'Garnet', hex: '#733635' },
      { name: 'Jade', hex: '#00A86B' }, { name: 'Onyx', hex: '#353935' },
      { name: 'Pearl', hex: '#EAE0C8' }, { name: 'Opal', hex: '#A8C3BC' },
    ],
  },
  {
    group: 'Vintage',
    colors: [
      { name: 'Sepia', hex: '#704214' }, { name: 'Antique White', hex: '#FAEBD7' },
      { name: 'Faded Rose', hex: '#C08081' }, { name: 'Dusty Blue', hex: '#6699CC' },
      { name: 'Sage Green', hex: '#9DC183' }, { name: 'Old Lace', hex: '#FDF5E6' },
      { name: 'Dusty Mauve', hex: '#CBAACB' }, { name: 'Faded Yellow', hex: '#F5E6C8' },
      { name: 'Dusty Pink', hex: '#DCAE96' }, { name: 'Warm Brown', hex: '#A67B5B' },
    ],
  },
  {
    group: 'Nature',
    colors: [
      { name: 'Bark', hex: '#6B4226' }, { name: 'Stone', hex: '#8A8880' },
      { name: 'Moss', hex: '#8A9A5B' }, { name: 'Ocean', hex: '#006994' },
      { name: 'Sky', hex: '#87CEEB' }, { name: 'Sunset', hex: '#FD5E53' },
      { name: 'Leaf', hex: '#3D9140' }, { name: 'River', hex: '#4169C0' },
      { name: 'Snow', hex: '#FFFAFA' }, { name: 'Petal', hex: '#FFB7C5' },
    ],
  },
  {
    group: 'Warm Neutrals',
    colors: [
      { name: 'Ivory', hex: '#FFFFF0' }, { name: 'Linen', hex: '#FAF0E6' },
      { name: 'Cream', hex: '#FFFDD0' }, { name: 'Beige', hex: '#F5F5DC' },
      { name: 'Taupe', hex: '#483C32' }, { name: 'Camel', hex: '#C19A6B' },
      { name: 'Tan', hex: '#D2B48C' }, { name: 'Ecru', hex: '#C2B280' },
      { name: 'Buff', hex: '#F0DC82' }, { name: 'Bisque', hex: '#FFE4C4' },
    ],
  },
  {
    group: 'Cool Neutrals',
    colors: [
      { name: 'Ash', hex: '#B2BEB5' }, { name: 'Slate', hex: '#708090' },
      { name: 'Fog', hex: '#CCCCCC' }, { name: 'Steel', hex: '#71797E' },
      { name: 'Mist', hex: '#C4C4BF' }, { name: 'Storm', hex: '#4F666A' },
      { name: 'Arctic', hex: '#DFF0EA' }, { name: 'Ice Blue', hex: '#D6ECFA' },
      { name: 'Pale Blue', hex: '#AFEEEE' }, { name: 'Powder', hex: '#B0E0E6' },
    ],
  },
]

type ColorPickerModalProps = {
  visible: boolean
  initial: string
  onClose: () => void
  onSelect: (hex: string) => void
}

function ColorPickerModal({ visible, initial, onClose, onSelect }: ColorPickerModalProps) {
  const [selected, setSelected] = useState(initial.toUpperCase())
  const [openGroup, setOpenGroup] = useState('Reds')

  const activeColors = COLOR_LIBRARY.find(g => g.group === openGroup)?.colors ?? []

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={cpStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={cpStyles.panel}>
          <Text style={cpStyles.title}>Pick a colour</Text>

          {/* Preview bar */}
          <View style={cpStyles.previewBar}>
            <View style={[cpStyles.previewSwatch, { backgroundColor: selected }]} />
            <Text style={cpStyles.previewHex}>{selected}</Text>
          </View>

          {/* Group tabs — horizontal scroll */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={cpStyles.tabScroll} contentContainerStyle={cpStyles.tabRow}>
            {COLOR_LIBRARY.map(g => (
              <Pressable
                key={g.group}
                onPress={() => setOpenGroup(g.group)}
                style={[cpStyles.tab, openGroup === g.group && cpStyles.tabActive]}
              >
                <Text style={[cpStyles.tabTxt, openGroup === g.group && cpStyles.tabTxtActive]}>
                  {g.group}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Colors grid with names */}
          <ScrollView style={cpStyles.colorScroll} showsVerticalScrollIndicator={false}>
            <View style={cpStyles.namedGrid}>
              {activeColors.map((c) => (
                <Pressable
                  key={c.hex}
                  onPress={() => setSelected(c.hex.toUpperCase())}
                  style={cpStyles.namedItem}
                >
                  <View style={[
                    cpStyles.namedSwatch,
                    { backgroundColor: c.hex },
                    selected === c.hex.toUpperCase() && cpStyles.namedSwatchSelected,
                  ]} />
                  <Text style={cpStyles.namedLabel} numberOfLines={1}>{c.name}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          {/* Buttons */}
          <View style={cpStyles.btns}>
            <Pressable style={cpStyles.btnCancel} onPress={onClose}>
              <Text style={cpStyles.btnCancelTxt}>Cancel</Text>
            </Pressable>
            <Pressable style={cpStyles.btnOk} onPress={() => onSelect(selected)}>
              <Text style={cpStyles.btnOkTxt}>OK</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const cpStyles = StyleSheet.create({
  overlay: { flex:1, backgroundColor:'rgba(0,0,0,0.65)', justifyContent:'flex-end' },
  panel: {
    backgroundColor:'#1e1e1e',
    borderTopLeftRadius:24,
    borderTopRightRadius:24,
    padding:18,
    paddingBottom:36,
    gap:12,
    maxHeight: SH * 0.75,
  },
  title: { fontSize:16, fontWeight:'700', color:'#fff', textAlign:'center' },
  previewBar: { flexDirection:'row', alignItems:'center', gap:12, paddingHorizontal:4 },
  previewSwatch: { width:40, height:40, borderRadius:20, borderWidth:2, borderColor:'#444' },
  previewHex: { fontSize:14, color:'#ccc', fontFamily:'monospace', fontWeight:'600' },
  tabScroll: { flexGrow:0 },
  tabRow: { flexDirection:'row', gap:8, paddingHorizontal:2, paddingBottom:4 },
  tab: {
    paddingHorizontal:14,
    paddingVertical:7,
    borderRadius:20,
    backgroundColor:'#2e2e2e',
    borderWidth:1,
    borderColor:'#444',
  },
  tabActive: { backgroundColor:'#4fc3f7', borderColor:'#4fc3f7' },
  tabTxt: { fontSize:12, color:'#aaa', fontWeight:'600' },
  tabTxtActive: { color:'#000' },
  colorScroll: { maxHeight:200 },
  namedGrid: { flexDirection:'row', flexWrap:'wrap', gap:10, paddingBottom:8 },
  namedItem: { alignItems:'center', width:56, gap:4 },
  namedSwatch: { width:40, height:40, borderRadius:20, borderWidth:2, borderColor:'#333' },
  namedSwatchSelected: { borderColor:'#fff', borderWidth:3 },
  namedLabel: { fontSize:9, color:'#999', textAlign:'center' },
  btns: { flexDirection:'row', gap:10, marginTop:4 },
  btnCancel: { flex:1, paddingVertical:13, borderRadius:12, backgroundColor:'#333', alignItems:'center' },
  btnCancelTxt: { color:'#ccc', fontWeight:'600', fontSize:15 },
  btnOk: { flex:1, paddingVertical:13, borderRadius:12, backgroundColor:'#4fc3f7', alignItems:'center' },
  btnOkTxt: { color:'#000', fontWeight:'700', fontSize:15 },
})

// ---------------------------------------------------------------------------
// FloorBall — a single crumpled page on the floor
// ---------------------------------------------------------------------------
type FloorBallProps = {
  page: RoomPage
  onDropToCanvas: (id: string) => void
  onDropToBin: (id: string) => void
}

function FloorBall({ page, onDropToCanvas, onDropToBin }: FloorBallProps) {
  const tx = useSharedValue(page.floorX)
  const ty = useSharedValue(page.floorY)
  // Start small, animate to full size — no useEffect needed
  const scale = useSharedValue(0.1)
  const rot = useSharedValue(page.floorRotation)

  // Trigger entry animation immediately on first render via shared value initializer trick
  scale.value = withSequence(
    withTiming(1.3, { duration: 140 }),
    withSpring(1, { damping: 8 })
  )

  const startX = useSharedValue(page.floorX)
  const startY = useSharedValue(page.floorY)

  const dragGesture = Gesture.Pan()
    .runOnJS(false)
    .onBegin(() => {
      'worklet'
      startX.value = tx.value
      startY.value = ty.value
    })
    .onUpdate((e) => {
      'worklet'
      tx.value = startX.value + e.translationX
      ty.value = startY.value + e.translationY
    })
    .onEnd((e) => {
      'worklet'
      const finalX = startX.value + e.translationX
      const finalY = startY.value + e.translationY

      // Dragged above floor top = dropped on canvas
      if (finalY < -20) {
        runOnJS(onDropToCanvas)(page.id)
        return
      }

      const dx = finalX + BALL_SIZE / 2 - BIN_X
      const dy = finalY + BALL_SIZE / 2 - BIN_Y
      if (Math.sqrt(dx * dx + dy * dy) < BIN_HIT_RADIUS) {
        runOnJS(onDropToBin)(page.id)
        return
      }

      tx.value = withSpring(page.floorX)
      ty.value = withSpring(page.floorY)
    })

  const animStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: tx.value,
    top: ty.value,
    transform: [{ scale: scale.value }, { rotate: `${rot.value}deg` }],
  }))

  return (
    <GestureDetector gesture={dragGesture}>
      <Animated.View style={animStyle}>
        <View style={styles.ball}>
          <Text style={styles.ballEmoji}>📄</Text>
          {page.name ? (
            <Text style={styles.ballName} numberOfLines={1}>{page.name}</Text>
          ) : null}
        </View>
      </Animated.View>
    </GestureDetector>
  )
}

// ---------------------------------------------------------------------------
// Dustbin
// ---------------------------------------------------------------------------
type DustbinProps = {
  count: number
  onSpill: () => void
  onEmptyBin: () => void
}

function Dustbin({ count, onSpill, onEmptyBin }: DustbinProps) {
  const tiltX = useSharedValue(0)
  const tiltY = useSharedValue(0)
  const isFull = count >= BIN_CAPACITY

  // 2-finger pinch → spill
  const pinchGesture = Gesture.Pinch()
    .runOnJS(true)
    .onEnd(() => {
      onSpill()
    })

  // Long press → also spill (fallback for devices where pinch is tricky)
  const longPressGesture = Gesture.LongPress()
    .runOnJS(true)
    .minDuration(600)
    .onStart(() => {
      onSpill()
    })

  const spillGesture = Gesture.Race(pinchGesture, longPressGesture)

  const binStyle = useAnimatedStyle(() => ({
    transform: [
      { rotateX: `${tiltX.value}deg` },
      { rotateZ: `${tiltY.value}deg` },
    ],
  }))

  return (
    <View style={[styles.binContainer, { left: BIN_X - 24, top: BIN_Y - 28 }]}>
      {isFull && (
        <Pressable style={styles.emptyBinBtn} onPress={onEmptyBin}>
          <Text style={styles.emptyBinText}>🗑️ Empty Bin</Text>
        </Pressable>
      )}
      <GestureDetector gesture={spillGesture}>
        <Animated.View style={binStyle}>
          <Text style={styles.binEmoji}>{isFull ? '🗑️' : '🪣'}</Text>
          {count > 0 && (
            <View style={styles.binBadge}>
              <Text style={styles.binBadgeText}>{count}</Text>
            </View>
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Animated brush slider sub-components (outside DrawScreen = no re-render lag)
// ---------------------------------------------------------------------------
function BrushTrackFill({ brushRatio }: { brushRatio: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    height: `${brushRatio.value * 100}%`,
  }))
  return <Animated.View style={[styles.brushTrackFill, style]} />
}

function BrushThumb({ brushRatio }: { brushRatio: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    bottom: `${brushRatio.value * 100}%`,
  }))
  return <Animated.View style={[styles.brushThumbVertical, style]} />
}

function BrushPreviewDot({ brushRatio }: { brushRatio: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const size = Math.max(4, Math.min(36, Math.round(MIN_BRUSH + brushRatio.value * (MAX_BRUSH - MIN_BRUSH))))
    return {
      width: size,
      height: size,
      borderRadius: size,
    }
  })
  return <Animated.View style={[styles.brushPreviewDot, style]} />
}

// Gesture factory — runs fully on UI thread for zero-lag slider
function makeBrushGesture(
  brushRatio: SharedValue<number>,
  trackH: React.MutableRefObject<number>,
  sizeRef: React.MutableRefObject<number>,
  onCommit: (size: number) => void
) {
  return Gesture.Pan()
    .onUpdate((e) => {
      'worklet'
      const h = trackH.current
      if (h <= 0) return
      const ratio = 1 - Math.max(0, Math.min(1, e.y / h))
      brushRatio.value = ratio
      sizeRef.current = Math.round(MIN_BRUSH + ratio * (MAX_BRUSH - MIN_BRUSH))
    })
    .onEnd(() => {
      'worklet'
      const size = Math.round(MIN_BRUSH + brushRatio.value * (MAX_BRUSH - MIN_BRUSH))
      runOnJS(onCommit)(size)
    })
}

// ---------------------------------------------------------------------------
// Main DrawScreen
// ---------------------------------------------------------------------------
export default function DrawScreen() {
  const [room, setRoom] = useState<DrawingRoom>({ pages: [], binCapacity: BIN_CAPACITY })
  const [activeColor, setActiveColor] = useState(PALETTE[0])
  const [activeSize, setActiveSize] = useState(8)
  const [livePoints, setLivePoints] = useState<{ x: number; y: number }[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [showBrushSlider, setShowBrushSlider] = useState(false)
  const [showNameModal, setShowNameModal] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [pickerHex, setPickerHex] = useState('#ff0000')

  const brushSliderWidth = useRef(200)

  const canvasRef = useCanvasRef()

  // Tear animation
  const tearProgress = useSharedValue(0)
  const tearVisible = useSharedValue(0)

  // Stable refs for shared values
  const tearProgressRef = useRef(tearProgress)
  const tearVisibleRef = useRef(tearVisible)

  // refs for gesture callbacks
  const colorRef = useRef(activeColor)
  const sizeRef = useRef(activeSize)
  const liveRef = useRef<{ x: number; y: number }[]>([])
  const roomRef = useRef(room)

  useEffect(() => { colorRef.current = activeColor }, [activeColor])
  useEffect(() => { sizeRef.current = activeSize }, [activeSize])
  useEffect(() => { roomRef.current = room }, [room])
  // Tear mode toggle — when true, pan gesture tears instead of draws
  const [tearMode, setTearMode] = useState(false)
  const tearModeRef = useRef(false)
  useEffect(() => { tearModeRef.current = tearMode }, [tearMode])

  // Load persisted room
  useEffect(() => {
    readDrawingRoom().then((r) => {
      if (r.pages.length === 0) {
        const first = makeEmptyPage()
        const newRoom = { pages: [first], binCapacity: BIN_CAPACITY }
        setRoom(newRoom)
        writeDrawingRoom(newRoom)
      } else {
        setRoom(r)
      }
    })
  }, [])

  const persist = useCallback((r: DrawingRoom) => {
    writeDrawingRoom(r).catch(() => {})
  }, [])

  // Current canvas page
  const canvasPage = room.pages.find((p) => p.location === 'canvas') ?? null
  const floorPages = room.pages.filter((p) => p.location === 'floor')
  const binPages = room.pages.filter((p) => p.location === 'bin')

  // ---------------------------------------------------------------------------
  // sendCurrentPageToFloor (called from JS side only)
  // ---------------------------------------------------------------------------
  const sendCurrentPageToFloor = useCallback(() => {
    tearVisibleRef.current.value = withTiming(0, { duration: 300 })
    tearProgressRef.current.value = withTiming(0, { duration: 300 })
    setTearMode(false)

    setRoom((prev) => {
      const pos = randomFloorPos()
      const newCanvas = makeEmptyPage()
      const next: DrawingRoom = {
        ...prev,
        pages: [
          ...prev.pages.map((p) =>
            p.location === 'canvas'
              ? { ...p, location: 'floor' as const, ...pos }
              : p
          ),
          newCanvas,
        ],
      }
      persist(next)
      return next
    })
  }, [persist, tearProgressRef, tearVisibleRef])

  // ---------------------------------------------------------------------------
  // Single canvas gesture — draw OR tear depending on tearMode
  // ---------------------------------------------------------------------------
  const canvasGesture = Gesture.Pan()
    .runOnJS(true)
    .onBegin((e) => {
      if (tearModeRef.current) {
        tearVisibleRef.current.value = withTiming(1, { duration: 150 })
        return
      }
      liveRef.current = [{ x: e.x, y: e.y }]
      setLivePoints([{ x: e.x, y: e.y }])
      setIsDrawing(true)
    })
    .onUpdate((e) => {
      if (tearModeRef.current) {
        const drag = Math.max(0, e.translationY)
        tearProgressRef.current.value = Math.min(1, drag / 100)
        return
      }
      liveRef.current.push({ x: e.x, y: e.y })
      if (liveRef.current.length % 2 === 0) {
        setLivePoints([...liveRef.current])
      }
    })
    .onEnd((e) => {
      if (tearModeRef.current) {
        if (e.translationY > 80) {
          tearProgressRef.current.value = withTiming(1, { duration: 150 })
          sendCurrentPageToFloor()
        } else {
          tearProgressRef.current.value = withTiming(0, { duration: 150 })
          tearVisibleRef.current.value = withTiming(0, { duration: 150 })
        }
        return
      }
      setIsDrawing(false)
      const pts = [...liveRef.current]
      setLivePoints([])
      liveRef.current = []
      if (pts.length === 0) return

      const stroke: DrawingStroke = {
        id: makeStrokeId(),
        points: pts,
        color: colorRef.current,
        size: sizeRef.current,
        opacity: 1,
      }

      setRoom((prev) => {
        const next = {
          ...prev,
          pages: prev.pages.map((p) => {
            if (p.location !== 'canvas') return p
            return { ...p, strokes: [...p.strokes, stroke], updatedAt: Date.now() }
          }),
        }
        persist(next)
        return next
      })
    })

  // ---------------------------------------------------------------------------
  // Floor ball interactions
  // ---------------------------------------------------------------------------
  const handleDropToCanvas = useCallback((id: string) => {
    setRoom((prev) => {
      // current canvas page goes to floor first
      const pos = randomFloorPos()
      const next: DrawingRoom = {
        ...prev,
        pages: prev.pages.map((p) => {
          if (p.id === id) return { ...p, location: 'canvas' as const }
          if (p.location === 'canvas') return { ...p, location: 'floor' as const, ...pos }
          return p
        }),
      }
      persist(next)
      return next
    })
  }, [persist])

  const handleDropToBin = useCallback((id: string) => {
    setRoom((prev) => {
      const binCount = prev.pages.filter((p) => p.location === 'bin').length
      if (binCount >= BIN_CAPACITY) {
        Alert.alert('Bin is full!', 'Empty the bin before adding more pages.')
        return prev
      }
      const next: DrawingRoom = {
        ...prev,
        pages: prev.pages.map((p) =>
          p.id === id ? { ...p, location: 'bin' as const } : p
        ),
      }
      persist(next)
      return next
    })
  }, [persist])

  // Spill bin — all bin pages scatter to floor
  const handleSpillBin = useCallback(() => {
    setRoom((prev) => {
      const next: DrawingRoom = {
        ...prev,
        pages: prev.pages.map((p) => {
          if (p.location !== 'bin') return p
          return { ...p, location: 'floor' as const, ...randomFloorPos() }
        }),
      }
      persist(next)
      return next
    })
  }, [persist])

  // Empty bin permanently
  const handleEmptyBin = useCallback(() => {
    Alert.alert('Empty Bin?', 'All pages in the bin will be permanently deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete All',
        style: 'destructive',
        onPress: () => {
          setRoom((prev) => {
            const next: DrawingRoom = {
              ...prev,
              pages: prev.pages.filter((p) => p.location !== 'bin'),
            }
            persist(next)
            return next
          })
        },
      },
    ])
  }, [persist])

  // Save name to current canvas page
  const handleSaveName = useCallback((name: string) => {
    const trimmed = name.trim().slice(0, 15)
    setRoom((prev) => {
      const next: DrawingRoom = {
        ...prev,
        pages: prev.pages.map((p) =>
          p.location === 'canvas' ? { ...p, name: trimmed || undefined } : p
        ),
      }
      persist(next)
      return next
    })
    setShowNameModal(false)
  }, [persist])

  // Undo last stroke on canvas
  const handleUndo = useCallback(() => {
    setRoom((prev) => {
      const next: DrawingRoom = {
        ...prev,
        pages: prev.pages.map((p) => {
          if (p.location !== 'canvas') return p
          return { ...p, strokes: p.strokes.slice(0, -1), updatedAt: Date.now() }
        }),
      }
      persist(next)
      return next
    })
  }, [persist])

  // Add new blank page to canvas (current → floor)
  const handleNewPage = useCallback(() => {
    setRoom((prev) => {
      const pos = randomFloorPos()
      const newCanvas = makeEmptyPage()
      const next: DrawingRoom = {
        ...prev,
        pages: [
          ...prev.pages.map((p) =>
            p.location === 'canvas'
              ? { ...p, location: 'floor' as const, ...pos }
              : p
          ),
          newCanvas,
        ],
      }
      persist(next)
      return next
    })
  }, [persist])

  // Floor clean — move floor pages to bin (up to remaining capacity)
  const handleFloorClean = useCallback(() => {
    setRoom((prev) => {
      const binCount = prev.pages.filter((p) => p.location === 'bin').length
      const remaining = BIN_CAPACITY - binCount
      if (remaining <= 0) {
        Alert.alert('Bin is full!', 'Empty the bin first before sweeping.')
        return prev
      }
      let moved = 0
      const next: DrawingRoom = {
        ...prev,
        pages: prev.pages.map((p) => {
          if (p.location === 'floor' && moved < remaining) {
            moved++
            return { ...p, location: 'bin' as const }
          }
          return p
        }),
      }
      persist(next)
      return next
    })
  }, [persist])

  // Download canvas as PNG to gallery
  const handleDownload = useCallback(async () => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Allow media access to save images.')
        return
      }
      const snapshot = canvasRef.current?.makeImageSnapshot()
      if (!snapshot) {
        Alert.alert('Nothing to save', 'Draw something first!')
        return
      }
      // Encode as PNG explicitly
      const { ImageFormat } = await import('@shopify/react-native-skia')
      const base64 = snapshot.encodeToBase64(ImageFormat.PNG, 100)
      const fileName = `breathe_drawing_${Date.now()}.png`
      const path = `${Paths.cache.uri}${fileName}`
      await writeAsStringAsync(path, base64, { encoding: EncodingType.Base64 })
      await MediaLibrary.saveToLibraryAsync(path)
      Alert.alert('Saved! ✅', 'Drawing saved to your gallery.')
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not save image.')
    }
  }, [canvasRef])

  // ---------------------------------------------------------------------------
  // Brush slider gesture — vertical, drag up = bigger, drag down = smaller
  // Smooth: shared value drives thumb position, setActiveSize only on end
  // ---------------------------------------------------------------------------
  // 0..1 shared value — drives thumb & fill without re-renders during drag
  const brushRatio = useSharedValue(
    (activeSize - MIN_BRUSH) / (MAX_BRUSH - MIN_BRUSH)
  )
  const brushRatioRef = useRef(brushRatio)

  // Keep shared value in sync when size changes externally
  useEffect(() => {
    brushRatioRef.current.value = (activeSize - MIN_BRUSH) / (MAX_BRUSH - MIN_BRUSH)
  }, [activeSize])

  const brushSliderGesture = makeBrushGesture(
    brushRatio,
    brushSliderWidth,
    sizeRef,
    setActiveSize
  )

  // ---------------------------------------------------------------------------
  // Tear overlay animation style
  // ---------------------------------------------------------------------------
  const tearOverlayStyle = useAnimatedStyle(() => ({
    opacity: tearVisible.value,
    transform: [{ translateY: interpolate(tearProgress.value, [0, 1], [0, 40]) }],
  }))

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>

        {/* ── TOP: Easel + Canvas ───────────────────────────────────── */}
        <View style={styles.easelSection}>

          {/* Toolbar */}
          <View style={styles.toolbar}>
            {/* Colors */}
            <View style={styles.colorRow}>
              {PALETTE.map((c) => {
                const isCustom = c === '__custom__'
                return (
                  <Pressable
                    key={c}
                    onPress={() => {
                      if (isCustom) {
                        setPickerHex(activeColor.startsWith('#') && !PALETTE.slice(0,-1).includes(activeColor) ? activeColor : '#ff6b35')
                        setShowColorPicker(true)
                        return
                      }
                      setActiveColor(c)
                    }}
                    style={[
                      styles.swatch,
                      !isCustom && { backgroundColor: c },
                      isCustom && styles.swatchCustom,
                      !isCustom && activeColor === c && styles.swatchActive,
                      c === '#ffffff' && styles.swatchWhite,
                    ]}
                  >
                    {isCustom && <Text style={styles.swatchCustomIcon}>＋</Text>}
                  </Pressable>
                )
              })}
            </View>

            {/* Sizes + Actions */}
            <View style={styles.toolRow}>

              {/* Brush icon — tap to toggle vertical overlay slider */}
              <View style={styles.brushRow}>
                <Pressable
                  onPress={() => setShowBrushSlider((v) => !v)}
                  style={styles.brushIconBtn}
                >
                  <View style={[
                    styles.brushDot,
                    {
                      width: Math.max(4, Math.min(22, activeSize * 0.7)),
                      height: Math.max(4, Math.min(22, activeSize * 0.7)),
                      borderRadius: 20,
                    }
                  ]} />
                </Pressable>
                <Text style={styles.brushSizeLabel}>{activeSize}</Text>
              </View>

              <View style={styles.actionRow}>
                <Pressable
                  onPress={handleUndo}
                  disabled={!canvasPage || canvasPage.strokes.length === 0}
                  style={[styles.actionBtn, (!canvasPage || canvasPage.strokes.length === 0) && styles.btnDisabled]}
                >
                  <Text style={styles.actionTxt}>↩</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setNameInput(canvasPage?.name ?? '')
                    setShowNameModal(true)
                  }}
                  style={styles.actionBtn}
                >
                  <Text style={styles.actionTxt} numberOfLines={1}>
                    {canvasPage?.name ? canvasPage.name : 'Name'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setTearMode((v) => !v)}
                  style={[styles.actionBtn, tearMode && styles.tearModeActive]}
                >
                  <Text style={[styles.actionTxt, tearMode && { color: colors.white }]}>
                    {tearMode ? '✂️ Tear' : '✂️'}
                  </Text>
                </Pressable>
                <Pressable onPress={handleDownload} style={[styles.actionBtn, styles.saveBtn]}>
                  <Text style={[styles.actionTxt, { color: colors.white }]}>Save</Text>
                </Pressable>
                <Pressable onPress={handleNewPage} style={[styles.actionBtn, styles.newPageBtn]}>
                  <Text style={[styles.actionTxt, { color: colors.white }]}>＋</Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* Easel legs */}
          <View style={styles.easelLegs}>
            <View style={[styles.easelLeg, styles.easelLegLeft]} />
            <View style={[styles.easelLeg, styles.easelLegRight]} />
          </View>

          {/* Canvas frame */}
          <View style={styles.canvasFrame}>
            {/* Tear hint overlay */}
            <Animated.View style={[styles.tearOverlay, tearOverlayStyle]} pointerEvents="none">
              <Text style={styles.tearHint}>↓ Drag down to tear page off</Text>
            </Animated.View>

            {/* Single GestureDetector handles both drawing and tear */}
            <GestureDetector gesture={canvasGesture}>
              <View style={styles.canvasArea}>
                <Canvas ref={canvasRef} style={StyleSheet.absoluteFill}>
                  {canvasPage?.strokes.map((s) => (
                    <Path
                      key={s.id}
                      path={buildPath(s.points)}
                      color={s.color}
                      style="stroke"
                      strokeWidth={s.size}
                      strokeCap="round"
                      strokeJoin="round"
                      opacity={s.opacity}
                    />
                  ))}
                  {isDrawing && livePoints.length > 0 && (
                    <Path
                      path={buildPath(livePoints)}
                      color={activeColor}
                      style="stroke"
                      strokeWidth={activeSize}
                      strokeCap="round"
                      strokeJoin="round"
                    />
                  )}
                </Canvas>

                {/* Empty canvas hint */}
                {(!canvasPage || canvasPage.strokes.length === 0) && !isDrawing && !tearMode && (
                  <View style={styles.canvasHint} pointerEvents="none">
                    <Text style={styles.canvasHintText}>Draw here</Text>
                    <Text style={styles.canvasHintSub}>Tap ✂️ then drag down to tear</Text>
                  </View>
                )}
                {tearMode && (
                  <View style={styles.canvasHint} pointerEvents="none">
                    <Text style={styles.tearModeHint}>✂️ Tear Mode</Text>
                    <Text style={styles.canvasHintSub}>Drag down to rip page off</Text>
                  </View>
                )}
              </View>
            </GestureDetector>

            {/* Vertical brush size overlay — appears on top of canvas */}
            {showBrushSlider && (
              <Animated.View style={styles.brushOverlay} pointerEvents="box-none">
                {/* Backdrop tap to close */}
                <Pressable
                  style={StyleSheet.absoluteFill}
                  onPress={() => setShowBrushSlider(false)}
                />
                {/* Slider panel — GestureDetector wraps whole panel for large hit area */}
                <GestureDetector gesture={brushSliderGesture}>
                  <View
                    style={styles.brushPanel}
                    onLayout={(e) => { brushSliderWidth.current = e.nativeEvent.layout.height }}
                  >
                    {/* Max label */}
                    <Text style={styles.brushPanelLabel}>{MAX_BRUSH}</Text>

                    {/* Track — visual only, no gesture here */}
                    <View style={styles.brushTrackVertical}>
                      <BrushTrackFill brushRatio={brushRatio} />
                      <BrushThumb brushRatio={brushRatio} />
                    </View>

                    {/* Min label */}
                    <Text style={styles.brushPanelLabel}>{MIN_BRUSH}</Text>

                    {/* Current size preview dot */}
                    <BrushPreviewDot brushRatio={brushRatio} />
                  </View>
                </GestureDetector>
              </Animated.View>
            )}
          </View>
        </View>

        {/* ── BOTTOM: Floor ─────────────────────────────────────────── */}
        <View style={styles.floor}>
          <View style={styles.floorHeader}>
            <Text style={styles.floorLabel}>
              {floorPages.length === 0 ? '— floor is clean —' : `${floorPages.length} page${floorPages.length !== 1 ? 's' : ''} on floor`}
            </Text>
            {floorPages.length > 0 && (
              <Pressable onPress={handleFloorClean} style={styles.sweepBtn}>
                <Text style={styles.sweepTxt}>🧹 Sweep</Text>
              </Pressable>
            )}
          </View>

          {/* Scattered balls */}
          {floorPages.map((p) => (
            <FloorBall
              key={p.id}
              page={p}
              onDropToCanvas={handleDropToCanvas}
              onDropToBin={handleDropToBin}
            />
          ))}

          {/* Dustbin */}
          <Dustbin
            count={binPages.length}
            onSpill={handleSpillBin}
            onEmptyBin={handleEmptyBin}
          />
        </View>

      </SafeAreaView>

      {/* Color Picker Modal */}
      <ColorPickerModal
        key={showColorPicker ? pickerHex : 'closed'}
        visible={showColorPicker}
        initial={pickerHex}
        onClose={() => setShowColorPicker(false)}
        onSelect={(hex) => {
          setActiveColor(hex)
          setShowColorPicker(false)
        }}
      />

      {/* Name Modal */}
      <Modal visible={showNameModal} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowNameModal(false)} />
          <View style={styles.nameModal}>
            <Text style={styles.nameModalTitle}>Name this drawing</Text>
            <TextInput
              style={styles.nameInput}
              value={nameInput}
              onChangeText={(t) => setNameInput(t.slice(0, 15))}
              placeholder="Enter name (max 15 chars)"
              placeholderTextColor={colors.muted}
              maxLength={15}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => handleSaveName(nameInput)}
            />
            <Text style={styles.nameCharCount}>{nameInput.length}/15</Text>
            <View style={styles.nameModalBtns}>
              <Pressable style={styles.nameBtnCancel} onPress={() => setShowNameModal(false)}>
                <Text style={styles.nameBtnCancelTxt}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.nameBtnSave} onPress={() => handleSaveName(nameInput)}>
                <Text style={styles.nameBtnSaveTxt}>Save</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </GestureHandlerRootView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f0ebe3',
  },

  // Easel section
  easelSection: {
    height: SH * 0.52,
    backgroundColor: '#e8e0d4',
    alignItems: 'center',
    paddingTop: 4,
    borderBottomWidth: 2,
    borderBottomColor: '#c8bfb0',
  },
  toolbar: {
    width: '100%',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: '#faf7f2',
    borderBottomWidth: 1,
    borderBottomColor: '#e0d8cc',
  },
  colorRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchActive: {
    borderColor: colors.ink,
    transform: [{ scale: 1.2 }],
  },
  swatchWhite: {
    borderWidth: 1,
    borderColor: '#ccc',
  },
  swatchCustom: {
    borderWidth: 2,
    borderColor: colors.brand,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchCustomIcon: {
    fontSize: 14,
    color: colors.brand,
    fontWeight: '700',
    lineHeight: 16,
  },
  toolRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  // Brush slider
  brushRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brushIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#ede8e0',
    borderWidth: 1,
    borderColor: '#d0c8bc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brushDot: {
    backgroundColor: colors.ink,
  },
  brushSizeLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inkSoft,
    minWidth: 20,
  },
  // Vertical overlay
  brushOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  brushPanel: {
    position: 'absolute',
    left: 12,
    top: 10,
    bottom: 10,
    width: 52,
    backgroundColor: 'rgba(43,38,34,0.88)',
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 12,
  },
  brushPanelLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '700',
  },
  brushTrackVertical: {
    width: 6,
    flex: 1,
    marginVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 3,
    overflow: 'visible',
    position: 'relative',
    justifyContent: 'flex-end',
  },
  brushTrackFill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    borderRadius: 3,
  },
  brushThumbVertical: {
    position: 'absolute',
    left: -7,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
    marginBottom: -10,
  },
  brushPreviewDot: {
    backgroundColor: colors.white,
    marginTop: 4,
  },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#ede8e0',
    borderWidth: 1,
    borderColor: '#d0c8bc',
  },
  newPageBtn: { backgroundColor: colors.brand, borderColor: colors.brand },
  saveBtn: { backgroundColor: '#5b9a8b', borderColor: '#5b9a8b' },
  tearModeActive: { backgroundColor: '#c85a3c', borderColor: '#c85a3c' },
  actionTxt: { fontSize: 13, fontWeight: '700', color: colors.ink },
  btnDisabled: { opacity: 0.3 },

  // Easel legs (decorative)
  easelLegs: {
    position: 'absolute',
    bottom: 0,
    width: CANVAS_W + 24,
    height: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  easelLeg: {
    width: 8,
    height: 36,
    backgroundColor: '#8b7355',
    borderRadius: 4,
  },
  easelLegLeft: { transform: [{ rotate: '-8deg' }] },
  easelLegRight: { transform: [{ rotate: '8deg' }] },

  // Canvas
  canvasFrame: {
    width: CANVAS_W,
    height: CANVAS_H,
    backgroundColor: colors.white,
    borderRadius: 4,
    borderWidth: 3,
    borderColor: '#8b7355',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
    marginTop: 4,
  },
  canvasArea: {
    flex: 1,
    backgroundColor: '#fffef9',
  },
  canvasHint: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  canvasHintText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ccc5b8',
  },
  canvasHintSub: {
    fontSize: 11,
    color: '#d5cfc6',
    marginTop: 4,
  },
  tearModeHint: {
    fontSize: 22,
    fontWeight: '700',
    color: '#c85a3c',
  },
  tearOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: 'rgba(200,90,60,0.12)',
    padding: 8,
    alignItems: 'center',
  },
  tearHint: {
    fontSize: 13,
    color: colors.brand,
    fontWeight: '700',
  },

  // Floor
  floor: {
    flex: 1,
    backgroundColor: '#d4cfc8',
    borderTopWidth: 2,
    borderTopColor: '#bbb4aa',
    position: 'relative',
  },
  floorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 6,
  },
  floorLabel: {
    fontSize: 11,
    color: '#a09890',
    fontStyle: 'italic',
  },
  sweepBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: '#bdb5ab',
  },
  sweepTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4a4540',
  },

  // Ball
  ball: {
    width: BALL_SIZE,
    height: BALL_SIZE,
    borderRadius: BALL_SIZE / 2,
    backgroundColor: '#f0ebe0',
    borderWidth: 1,
    borderColor: '#c8bfb0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  ballEmoji: { fontSize: 24 },

  // Dustbin
  binContainer: {
    position: 'absolute',
    alignItems: 'center',
  },
  binEmoji: { fontSize: 40 },
  binBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: colors.brand,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  binBadgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '800',
  },
  emptyBinBtn: {
    marginTop: 4,
    backgroundColor: colors.brand,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  emptyBinText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
  },

  // Ball name
  ballName: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.inkSoft,
    textAlign: 'center',
    maxWidth: BALL_SIZE - 4,
  },

  // Name modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  nameModal: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
  nameModalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
  },
  nameInput: {
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.bgSoft,
  },
  nameCharCount: {
    fontSize: 11,
    color: colors.muted,
    textAlign: 'right',
    marginTop: -6,
  },
  nameModalBtns: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  nameBtnCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.line,
    alignItems: 'center',
  },
  nameBtnCancelTxt: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
  },
  nameBtnSave: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.brand,
    alignItems: 'center',
  },
  nameBtnSaveTxt: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
  },
})
