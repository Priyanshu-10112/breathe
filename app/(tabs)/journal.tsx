import { View, Text, Pressable, TextInput, ScrollView, StyleSheet, Alert } from 'react-native'
import { useState, useEffect } from 'react'
import { useRouter, useFocusEffect } from 'expo-router'
import { readJson, writeJson, JOURNAL_KEY } from '../../data/storage'

type Entry = { id: string; title: string; body: string; updatedAt: number }

export default function JournalScreen() {
  const [entries, setEntries] = useState<Entry[]>([])
  const router = useRouter()

  const load = async () => {
    const data = await readJson<Entry[]>(JOURNAL_KEY, [])
    data.sort((a, b) => b.updatedAt - a.updatedAt)
    setEntries(data)
  }

  useFocusEffect(() => { load() })

  const newEntry = () => {
    router.push('/journal/new')
  }

  const remove = (id: string) => {
    Alert.alert('Delete entry?', 'This cannot be undone.', [
      { text: 'Cancel' },
      {
        text: 'Delete', onPress: async () => {
          const next = entries.filter((e) => e.id !== id)
          setEntries(next)
          await writeJson(JOURNAL_KEY, next)
        },
      },
    ])
  }

  const fmt = (ts: number) => {
    const d = new Date(ts)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
      ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <View style={styles.screen}>
      <View style={styles.head}>
        <Text style={styles.headTitle}>Journal</Text>
        <Pressable onPress={newEntry} style={styles.addBtn}>
          <Text style={styles.addBtnText}>＋</Text>
        </Pressable>
      </View>

      {entries.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>✎</Text>
          <Text style={styles.emptyTitle}>Nothing written yet</Text>
          <Text style={styles.emptySub}>Tap ＋ to start your first entry.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {entries.map((e) => (
            <Pressable
              key={e.id}
              style={styles.card}
              onPress={() => router.push(`/journal/${e.id}`)}
              onLongPress={() => remove(e.id)}
            >
              <Text style={styles.cardTitle} numberOfLines={1}>{e.title || 'Untitled'}</Text>
              <Text style={styles.cardBody} numberOfLines={3}>{e.body || 'No text'}</Text>
              <Text style={styles.cardDate}>{fmt(e.updatedAt)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f6f4f0' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#ece7de' },
  headTitle: { fontSize: 28, fontWeight: '700', color: '#2b2622' },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#c85a3c', alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: '#fff', fontSize: 26, lineHeight: 28, fontWeight: '300' },
  list: { padding: 20, gap: 12, paddingBottom: 100 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#ece7de', shadowColor: '#2b2622', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#2b2622', marginBottom: 6 },
  cardBody: { fontSize: 15, color: '#6b635b', lineHeight: 22, marginBottom: 8 },
  cardDate: { fontSize: 12, color: '#a99f91' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 14 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#2b2622', marginBottom: 6 },
  emptySub: { fontSize: 14, color: '#a99f91', textAlign: 'center', lineHeight: 20 },
})