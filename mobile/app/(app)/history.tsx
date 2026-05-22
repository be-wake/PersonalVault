import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useAuth } from '@/src/lib/auth';
import { auditApi, AuditEvent, AuditResource } from '@/src/lib/api';
import LoadingSpinner from '@/src/components/LoadingSpinner';
import { Colors } from '@/src/constants/colors';
import { Ionicons } from '@expo/vector-icons';

const RESOURCE_FILTERS: { label: string; value: '' | AuditResource }[] = [
  { label: 'All',      value: '' },
  { label: 'Identity', value: 'identity' },
  { label: 'Address',  value: 'address' },
  { label: 'Payment',  value: 'payment' },
  { label: 'Contacts', value: 'contacts' },
  { label: 'Consent',  value: 'consent' },
];

const EVENT_ICONS: Record<string, string> = {
  CONSENT_GRANTED: 'checkmark-circle-outline',
  CONSENT_REVOKED: 'close-circle-outline',
  DATA_ACCESSED:   'eye-outline',
  LOGIN:           'log-in-outline',
  REGISTER:        'person-add-outline',
};

function eventColor(type: string): string {
  if (type.includes('GRANT'))  return Colors.success;
  if (type.includes('REVOK'))  return Colors.danger;
  if (type.includes('ACCESS')) return Colors.accent;
  return Colors.textSecondary;
}

function formatDate(ts: string) {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    + ' · '
    + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function EventItem({ item }: { item: AuditEvent }) {
  const icon = (EVENT_ICONS[item.event_type] ?? 'information-circle-outline') as any;
  const color = eventColor(item.event_type);
  // Prefer the human-readable label the backend builds; fall back to the
  // raw event type for older backends.
  const headline = item.label ?? item.event_type.replace(/_/g, ' ');
  return (
    <View style={styles.eventRow}>
      <View style={[styles.iconWrap, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={styles.eventText}>
        <Text style={styles.eventType}>{headline}</Text>
        {item.rp_name ? <Text style={styles.eventRp}>{item.rp_name}</Text> : null}
        <Text style={styles.eventTime}>{formatDate(item.timestamp)}</Text>
      </View>
    </View>
  );
}

export default function History() {
  const { user } = useAuth();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [resource, setResource] = useState<'' | AuditResource>('');

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const { events: ev } = await auditApi.list(user.id, {
        limit:    50,
        resource: resource || undefined,
      });
      setEvents(ev);
      setError('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load history.');
    }
  }, [user, resource]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (loading) return <LoadingSpinner message="Loading history…" />;

  return (
    <View style={styles.container}>
      <Text style={styles.pageTitle}>Audit History</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {RESOURCE_FILTERS.map(f => {
          const active = resource === f.value;
          return (
            <TouchableOpacity
              key={f.value || 'all'}
              onPress={() => setResource(f.value)}
              style={[styles.chip, active && styles.chipActive]}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <FlatList
        data={events}
        keyExtractor={e => e.id}
        renderItem={({ item }) => <EventItem item={item} />}
        contentContainerStyle={events.length === 0 ? styles.empty : styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />
        }
        ListEmptyComponent={
          <View style={styles.emptyInner}>
            <Ionicons name="time-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No audit events yet</Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingTop: 56 },
  pageTitle: { color: Colors.text, fontSize: 22, fontWeight: '700', paddingHorizontal: 20, marginBottom: 12 },
  filterRow: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.accent + '22',
    borderColor: Colors.accent,
  },
  chipText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '500' },
  chipTextActive: { color: Colors.accent, fontWeight: '700' },
  list: { paddingHorizontal: 20, paddingBottom: 24 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyInner: { alignItems: 'center', gap: 12, marginTop: 60 },
  emptyText: { color: Colors.textMuted, fontSize: 15 },
  eventRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12 },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  eventText: { flex: 1 },
  eventType: { color: Colors.text, fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
  eventRp: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  eventTime: { color: Colors.textMuted, fontSize: 11, marginTop: 3 },
  separator: { height: 1, backgroundColor: Colors.border },
  errorText: { color: Colors.danger, marginHorizontal: 20, marginBottom: 12, fontSize: 13 },
});
