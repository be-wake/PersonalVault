import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/src/lib/auth';
import { vault, AddressData } from '@/src/lib/api';
import Input from '@/src/components/Input';
import Button from '@/src/components/Button';
import LoadingSpinner from '@/src/components/LoadingSpinner';
import { Colors } from '@/src/constants/colors';
import { Ionicons } from '@expo/vector-icons';

export default function AddressScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [data, setData] = useState<AddressData>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!user) return;
    vault.getAddress(user.id)
      .then(r => setData(r.address))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const r = await vault.updateAddress(user.id, data);
      setData(r.address);
      setSuccess(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingSpinner message="Loading…" />;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Address</Text>
      </View>

      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
      {success ? <Text style={styles.successBanner}>Saved successfully</Text> : null}

      <Input label="Type" value={data.type ?? ''} onChangeText={v => setData(d => ({ ...d, type: v }))} placeholder="home / work" autoCapitalize="none" />
      <Input label="Address Line 1" value={data.line1 ?? ''} onChangeText={v => setData(d => ({ ...d, line1: v }))} placeholder="123 Main St" />
      <Input label="Address Line 2" value={data.line2 ?? ''} onChangeText={v => setData(d => ({ ...d, line2: v }))} placeholder="Apt 4B" />
      <Input label="City" value={data.city ?? ''} onChangeText={v => setData(d => ({ ...d, city: v }))} placeholder="New York" />
      <Input label="State / Province" value={data.state ?? ''} onChangeText={v => setData(d => ({ ...d, state: v }))} placeholder="NY" />
      <Input label="Postal Code" value={data.postal ?? ''} onChangeText={v => setData(d => ({ ...d, postal: v }))} placeholder="10001" keyboardType="numeric" />
      <Input label="Country" value={data.country ?? ''} onChangeText={v => setData(d => ({ ...d, country: v }))} placeholder="US" autoCapitalize="characters" />

      <Button title="Save Changes" onPress={handleSave} loading={saving} style={styles.saveBtn} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 20, paddingTop: 52 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  backBtn: { padding: 4 },
  title: { color: Colors.text, fontSize: 20, fontWeight: '700' },
  errorBanner: { backgroundColor: '#3b1212', borderRadius: 8, padding: 10, color: Colors.danger, fontSize: 13, marginBottom: 14 },
  successBanner: { backgroundColor: '#0d2b18', borderRadius: 8, padding: 10, color: Colors.success, fontSize: 13, marginBottom: 14 },
  saveBtn: { marginTop: 8 },
});
