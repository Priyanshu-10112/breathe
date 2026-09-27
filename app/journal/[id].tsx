import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert } from 'react-native'
import { useState, useEffect } from 'react'
import { useLocalSearchParams, router, Stack } from 'expo-router'
import { readJson, writeJson, JOURNAL_KEY } from '../../data/storage'

type Entry = { id: string; title: string; body: string; updatedAt: number }

export default function JournalEditor() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const isNew = id === 'new'
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  useEffect(() => {
    if (isNew) return
    ;(async () => {
      const entries = await readJson<Entry[]>(JOURNAL_KEY, [])
      const found = entries.find((e) => e.id === id)
      if (found) {
        setTitle(found.title)
        setBody(found.body)
      }
    })()
  }, [id, isNew])

  const save = async () => {
    const entries = await readJson<Entry[]>(JOURNAL_KEY, [])
    let next: Entry[]
    if (isNew) {
      next = [{ id: Date.now().toString(), title: title.trim(), body, updatedAt: Date.now() }, ...entries]
    } else {
      next = entries.map((e) =>
        e.id === id ? { ...e, title: title.trim(), body, updatedAt: Date.now() } : e
      )
    }
    await writeJson(JOURNAL_KEY, next)
    router.back()
  }

  const remove = () => {
    Alert.alert('Delete entry?', 'This cannot be undone.', [
      { text: 'Cancel' },
      {
        text: 'Delete', onPress: async () => {
          const entries = await readJson<Entry[]>(JOURNAL_KEY, [])
          await writeJson(JOURNAL_KEY, entries.filter((e) => e.id !== id))
          router.back()
        },
      },
    ])
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerTitle: isNew ? 'New Entry' : 'Edit', headerBackTitle: 'Back' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextInput
          style={styles.titleInput}
          placeholder="Title"
          placeholderTextColor="#a99f91"
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          style={styles.bodyInput}
          placeholder="Write here…"
          placeholderTextColor="#a99f91"
          multiline
          value={body}
          onChangeText={setBody}
          textAlignVertical="top"
        />
      </ScrollView>
      <View style={styles.footer}>
        {isNew ? null : (
          <Pressable onPress={remove} style={styles.delBtn}>
            <Text style={styles.delBtnText}>Delete</Text>
          </Pressable>
        )}
        <Pressable onPress={save} style={[styles.saveBtn, (!title.trim() && !body) && styles.saveBtnDisabled]}>
          <Text style={styles.saveBtnText}>Save</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f6f4f0' },
  content: { padding: 20, gap: 14, paddingBottom: 100 },
  titleInput: { fontSize: 24, fontWeight: '700', color: '#2b2622' },
  bodyInput: { fontSize: 17, color: '#2b2622', lineHeight: 26, minHeight: 300 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderTopWidth: 1, borderTopColor: '#ece7de', backgroundColor: '#f6f4f0' },
  delBtn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, backgroundColor: '#f7dde3' },
  delBtnText: { color: '#c85a6e', fontWeight: '700' },
  saveBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, backgroundColor: '#c85a3c' },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnText: { color: '#fff', fontWeight: '700' },
})