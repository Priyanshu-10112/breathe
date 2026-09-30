import { View, Text, Pressable, ScrollView, StyleSheet, Alert, Modal } from 'react-native'
import { PanGestureHandler, State } from 'react-native-gesture-handler'
import { useState, useEffect, useRef } from 'react'
import { Canvas, Path, Group, Skia, vec, Paint, useCanvasRef, useCanvasSize } from '@shopify/react-native-skia'
import { readDrawingIndex, writeDrawingIndex, upsertDrawingPage, deleteDrawingPage, DrawingPage, DrawingStroke } from '../../data/storage'
import { colors, s } from '../../theme'

let idCounter = 0
const newStrokeId = () => `s${Date.now().toString(36)}${(idCounter++).toString(36)}`

const initialStroke: DrawingStroke = {
  id: newStrokeId(),
  points: [],
  color: '#c85a3c',
  size: 8,
  opacity: 1,
}

export default function DrawScreen() {
  const [pages, setPages] = useState<DrawingPage[]>([])
  const [currentPageIndex, setCurrentPageIndex] = useState(0)
  const [isDrawing, setIsDrawing] = useState(false)
  const [stroke, setStroke] = useState<DrawingStroke>(initialStroke)
  const [color, setColor] = useState('#c85a3c')
  const [size, setSize] = useState(8)
  const [opacity, setOpacity] = useState(1)
  const canvasRef = useCanvasRef()
  const panGestureRef = useRef<PanGestureHandler>(null)

  // Load existing pages
  useEffect(() => {
    ;(async () => {
      const idx = await readDrawingIndex()
      setPages(idx.pages)
      if (idx.pages.length > 0) setCurrentPageIndex(idx.pages.length - 1)
    })()
  }, [])

  const addPoint = (x: number, y: number) => {
    const newStroke: DrawingStroke = {
      ...stroke,
      points: [...stroke.points, { x, y }],
    }
    setStroke(newStroke)
  }

  const clearCanvas = async () => {
    setStroke({
      id: newStrokeId(),
      points: [],
      color,
      size,
      opacity,
    })
    // Remove last page if we're on an empty canvas after clearing
    if (pages.length === 1 && stroke.points.length === 0) {
      await deleteDrawingPage(pages[0].id)
      setPages([])
      setCurrentPageIndex(0)
    }
  }

  const undoLast = async () => {
    if (stroke.points.length > 0) {
      const newStroke: DrawingStroke = {
        ...stroke,
        points: stroke.points.slice(0, -1),
      }
      setStroke(newStroke)
    } else if (pages.length > 0 && pages[currentPageIndex].strokes.length > 0) {
      const strokes = pages[currentPageIndex].strokes.slice(0, -1)
      const newPage = { ...pages[currentPageIndex], strokes }
      await writeDrawingIndex({ pages: pages.map((p, i) => i === currentPageIndex ? newPage : p) })
      setPages(pages.map((p, i) => i === currentPageIndex ? newPage : p))
      if (strokes.length === 0) {
        await deleteDrawingPage(newPage.id)
        setPages(pages.filter((p) => p.id !== newPage.id))
        if (pages.length === 1) setCurrentPageIndex(0)
      }
    }
  }

  const savePage = async () => {
    const newPage: DrawingPage = {
      id: newStrokeId(),
      strokes: [stroke],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await upsertDrawingPage(newPage)
    const idx = await readDrawingIndex()
    setPages(idx.pages)
    setCurrentPageIndex(idx.pages.length - 1)
    setStroke({
      id: newStrokeId(),
      points: [],
      color,
      size,
      opacity,
    })
  }

  const deletePage = async (id: string) => {
    Alert.alert('Delete page?', 'This cannot be undone.', [
      { text: 'Cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteDrawingPage(id)
          setPages(pages.filter((p) => p.id !== id))
          if (pages.length === 0) setCurrentPageIndex(0)
          else if (currentPageIndex >= pages.length) setCurrentPageIndex(pages.length - 1)
        },
      },
    ])
  }

  const saveAll = async () => {
    await writeDrawingIndex({ pages })
    Alert.alert('Saved', 'All pages have been saved to the gallery')
  }

  const handlePan = async ({ nativeEvent }: { nativeEvent: { x: number; y: number; state: number } }) => {
    const { x, y, state } = nativeEvent
    if (state === State.BEGAN) {
      setIsDrawing(true)
      setStroke({
        id: Date.now().toString(),
        points: [{ x, y }],
        color,
        size,
        opacity,
      })
    } else if (state === State.ACTIVE && isDrawing) {
      addPoint(x, y)
    } else if (state === State.END && isDrawing) {
      setIsDrawing(false)
      if (stroke.points.length > 0) {
        const newStroke = { ...stroke }
        const currentPage = pages[currentPageIndex] || { id: '', strokes: [], createdAt: Date.now(), updatedAt: Date.now() }
        const updatedStrokes = [...currentPage.strokes, newStroke]
        const updatedPage = { ...currentPage, strokes: updatedStrokes, updatedAt: Date.now() }

        // If no existing page, create a new one
        if (!pages[currentPageIndex]) {
          await upsertDrawingPage({
            id: newStrokeId(),
            strokes: [newStroke],
            createdAt: Date.now(),
            updatedAt: Date.now()
          })
          // Reload pages
          const idx = await readDrawingIndex()
          setPages(idx.pages)
          setCurrentPageIndex(idx.pages.length - 1)
        } else {
          await writeDrawingIndex({ pages: pages.map((p, i) => i === currentPageIndex ? updatedPage : p) })
          setPages(pages.map((p, i) => i === currentPageIndex ? updatedPage : p))
        }
        setStroke({
          id: Date.now().toString(),
          points: [],
          color,
          size,
          opacity,
        })
      }
    }
  }

  const currentPage = pages[currentPageIndex] || { id: '', strokes: [], createdAt: 0, updatedAt: 0 }

  return (
    <View style={styles.screen}>
      <View style={styles.toolbar}>
        {/* Color and size controls */}
        <View style={styles.colorPicker}>
          <View style={[{ width: 32, height: 32, borderRadius: 8, backgroundColor: color }]} />
          <Pressable onPress={() => setSize(Math.min(size + 2, 24))} style={styles.controlBtn}>
            <Text style={styles.controlText}>A+</Text>
          </Pressable>
          <Pressable onPress={() => setSize(Math.max(size - 2, 2))} style={styles.controlBtn}>
            <Text style={styles.controlText}>A-</Text>
          </Pressable>
          <Pressable onPress={() => setOpacity(Math.min(opacity + 0.1, 1))} style={styles.controlBtn}>
            <Text style={styles.controlText}>O+</Text>
          </Pressable>
          <Pressable onPress={() => setOpacity(Math.max(opacity - 0.1, 0.1))} style={styles.controlBtn}>
            <Text style={styles.controlText}>O-</Text>
          </Pressable>
        </View>

        {/* Actions */}
        <View style={styles.actionButtons}>
          <Pressable onPress={undoLast} style={[styles.btn, styles.btnUndo]}><Text style={styles.btnText}>← Undo</Text></Pressable>
          <Pressable onPress={clearCanvas} style={[styles.btn, styles.btnClear]}><Text style={styles.btnText}>Clear</Text></Pressable>
          <Pressable onPress={savePage} style={[styles.btn, styles.btnSave]}><Text style={styles.btnText}>Save</Text></Pressable>
          <Pressable onPress={saveAll} style={[styles.btn, styles.btnSaveAll]}><Text style={styles.btnText}>Save All</Text></Pressable>
          {pages.length > 0 && (
            <Pressable onPress={() => deletePage(pages[currentPageIndex].id)} style={[styles.btn, styles.btnDelete]}><Text style={styles.btnText}>Del Page</Text></Pressable>
          )}
        </View>
      </View>

      <PanGestureHandler onGestureEvent={handlePan} ref={panGestureRef}>
        <Canvas ref={canvasRef} style={styles.canvas}>
          {/* Saved strokes */}
          {currentPage.strokes.map((s, si) => (
            <Path
              key={si}
              path={Skia.Path.MakeFromSVGString(s.points.map((p) => `${p.x},${p.y}`).join(' L ')) || 'M 0 0'}
              color={s.color}
              style="stroke"
              strokeWidth={s.size * s.opacity}
              strokeCap="round"
              opacity={s.opacity}
            />
          ))}

          {/* Current stroke preview */}
          {isDrawing && stroke.points.length > 0 && (
            <Path
              path={Skia.Path.MakeFromSVGString(stroke.points.map((p) => `${p.x},${p.y}`).join(' L ')) || 'M 0 0'}
              color={color}
              style="stroke"
              strokeWidth={size * opacity}
              strokeCap="round"
              opacity={opacity}
            />
          )}
        </Canvas>
      </PanGestureHandler>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  toolbar: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.white,
    gap: 16,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  colorPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  controlBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlText: { color: colors.ink, fontWeight: '600', fontSize: 12 },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnUndo: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  btnClear: { borderColor: colors.rose, backgroundColor: colors.roseSoft },
  btnSave: { borderColor: colors.teal, backgroundColor: colors.tealSoft },
  btnSaveAll: { borderColor: colors.lavender, backgroundColor: colors.lavenderSoft },
  btnDelete: { borderColor: colors.rose, backgroundColor: colors.roseSoft },
  btnText: { color: colors.ink, fontWeight: '600', fontSize: 12 },
  canvas: {
    flex: 1,
    backgroundColor: colors.bgSoft,
  },
})