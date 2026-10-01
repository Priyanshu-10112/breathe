import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: '#fbf8f3' },
        headerTintColor: '#2b2622',
        headerTitleStyle: { fontWeight: '700', fontSize: 18 },
        tabBarActiveTintColor: '#c85a3c',
        tabBarInactiveTintColor: '#a99f91',
        tabBarStyle: {
          backgroundColor: '#fbf8f3',
          borderTopColor: '#ece7de',
          height: 64,
          paddingBottom: 10,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Breathe',
          headerTitle: 'Breathe',
          tabBarIcon: ({ color, size }) => <Ionicons name="water" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="audio"
        options={{
          title: 'Audio',
          headerTitle: 'Sound Library',
          tabBarIcon: ({ color, size }) => <Ionicons name="musical-notes" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="draw"
        options={{
          title: 'Draw',
          headerTitle: 'Sketchbook',
          tabBarIcon: ({ color, size }) => <Ionicons name="create" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="journal"
        options={{
          title: 'Journal',
          headerTitle: 'Journal',
          tabBarIcon: ({ color, size }) => <Ionicons name="book" size={size} color={color} />,
        }}
      />
    </Tabs>
  )
}