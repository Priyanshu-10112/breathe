import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useState, useEffect } from 'react'
import { useLocalSearchParams, router, Stack } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { readJson, writeJson, JOURNAL_KEY } from '../../data/storage'
import { colors } from '../../theme'

type Entry = { id: string; title: string; body: string; updatedAt: number }

export default function JournalEditor() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const isNew = id === 'new'
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  useEffect(() => {
    if (isNew) return
    let active = true
    readJson<Entry[]>(JOURNAL_KEY, []).then((entries) => {
      if (!active) return
      const found = entries.find((e) => e.id === id)
      if (found) {
        setTitle(found.title)
        setBody(found.body)
      }
    })
    return () => {
      active = false
    }
  }, [id, isNew])

  const isValid = Boolean(title.trim() || body.trim())

  const save = async () => {
    if (!isValid) return
    const entries = await readJson<Entry[]>(JOURNAL_KEY, [])
    let next: Entry[]
    if (isNew) {
      next = [
        { id: Date.now().toString(), title: title.trim(), body: body.trim(), updatedAt: Date.now() },
        ...entries,
      ]
    } else {
      next = entries.map((e) =>
        e.id === id ? { ...e, title: title.trim(), body: body.trim(), updatedAt: Date.now() } : e
      )
    }
    await writeJson(JOURNAL_KEY, next)
    router.back()
  }

  const remove = () => {
    Alert.alert('Delete entry?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const entries = await readJson<Entry[]>(JOURNAL_KEY, [])
          await writeJson(JOURNAL_KEY, entries.filter((e) => e.id !== id))
          router.back()
        },
      },
    ])
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: isNew ? 'New Entry' : 'Edit Entry',
          headerBackTitle: 'Back',
          headerStyle: { backgroundColor: colors.bgSoft },
          headerTintColor: colors.ink,
          headerTitleStyle: { fontWeight: '700' },
        }}
      />
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <TextInput
            style={styles.titleInput}
            placeholder="Title"
            placeholderTextColor={colors.muted}
            value={title}
            onChangeText={setTitle}
          />
          <TextInput
            style={styles.bodyInput}
            placeholder="Write here…"
            placeholderTextColor={colors.muted}
            multiline
            value={body}
            onChangeText={setBody}
            textAlignVertical="top"
          />
        </ScrollView>

        <View style={styles.footer}>
          {isNew ? (
            <View style={styles.placeholder} />
          ) : (
            <Pressable onPress={remove} style={styles.delBtn}>
              <Text style={styles.delBtnText}>Delete</Text>
            </Pressable>
          )}
          <Pressable
            onPress={save}
            disabled={!isValid}
            style={[styles.saveBtn, !isValid && styles.saveBtnDisabled]}
          >
            <Text style={styles.saveBtnText}>Save</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  keyboardContainer: { flex: 1 },
  content: { padding: 20, gap: 14, flexGrow: 1 },
  titleInput: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.ink,
    paddingVertical: 8,
  },
  bodyInput: {
    fontSize: 16,
    color: colors.ink,
    lineHeight: 24,
    minHeight: 240,
    paddingVertical: 8,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.white,
  },
  placeholder: { width: 1 },
  delBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.roseSoft,
  },
  delBtnText: { color: colors.rose, fontWeight: '700', fontSize: 15 },
  saveBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.brand,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
})