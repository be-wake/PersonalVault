import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router';
import { useAuth } from '@/src/lib/auth';
import { WebSocketProvider } from '@/src/lib/ws';
import LoadingSpinner from '@/src/components/LoadingSpinner';
import { Colors } from '@/src/constants/colors';
import { Ionicons } from '@expo/vector-icons';

export default function AppLayout() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <LoadingSpinner />;
  if (!user) return <Redirect href="/(auth)/sign-in" />;

  // One WebSocket for the authenticated app (F25) — every tab can react to
  // CONSENT_GRANTED / CONSENT_REVOKED / CONSENT_EXPIRED in real time.
  return (
    <WebSocketProvider>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          paddingBottom: 4,
          height: 58,
        },
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="vault"
        options={{
          title: 'Vault',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="shield-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="consents"
        options={{
          title: 'Consents',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
    </WebSocketProvider>
  );
}
