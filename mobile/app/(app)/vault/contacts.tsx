import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/src/lib/auth';
import { vault, ContactsData } from '@/src/lib/api';
import Input from '@/src/components/Input';
import Button from '@/src/components/Button';
import LoadingSpinner from '@/src/components/LoadingSpinner';
import { Colors } from '@/src/constants/colors';
import { Ionicons } from '@expo/vector-icons';

export default function ContactsScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [data, setData] = useState<ContactsData>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!user) return;
    vault.getContacts(user.id)
      .then(r => setData(r.contacts))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const r = await vault.updateContacts(user.id, data);
      setData(r.contacts);
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
        <Text style={styles.title}>Contacts</Text>
      </View>

      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
      {success ? <Text style={styles.successBanner}>Saved successfully</Text> : null}

      <Input label="Primary Phone" value={data.phone_primary ?? ''} onChangeText={v => setData(d => ({ ...d, phone_primary: v }))} keyboardType="phone-pad" placeholder="+1 555 000 0000" />
      <Input label="Phone Type" value={data.phone_type ?? ''} onChangeText={v => setData(d => ({ ...d, phone_type: v }))} placeholder="mobile / home / work" autoCapitalize="none" />
      <Input label="Secondary Email" value={data.email_secondary ?? ''} onChangeText={v => setData(d => ({ ...d, email_secondary: v }))} keyboardType="email-address" autoCapitalize="none" placeholder="backup@example.com" />

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
