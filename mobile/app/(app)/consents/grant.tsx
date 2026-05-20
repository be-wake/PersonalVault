import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { consents, relyingParties, RelyingParty, SCOPE_LABELS } from '@/src/lib/api';
import Input from '@/src/components/Input';
import Button from '@/src/components/Button';
import LoadingSpinner from '@/src/components/LoadingSpinner';
import { Colors } from '@/src/constants/colors';
import { Ionicons } from '@expo/vector-icons';

const ALL_SCOPES = Object.keys(SCOPE_LABELS);

export default function GrantConsent() {
  const router = useRouter();

  const [parties, setParties] = useState<RelyingParty[]>([]);
  const [loadingParties, setLoadingParties] = useState(true);

  const [selectedRp, setSelectedRp] = useState<RelyingParty | null>(null);
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [purpose, setPurpose] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    relyingParties.list()
      .then(r => setParties(r.relyingParties))
      .catch(() => setError('Failed to load relying parties.'))
      .finally(() => setLoadingParties(false));
  }, []);

  function toggleScope(scope: string) {
    setSelectedScopes(prev =>
      prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]
    );
  }

  async function handleSubmit() {
    if (!selectedRp) { setError('Please select a relying party.'); return; }
    if (selectedScopes.length === 0) { setError('Select at least one scope.'); return; }
    if (!purpose.trim()) { setError('Purpose is required.'); return; }
    setSubmitting(true);
    setError('');
    try {
      await consents.create({
        relyingPartyId: selectedRp.id,
        scopes: selectedScopes,
        purpose: purpose.trim(),
      });
      router.replace('/(app)/consents');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to grant consent.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingParties) return <LoadingSpinner message="Loading…" />;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Grant Data Access</Text>
      </View>

      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

      {/* Step 1: Choose relying party */}
      <Text style={styles.step}>1. Choose a Service</Text>
      <View style={styles.rpList}>
        {parties.map(rp => {
          const selected = selectedRp?.id === rp.id;
          return (
            <TouchableOpacity
              key={rp.id}
              style={[styles.rpItem, selected && styles.rpSelected]}
              onPress={() => {
                setSelectedRp(rp);
                // Pre-filter scopes to only those allowed by the RP
                setSelectedScopes(prev => prev.filter(s => rp.allowedScopes.includes(s)));
              }}
              activeOpacity={0.75}
            >
              <View style={styles.rpItemInner}>
                <View>
                  <Text style={styles.rpName}>{rp.name}</Text>
                  <Text style={styles.rpDomain}>{rp.domain}</Text>
                </View>
                {selected && <Ionicons name="checkmark-circle" size={20} color={Colors.accent} />}
              </View>
              {rp.description ? (
                <Text style={styles.rpDesc}>{rp.description}</Text>
              ) : null}
            </TouchableOpacity>
          );
        })}
        {parties.length === 0 && (
          <Text style={styles.emptyText}>No relying parties available.</Text>
        )}
      </View>

      {/* Step 2: Choose scopes */}
      <Text style={styles.step}>2. Select Data to Share</Text>
      <View style={styles.scopeGrid}>
        {(selectedRp ? selectedRp.allowedScopes : ALL_SCOPES).map(scope => {
          const checked = selectedScopes.includes(scope);
          return (
            <TouchableOpacity
              key={scope}
              style={[styles.scopeChip, checked && styles.scopeChipSelected]}
              onPress={() => toggleScope(scope)}
              activeOpacity={0.75}
            >
              <Text style={[styles.scopeChipText, checked && styles.scopeChipTextSelected]}>
                {SCOPE_LABELS[scope] ?? scope}
              </Text>
              {checked && <Ionicons name="checkmark" size={12} color={Colors.accent} style={{ marginLeft: 4 }} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Step 3: Purpose */}
      <Text style={styles.step}>3. State Your Purpose</Text>
      <Input
        value={purpose}
        onChangeText={setPurpose}
        placeholder="e.g. Checkout at Acme Store"
        multiline
        numberOfLines={3}
        style={{ minHeight: 72, textAlignVertical: 'top' }}
      />

      <Button
        title="Grant Access"
        onPress={handleSubmit}
        loading={submitting}
        disabled={!selectedRp || selectedScopes.length === 0 || !purpose.trim()}
        style={styles.submitBtn}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 20, paddingTop: 52, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  backBtn: { padding: 4 },
  title: { color: Colors.text, fontSize: 20, fontWeight: '700' },
  errorBanner: { backgroundColor: '#3b1212', borderRadius: 8, padding: 10, color: Colors.danger, fontSize: 13, marginBottom: 16 },
  step: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  rpList: { gap: 8, marginBottom: 24 },
  rpItem: { backgroundColor: Colors.card, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 14 },
  rpSelected: { borderColor: Colors.accent, backgroundColor: Colors.accent + '11' },
  rpItemInner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rpName: { color: Colors.text, fontSize: 15, fontWeight: '600' },
  rpDomain: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  rpDesc: { color: Colors.textSecondary, fontSize: 12, marginTop: 8, lineHeight: 17 },
  emptyText: { color: Colors.textMuted, textAlign: 'center', fontSize: 14, paddingVertical: 16 },
  scopeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  scopeChip: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  scopeChipSelected: { borderColor: Colors.accent, backgroundColor: Colors.accent + '22' },
  scopeChipText: { color: Colors.textSecondary, fontSize: 13 },
  scopeChipTextSelected: { color: Colors.accent, fontWeight: '600' },
  submitBtn: { marginTop: 4 },
});
