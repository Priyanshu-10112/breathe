# 🌬️ Breathe

A mindfulness mobile app built with **Expo + React Native**. Breathe combines breathing exercises, ambient audio, freehand drawing, and journaling into one calm, distraction-free experience.

---

## 📱 Screens

### 🌀 Breathe (Home)
- Animated box breathing guide — Inhale → Hold → Exhale → Hold
- Smooth Reanimated circle that expands and contracts in sync with each phase
- Designed for 4-4-4-4 box breathing rhythm

### 🎨 Draw
A virtual artist's studio — not just a drawing app.

- **Easel + Canvas** — draw with your finger using any color and brush size
- **Brush size slider** — vertical overlay slider on canvas, fully smooth (UI thread)
- **Color palette** — 7 preset colors + custom color picker
- **Color Picker** — 20 named color groups (Reds, Pastels, Neons, Jewel Tones, Skin Tones, Metallics, etc.) with named swatches like Lavender, Persian Blue, Rose Gold
- **Tear mode** — tap ✂️ then drag down to rip the page off the canvas
- **Floor** — torn pages crumple into balls and land on the floor below
- **Drag to canvas** — drag a floor ball back up to resume drawing on it
- **Dustbin** — drag balls into the bin (capacity: 10), long press or pinch to spill
- **Empty Bin** — permanently delete binned pages when full
- **🧹 Sweep** — send floor pages to bin in one tap
- **Name a drawing** — tap "Name" to give the current page a title (shown on floor balls)
- **Save PNG** — export the canvas as a PNG to your gallery

### 🎵 Audio
- Ambient sound library with preset tracks: Rain 🌧️, Waves 🌊, Singing Bowl 🪔
- Upload your own audio files (MP3, WAV, M4A)
- Playback controls — play/pause, seek, loop, volume
- Floating now-playing dock above tab bar

### 📓 Journal
- Create and edit personal journal entries
- Entries saved locally with timestamps
- Full-screen editor with keyboard handling

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Expo](https://expo.dev) SDK 57 |
| Navigation | [Expo Router](https://expo.github.io/router) v4 |
| Animations | [React Native Reanimated](https://docs.swmansion.com/react-native-reanimated/) v4 |
| Gestures | [React Native Gesture Handler](https://docs.swmansion.com/react-native-gesture-handler/) v2 |
| Drawing | [@shopify/react-native-skia](https://shopify.github.io/react-native-skia/) |
| Audio | [expo-audio](https://docs.expo.dev/versions/latest/sdk/audio/) |
| Storage | [@react-native-async-storage/async-storage](https://react-native-async-storage.github.io/async-storage/) |
| File System | [expo-file-system](https://docs.expo.dev/versions/latest/sdk/filesystem/) |
| Media | [expo-media-library](https://docs.expo.dev/versions/latest/sdk/media-library/) |
| Runtime | React Native 0.86 / React 19 |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Android Studio (for Android builds) or Xcode (for iOS builds)
- [Expo CLI](https://docs.expo.dev/get-started/installation/)

### Install dependencies
```bash
npm install
```

### Run dev server
```bash
npx expo start
```

> ⚠️ This app uses native modules (Skia, Reanimated, Audio). It will **not** run in Expo Go — you need a development build.

### Build a development APK
```bash
npx expo run:android
```

### Build a release APK
```bash
npx expo run:android --variant release
```

### Build with EAS (cloud)
```bash
npx eas-cli build --platform android --profile production
```

---

## 📁 Project Structure

```
app/
  _layout.tsx          # Root layout, audio session setup
  (tabs)/
    index.tsx          # Breathe screen
    draw.tsx           # Drawing room
    audio.tsx          # Sound library
    journal.tsx        # Journal list
  journal/
    [id].tsx           # Journal entry editor

audio/
  player.ts            # useAudioPlayer hook (expo-audio wrapper)
  ambient.ts           # Preset audio sources + web audio fallback

data/
  storage.ts           # AsyncStorage helpers, types for all data

theme/
  index.tsx            # Color tokens, ThemeProvider

assets/
  audio/               # Bundled WAV files (rain, waves, bowl)
  icon.png
  ...
```

---

## 📦 Data Storage

All data is stored locally on device using AsyncStorage:

| Key | Contents |
|---|---|
| `breathe_journal_entries` | Journal entries array |
| `breathe_audio_tracks` | Uploaded audio track metadata |
| `breathe_drawing_room` | Drawing room state (pages, floor, bin) |
| `breathe_settings` | App settings |

No backend. No accounts. No network required.

---

## 🎨 Draw Architecture

The drawing room persists a `DrawingRoom` object with pages in three locations:

```
canvas  → currently active page (one at a time)
floor   → torn/discarded pages as crumpled balls
bin     → pages dragged to dustbin (max 10)
```

Each `RoomPage` stores:
- `strokes[]` — array of drawn strokes with points, color, size
- `floorX`, `floorY`, `floorRotation` — position when on floor
- `location` — `'canvas' | 'floor' | 'bin'`
- `name?` — optional user-given title

---

## 🔒 Permissions

| Permission | Purpose |
|---|---|
| `RECORD_AUDIO` | Microphone (for future recording feature) |
| `READ_MEDIA_IMAGES` | Save drawings to gallery |
| `WRITE_EXTERNAL_STORAGE` | Save drawings (Android < 10) |
| `READ_EXTERNAL_STORAGE` | Pick audio files |
| `INTERNET` | Audio streaming (future) |

---

## 📄 License

MIT — see [LICENSE](./LICENSE)
