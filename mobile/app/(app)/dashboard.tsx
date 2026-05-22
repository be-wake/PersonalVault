import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/src/lib/auth';
import { useRealtime, type RealtimeMessage } from '@/src/lib/ws';
import { consents, auditApi } from '@/src/lib/api';
import Card from '@/src/components/Card';
import { Colors } from '@/src/constants/colors';
import { Ionicons } from '@expo/vector-icons';

interface Stats {
  activeConsents: number;
  recentEvents: number;
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats>({ activeConsents: 0, recentEvents: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [c, a] = await Promise.allSettled([
        consents.list(user.id),
        auditApi.list(user.id, 10),
      ]);
      setStats({
        activeConsents:
          c.status === 'fulfilled'
            ? c.value.grants.filter(g => g.status === 'ACTIVE').length
            : 0,
        recentEvents: a.status === 'fulfilled' ? a.value.events.length : 0,
      });
    } catch {}
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Live updates (F25): keep the stats fresh when consents change.
  const onRealtime = useCallback((msg: RealtimeMessage) => {
    if (msg?.type?.startsWith('CONSENT_') || msg?.event?.startsWith('consent.')) load();
  }, [load]);
  useRealtime(onRealtime);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const vaultItems = [
    { label: 'Identity', icon: 'person-outline' as const, href: '/(app)/vault/identity' as const },
    { label: 'Address', icon: 'location-outline' as const, href: '/(app)/vault/address' as const },
    { label: 'Cards', icon: 'card-outline' as const, href: '/(app)/vault/cards' as const },
    { label: 'Contacts', icon: 'call-outline' as const, href: '/(app)/vault/contacts' as const },
  ];

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
    >
      {/* Header */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.userName}>{user?.name ?? 'User'}</Text>
        </View>
        <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <Card style={styles.statCard}>
          <Text style={styles.statNum}>{stats.activeConsents}</Text>
          <Text style={styles.statLabel}>Active{'\n'}Consents</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statNum}>{stats.recentEvents}</Text>
          <Text style={styles.statLabel}>Recent{'\n'}Events</Text>
        </Card>
      </View>

      {/* Vault quick access */}
      <Text style={styles.sectionTitle}>Your Vault</Text>
      <View style={styles.vaultGrid}>
        {vaultItems.map(item => (
          <TouchableOpacity
            key={item.label}
            style={styles.vaultTile}
            onPress={() => router.push(item.href)}
            activeOpacity={0.75}
          >
            <Ionicons name={item.icon} size={28} color={Colors.accent} />
            <Text style={styles.vaultTileLabel}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Quick actions */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <Card>
        <TouchableOpacity
          style={styles.actionRow}
          onPress={() => router.push('/(app)/consents/grant')}
        >
          <Ionicons name="add-circle-outline" size={20} color={Colors.accent} />
          <Text style={styles.actionLabel}>Grant Data Access</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity
          style={styles.actionRow}
          onPress={() => router.push('/(app)/consents')}
        >
          <Ionicons name="people-outline" size={20} color={Colors.accent} />
          <Text style={styles.actionLabel}>Manage Consents</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity
          style={styles.actionRow}
          onPress={() => router.push('/(app)/history')}
        >
          <Ionicons name="time-outline" size={20} color={Colors.accent} />
          <Text style={styles.actionLabel}>View Audit History</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
        </TouchableOpacity>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 20, paddingTop: 56 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  greeting: { color: Colors.textSecondary, fontSize: 13 },
  userName: { color: Colors.text, fontSize: 22, fontWeight: '700', marginTop: 2 },
  logoutBtn: { padding: 4 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: 20 },
  statNum: { color: Colors.accent, fontSize: 32, fontWeight: '700' },
  statLabel: { color: Colors.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 4 },
  sectionTitle: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  vaultGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 28 },
  vaultTile: {
    width: '47%',
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 20,
    alignItems: 'center',
    gap: 8,
  },
  vaultTileLabel: { color: Colors.text, fontSize: 14, fontWeight: '500' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  actionLabel: { flex: 1, color: Colors.text, fontSize: 14 },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 10 },
});
