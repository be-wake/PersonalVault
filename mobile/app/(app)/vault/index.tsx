import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/src/constants/colors';
import { Ionicons } from '@expo/vector-icons';

const VAULT_SECTIONS = [
  {
    label: 'Identity',
    description: 'Name, date of birth, government ID',
    icon: 'person-outline' as const,
    href: '/(app)/vault/identity' as const,
  },
  {
    label: 'Address',
    description: 'Home or work address',
    icon: 'location-outline' as const,
    href: '/(app)/vault/address' as const,
  },
  {
    label: 'Payment Cards',
    description: 'Saved card references',
    icon: 'card-outline' as const,
    href: '/(app)/vault/cards' as const,
  },
  {
    label: 'Contacts',
    description: 'Phone numbers, secondary email',
    icon: 'call-outline' as const,
    href: '/(app)/vault/contacts' as const,
  },
];

export default function VaultIndex() {
  const router = useRouter();

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Your Vault</Text>
      <Text style={styles.subtitle}>Securely stored personal data</Text>

      <View style={styles.list}>
        {VAULT_SECTIONS.map((section, idx) => (
          <TouchableOpacity
            key={section.label}
            style={[styles.item, idx < VAULT_SECTIONS.length - 1 && styles.itemBorder]}
            onPress={() => router.push(section.href)}
            activeOpacity={0.7}
          >
            <View style={styles.iconWrap}>
              <Ionicons name={section.icon} size={22} color={Colors.accent} />
            </View>
            <View style={styles.itemText}>
              <Text style={styles.itemLabel}>{section.label}</Text>
              <Text style={styles.itemDesc}>{section.description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 20, paddingTop: 56 },
  title: { color: Colors.text, fontSize: 22, fontWeight: '700', marginBottom: 4 },
  subtitle: { color: Colors.textSecondary, fontSize: 13, marginBottom: 24 },
  list: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  item: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  iconWrap: {
    width: 40,
    height: 40,
    backgroundColor: Colors.accent + '22',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: { flex: 1 },
  itemLabel: { color: Colors.text, fontSize: 15, fontWeight: '600' },
  itemDesc: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
});
