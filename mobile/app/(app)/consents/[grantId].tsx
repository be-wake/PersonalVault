import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/src/lib/auth';
import { consents, ConsentGrant, SCOPE_LABELS } from '@/src/lib/api';
import Button from '@/src/components/Button';
import Card from '@/src/components/Card';
import LoadingSpinner from '@/src/components/LoadingSpinner';
import { Colors } from '@/src/constants/colors';
import { Ionicons } from '@expo/vector-icons';

function statusColor(s: ConsentGrant['status']) {
  if (s === 'ACTIVE') return Colors.success;
  if (s === 'REVOKED') return Colors.danger;
  return Colors.warning;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={rowStyles.wrap}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={rowStyles.value}>{value}</Text>
    </View>
  );
}
const rowStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  label: { color: Colors.textSecondary, fontSize: 13 },
  value: { color: Colors.text, fontSize: 13, fontWeight: '500', flex: 1, textAlign: 'right' },
});

export default function GrantDetail() {
  const { grantId } = useLocalSearchParams<{ grantId: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const [grant, setGrant] = useState<ConsentGrant | null>(null);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || !grantId) return;
    consents.get(user.id, grantId)
      .then(r => setGrant(r.grant))
      .catch(e => setError(e.message ?? 'Not found.'))
      .finally(() => setLoading(false));
  }, [user, grantId]);

  async function handleRevoke() {
    if (!grant) return;
    Alert.alert(
      'Revoke Consent',
      `Stop sharing your data with ${grant.rp?.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            setRevoking(true);
            try {
              const r = await consents.revoke(grant.id);
              setGrant(r.grant);
            } catch (e: unknown) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Revoke failed.');
            } finally {
              setRevoking(false);
            }
          },
        },
      ]
    );
  }

  if (loading) return <LoadingSpinner message="Loading…" />;
  if (error || !grant) {
    return (
      <View style={styles.errorWrap}>
        <Text style={styles.errorText}>{error || 'Grant not found.'}</Text>
        <Button title="Go Back" variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  const color = statusColor(grant.status);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Consent Detail</Text>
      </View>

      <Card style={styles.card}>
        <View style={styles.rpRow}>
          <View style={styles.rpIcon}>
            <Ionicons name="business-outline" size={24} color={Colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rpName}>{grant.rp?.name}</Text>
            <Text style={styles.rpDomain}>{grant.rp?.domain}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: color + '22' }]}>
            <Text style={[styles.badgeText, { color }]}>{grant.status}</Text>
          </View>
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Purpose</Text>
        <Text style={styles.purposeText}>{grant.purpose}</Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Shared Scopes</Text>
        {grant.scopes.map(scope => (
          <View key={scope} style={styles.scopeRow}>
            <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
            <Text style={styles.scopeText}>{SCOPE_LABELS[scope] ?? scope}</Text>
          </View>
        ))}
      </Card>

      <Card>
        <Row label="Granted" value={new Date(grant.granted_at).toLocaleString()} />
        <Row
          label="Expires"
          value={grant.expires_at ? new Date(grant.expires_at).toLocaleString() : 'Never'}
        />
        {grant.revoked_at ? (
          <Row label="Revoked" value={new Date(grant.revoked_at).toLocaleString()} />
        ) : null}
        <Row label="PCI Scope" value={grant.rp?.pciScope ? 'Yes' : 'No'} />
      </Card>

      {grant.status === 'ACTIVE' && (
        <Button
          title="Revoke Consent"
          variant="danger"
          onPress={handleRevoke}
          loading={revoking}
          style={styles.revokeBtn}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 20, paddingTop: 52, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  backBtn: { padding: 4 },
  title: { color: Colors.text, fontSize: 20, fontWeight: '700' },
  card: { marginBottom: 12 },
  rpRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rpIcon: { width: 44, height: 44, backgroundColor: Colors.accent + '22', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rpName: { color: Colors.text, fontSize: 16, fontWeight: '700' },
  rpDomain: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  sectionTitle: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  purposeText: { color: Colors.text, fontSize: 14, lineHeight: 20 },
  scopeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  scopeText: { color: Colors.text, fontSize: 13 },
  revokeBtn: { marginTop: 8 },
  errorWrap: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: Colors.danger, fontSize: 15, marginBottom: 16, textAlign: 'center' },
});
