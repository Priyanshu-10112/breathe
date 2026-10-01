import { View, Text, Pressable, StyleSheet, Alert } from 'react-native'
import { PanGestureHandler, State } from 'react-native-gesture-handler'
import { useState, useEffect, useRef, useCallback } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Canvas, Path, Skia, useCanvasRef } from '@shopify/react-native-skia'
import {
  readDrawingIndex,
  writeDrawingIndex,
  upsertDrawingPage,
  deleteDrawingPage,
  DrawingPage,
  DrawingStroke,
} from '../../data/storage'
import { colors } from '../../theme'

const PALETTE = [
  { name: 'Terracotta', color: '#c85a3c' },
  { name: 'Ink', color: '#2b2622' },
  { name: 'Sage', color: '#5b9a8b' },
  { name: 'Lavender', color: '#8a7fd0' },
  { name: 'Amber', color: '#c9933a' },
  { name: 'Rose', color: '#c85a6e' },
  { name: 'Eraser', color: '#fbf8f3' },
]

const SIZES = [
  { label: 'S', value: 4 },
  { label: 'M', value: 8 },
  { label: 'L', value: 14 },
  { label: 'XL', value: 24 },
]

function createStrokePath(points: { x: number; y: number }[]) {
  if (points.length === 0) return Skia.Path.Make()
  if (points.length === 1) {
    const p = points[0]
    const path = Skia.Path.Make()
    path.addCircle(p.x, p.y, 1)
    return path
  }

  const svg = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ')

  const path = Skia.Path.MakeFromSVGString(svg)
  return path || Skia.Path.Make()
}

const EMPTY_PAGE: DrawingPage = {
  id: 'default',
  strokes: [],
  createdAt: 0,
  updatedAt: 0,
}

export default function DrawScreen() {
  const [pages, setPages] = useState<DrawingPage[]>([])
  const [currentPageIndex, setCurrentPageIndex] = useState(0)
  const [activeColor, setActiveColor] = useState('#c85a3c')
  const [activeSize, setActiveSize] = useState(8)
  const [activeOpacity] = useState(1)
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([])
  const [isDrawing, setIsDrawing] = useState(false)

  const canvasRef = useCanvasRef()
  const activeStrokeRef = useRef<{ x: number; y: number }[]>([])
  const colorRef = useRef(activeColor)
  const sizeRef = useRef(activeSize)
  const opacityRef = useRef(activeOpacity)

  useEffect(() => {
    colorRef.current = activeColor
  }, [activeColor])

  useEffect(() => {
    sizeRef.current = activeSize
  }, [activeSize])

  useEffect(() => {
    opacityRef.current = activeOpacity
  }, [activeOpacity])

  useEffect(() => {
    ;(async () => {
      const idx = await readDrawingIndex()
      if (idx.pages.length === 0) {
        // Create initial default page
        const firstPage: DrawingPage = {
          id: `p_${Date.now()}`,
          strokes: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        await upsertDrawingPage(firstPage)
        setPages([firstPage])
        setCurrentPageIndex(0)
      } else {
        setPages(idx.pages)
        setCurrentPageIndex(idx.pages.length - 1)
      }
    })()
  }, [])

  const currentPage = pages[currentPageIndex] || EMPTY_PAGE

  const handlePan = useCallback(
    async ({ nativeEvent }: { nativeEvent: { x: number; y: number; state: number } }) => {
      const { x, y, state } = nativeEvent

      if (state === State.BEGAN) {
        activeStrokeRef.current = [{ x, y }]
        setCurrentPoints([{ x, y }])
        setIsDrawing(true)
      } else if (state === State.ACTIVE) {
        activeStrokeRef.current.push({ x, y })
        // Update points in batches to keep UI responsive
        if (activeStrokeRef.current.length % 2 === 0) {
          setCurrentPoints([...activeStrokeRef.current])
        }
      } else if (state === State.END || state === State.CANCELLED) {
        setIsDrawing(false)
        const finalPoints = [...activeStrokeRef.current]
        setCurrentPoints([])
        activeStrokeRef.current = []

        if (finalPoints.length > 0) {
          const newStroke: DrawingStroke = {
            id: `s_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            points: finalPoints,
            color: colorRef.current,
            size: sizeRef.current,
            opacity: opacityRef.current,
          }

          setPages((prevPages) => {
            const page = prevPages[currentPageIndex] || {
              id: `p_${Date.now()}`,
              strokes: [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            }
            const updatedStrokes = [...page.strokes, newStroke]
            const updatedPage = { ...page, strokes: updatedStrokes, updatedAt: Date.now() }
            const nextPages = prevPages.map((p, i) => (i === currentPageIndex ? updatedPage : p))
            writeDrawingIndex({ pages: nextPages }).catch(() => {})
            return nextPages
          })
        }
      }
    },
    [currentPageIndex]
  )

  const undoLastStroke = async () => {
    if (!currentPage || currentPage.strokes.length === 0) return

    const updatedStrokes = currentPage.strokes.slice(0, -1)
    const updatedPage = { ...currentPage, strokes: updatedStrokes, updatedAt: Date.now() }
    const nextPages = pages.map((p, i) => (i === currentPageIndex ? updatedPage : p))

    setPages(nextPages)
    await writeDrawingIndex({ pages: nextPages })
  }

  const clearCanvas = async () => {
    if (!currentPage || currentPage.strokes.length === 0) return

    Alert.alert('Clear canvas?', 'This will remove all drawings from this page.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          const updatedPage = { ...currentPage, strokes: [], updatedAt: Date.now() }
          const nextPages = pages.map((p, i) => (i === currentPageIndex ? updatedPage : p))
          setPages(nextPages)
          await writeDrawingIndex({ pages: nextPages })
        },
      },
    ])
  }

  const addNewPage = async () => {
    const newPage: DrawingPage = {
      id: `p_${Date.now()}`,
      strokes: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    const nextPages = [...pages, newPage]
    setPages(nextPages)
    setCurrentPageIndex(nextPages.length - 1)
    await upsertDrawingPage(newPage)
  }

  const deleteCurrentPage = async () => {
    if (pages.length <= 1) {
      // Just clear if it's the only page
      const cleared = { ...pages[0], strokes: [], updatedAt: Date.now() }
      setPages([cleared])
      await writeDrawingIndex({ pages: [cleared] })
      return
    }

    Alert.alert('Delete page?', 'This page will be permanently removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const targetId = currentPage.id
          const nextPages = pages.filter((p) => p.id !== targetId)
          await deleteDrawingPage(targetId)
          setPages(nextPages)
          setCurrentPageIndex(Math.max(0, currentPageIndex - 1))
        },
      },
    ])
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {/* Top Toolbar */}
      <View style={styles.toolbar}>
        {/* Colors */}
        <View style={styles.colorRow}>
          {PALETTE.map((p) => {
            const isSelected = activeColor === p.color
            return (
              <Pressable
                key={p.color}
                onPress={() => setActiveColor(p.color)}
                style={[
                  styles.swatch,
                  { backgroundColor: p.color },
                  isSelected && styles.swatchSelected,
                  p.color === '#fbf8f3' && styles.eraserSwatch,
                ]}
              >
                {p.color === '#fbf8f3' && <Text style={styles.eraserIcon}>✕</Text>}
              </Pressable>
            )
          })}
        </View>

        {/* Sizes and Actions */}
        <View style={styles.toolRow}>
          {/* Brush Sizes */}
          <View style={styles.sizeGroup}>
            {SIZES.map((s) => (
              <Pressable
                key={s.label}
                onPress={() => setActiveSize(s.value)}
                style={[styles.sizeBtn, activeSize === s.value && styles.sizeBtnActive]}
              >
                <Text
                  style={[
                    styles.sizeText,
                    activeSize === s.value && styles.sizeTextActive,
                  ]}
                >
                  {s.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Action Buttons */}
          <View style={styles.actionGroup}>
            <Pressable
              onPress={undoLastStroke}
              disabled={currentPage.strokes.length === 0}
              style={[
                styles.btn,
                currentPage.strokes.length === 0 && styles.btnDisabled,
              ]}
            >
              <Text style={styles.btnText}>↩ Undo</Text>
            </Pressable>

            <Pressable
              onPress={clearCanvas}
              disabled={currentPage.strokes.length === 0}
              style={[
                styles.btn,
                styles.btnClear,
                currentPage.strokes.length === 0 && styles.btnDisabled,
              ]}
            >
              <Text style={[styles.btnText, styles.btnClearText]}>Clear</Text>
            </Pressable>

            <Pressable onPress={addNewPage} style={[styles.btn, styles.btnAdd]}>
              <Text style={[styles.btnText, styles.btnAddText]}>＋ Page</Text>
            </Pressable>

            {pages.length > 1 && (
              <Pressable onPress={deleteCurrentPage} style={[styles.btn, styles.btnDel]}>
                <Text style={[styles.btnText, styles.btnDelText]}>Delete</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Page Switcher */}
        {pages.length > 1 && (
          <View style={styles.pageIndicatorRow}>
            <Text style={styles.pageText}>
              Page {currentPageIndex + 1} of {pages.length}
            </Text>
            <View style={styles.pageNav}>
              <Pressable
                onPress={() => setCurrentPageIndex((i) => Math.max(0, i - 1))}
                disabled={currentPageIndex === 0}
                style={[styles.pageBtn, currentPageIndex === 0 && styles.btnDisabled]}
              >
                <Text style={styles.pageBtnText}>‹ Prev</Text>
              </Pressable>
              <Pressable
                onPress={() => setCurrentPageIndex((i) => Math.min(pages.length - 1, i + 1))}
                disabled={currentPageIndex === pages.length - 1}
                style={[
                  styles.pageBtn,
                  currentPageIndex === pages.length - 1 && styles.btnDisabled,
                ]}
              >
                <Text style={styles.pageBtnText}>Next ›</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {/* Skia Drawing Canvas */}
      <PanGestureHandler onGestureEvent={handlePan}>
        <View style={styles.canvasContainer}>
          <Canvas ref={canvasRef} style={styles.canvas}>
            {/* Render saved strokes */}
            {currentPage.strokes.map((s) => (
              <Path
                key={s.id}
                path={createStrokePath(s.points)}
                color={s.color}
                style="stroke"
                strokeWidth={s.size}
                strokeCap="round"
                strokeJoin="round"
                opacity={s.opacity}
              />
            ))}

            {/* Render in-progress stroke */}
            {isDrawing && currentPoints.length > 0 && (
              <Path
                path={createStrokePath(currentPoints)}
                color={activeColor}
                style="stroke"
                strokeWidth={activeSize}
                strokeCap="round"
                strokeJoin="round"
                opacity={activeOpacity}
              />
            )}
          </Canvas>
        </View>
      </PanGestureHandler>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  toolbar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.white,
    gap: 12,
  },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchSelected: {
    borderColor: colors.ink,
    transform: [{ scale: 1.15 }],
  },
  eraserSwatch: {
    borderWidth: 1,
    borderColor: colors.line,
  },
  eraserIcon: {
    fontSize: 14,
    color: colors.muted,
    fontWeight: '700',
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sizeGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  sizeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeBtnActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  sizeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.inkSoft,
  },
  sizeTextActive: {
    color: colors.white,
  },
  actionGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  btn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: colors.bgSoft,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.35,
  },
  btnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink,
  },
  btnClear: {
    backgroundColor: colors.roseSoft,
    borderColor: colors.roseSoft,
  },
  btnClearText: {
    color: colors.rose,
  },
  btnAdd: {
    backgroundColor: colors.brandSoft,
    borderColor: colors.brandSoft,
  },
  btnAddText: {
    color: colors.brand,
  },
  btnDel: {
    backgroundColor: colors.roseSoft,
    borderColor: colors.roseSoft,
  },
  btnDelText: {
    color: colors.rose,
  },
  pageIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  pageText: {
    fontSize: 12,
    color: colors.inkSoft,
    fontWeight: '500',
  },
  pageNav: {
    flexDirection: 'row',
    gap: 8,
  },
  pageBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.bgSoft,
  },
  pageBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink,
  },
  canvasContainer: {
    flex: 1,
    backgroundColor: colors.bgSoft,
  },
  canvas: {
    flex: 1,
  },
})