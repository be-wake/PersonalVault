import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/src/lib/auth';
import { consents, ConsentGrant, SCOPE_LABELS } from '@/src/lib/api';
import LoadingSpinner from '@/src/components/LoadingSpinner';
import { Colors } from '@/src/constants/colors';
import { Ionicons } from '@expo/vector-icons';

function statusColor(s: ConsentGrant['status']) {
  if (s === 'ACTIVE') return Colors.success;
  if (s === 'REVOKED') return Colors.danger;
  return Colors.warning;
}

function GrantItem({ grant, onPress }: { grant: ConsentGrant; onPress: () => void }) {
  const color = statusColor(grant.status);
  return (
    <TouchableOpacity style={styles.grantRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.grantTop}>
        <Text style={styles.rpName}>{grant.rp?.name ?? 'Unknown'}</Text>
        <View style={[styles.badge, { backgroundColor: color + '22' }]}>
          <Text style={[styles.badgeText, { color }]}>{grant.status}</Text>
        </View>
      </View>
      <Text style={styles.purpose} numberOfLines={1}>{grant.purpose}</Text>
      <Text style={styles.scopes}>
        {grant.scopes.map(s => SCOPE_LABELS[s] ?? s).join(' · ')}
      </Text>
      <Text style={styles.date}>
        Granted {new Date(grant.granted_at).toLocaleDateString()}
      </Text>
    </TouchableOpacity>
  );
}

export default function ConsentsIndex() {
  const { user } = useAuth();
  const router = useRouter();

  const [grants, setGrants] = useState<ConsentGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const { grants: g } = await consents.list(user.id);
      setGrants(g);
      setError('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load consents.');
    }
  }, [user]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (loading) return <LoadingSpinner message="Loading consents…" />;

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Consents</Text>
        <TouchableOpacity
          style={styles.grantBtn}
          onPress={() => router.push('/(app)/consents/grant')}
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.grantBtnText}>Grant</Text>
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <FlatList
        data={grants}
        keyExtractor={g => g.id}
        renderItem={({ item }) => (
          <GrantItem
            grant={item}
            onPress={() => router.push(`/(app)/consents/${item.id}`)}
          />
        )}
        contentContainerStyle={grants.length === 0 ? styles.emptyContainer : styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.emptyInner}>
            <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No consent grants yet</Text>
            <Text style={styles.emptyHint}>Tap Grant to share data with a relying party</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingTop: 56 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 16 },
  title: { color: Colors.text, fontSize: 22, fontWeight: '700' },
  grantBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.accent, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  grantBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  errorText: { color: Colors.danger, marginHorizontal: 20, marginBottom: 10, fontSize: 13 },
  list: { paddingHorizontal: 20, paddingBottom: 20 },
  emptyContainer: { flex: 1 },
  emptyInner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 60 },
  emptyText: { color: Colors.textMuted, fontSize: 16, fontWeight: '600' },
  emptyHint: { color: Colors.textMuted, fontSize: 13 },
  grantRow: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
  },
  grantTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  rpName: { color: Colors.text, fontSize: 15, fontWeight: '700' },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  purpose: { color: Colors.textSecondary, fontSize: 13, marginBottom: 4 },
  scopes: { color: Colors.accent, fontSize: 11, marginBottom: 4 },
  date: { color: Colors.textMuted, fontSize: 11 },
  separator: { height: 10 },
});
