import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/src/lib/auth';
import { vault, IdentityData } from '@/src/lib/api';
import Input from '@/src/components/Input';
import Button from '@/src/components/Button';
import LoadingSpinner from '@/src/components/LoadingSpinner';
import { Colors } from '@/src/constants/colors';
import { Ionicons } from '@expo/vector-icons';

export default function IdentityScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [data, setData] = useState<IdentityData>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!user) return;
    vault.getIdentity(user.id)
      .then(r => setData(r.identity))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const r = await vault.updateIdentity(user.id, data);
      setData(r.identity);
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Identity</Text>
      </View>

      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
      {success ? <Text style={styles.successBanner}>Saved successfully</Text> : null}

      <Input label="First Name" value={data.first_name ?? ''} onChangeText={v => setData(d => ({ ...d, first_name: v }))} placeholder="Jane" />
      <Input label="Last Name" value={data.last_name ?? ''} onChangeText={v => setData(d => ({ ...d, last_name: v }))} placeholder="Smith" />
      <Input label="Email (Primary)" value={data.email_primary ?? ''} onChangeText={v => setData(d => ({ ...d, email_primary: v }))} keyboardType="email-address" autoCapitalize="none" placeholder="jane@example.com" />
      <Input label="Date of Birth" value={data.date_of_birth ?? ''} onChangeText={v => setData(d => ({ ...d, date_of_birth: v }))} placeholder="YYYY-MM-DD" />
      <Input label="ID Type" value={data.id_type ?? ''} onChangeText={v => setData(d => ({ ...d, id_type: v }))} placeholder="passport / driver_license" autoCapitalize="none" />
      <Input label="ID Number" value={data.id_number ?? ''} onChangeText={v => setData(d => ({ ...d, id_number: v }))} placeholder="AB123456" autoCapitalize="characters" />

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
