/**
 * F24 — Profile / Settings screen.
 *
 * Shows the signed-in user's details, GDPR actions (export, delete account),
 * and a sign-out button.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Share,
} from 'react-native';
import { useAuth } from '@/src/lib/auth';
import { accountApi } from '@/src/lib/api';
import Button from '@/src/components/Button';
import Card from '@/src/components/Card';
import { Colors } from '@/src/constants/colors';
import { Ionicons } from '@expo/vector-icons';

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function SettingsRow({
  icon,
  label,
  sublabel,
  onPress,
  destructive = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel?: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.rowIcon, destructive && styles.rowIconDanger]}>
        <Ionicons name={icon} size={18} color={destructive ? Colors.danger : Colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, destructive && { color: Colors.danger }]}>{label}</Text>
        {sublabel ? <Text style={styles.rowSublabel}>{sublabel}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const data = await accountApi.export();
      await Share.share({
        title: 'Tijori Export',
        message: JSON.stringify(data, null, 2),
      });
    } catch (e: unknown) {
      Alert.alert('Export failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setExporting(false);
    }
  }

  function handleDeleteAccount() {
    Alert.alert(
      'Delete Account',
      'This permanently deletes your vault data and cannot be undone. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // Step-up auth required — guide the user to re-authenticate first.
            // Full biometric/step-up flow is tracked under F18.
            Alert.alert(
              'Re-authentication required',
              'Account deletion requires password confirmation. This will be available once step-up auth is enabled.',
            );
          },
        },
      ],
    );
  }

  function handleLogout() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: logout },
    ]);
  }

  const joinDate = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    : null;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      {/* Avatar + name */}
      <View style={styles.avatar}>
        <Ionicons name="person" size={36} color={Colors.accent} />
      </View>
      <Text style={styles.name}>{user?.name ?? 'User'}</Text>
      <Text style={styles.email}>{user?.email}</Text>
      {joinDate ? (
        <Text style={styles.joinDate}>Member since {joinDate}</Text>
      ) : null}

      {/* Account info */}
      <Card style={styles.card}>
        <SectionHeader title="Account" />
        <SettingsRow
          icon="mail-outline"
          label="Email"
          sublabel={user?.email}
          onPress={() => {}}
        />
        <View style={styles.divider} />
        <SettingsRow
          icon="id-card-outline"
          label="User ID"
          sublabel={user?.id}
          onPress={() => {}}
        />
      </Card>

      {/* Privacy & GDPR */}
      <Card style={styles.card}>
        <SectionHeader title="Privacy" />
        <SettingsRow
          icon="download-outline"
          label="Export my data"
          sublabel="Download a copy of everything in your vault"
          onPress={handleExport}
        />
      </Card>

      {/* Danger zone */}
      <Card style={styles.card}>
        <SectionHeader title="Danger zone" />
        <SettingsRow
          icon="trash-outline"
          label="Delete account"
          sublabel="Permanently erase all data"
          onPress={handleDeleteAccount}
          destructive
        />
      </Card>

      {/* Sign out */}
      <Button
        title="Sign out"
        variant="ghost"
        onPress={handleLogout}
        loading={exporting}
        style={styles.logoutBtn}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 20, paddingTop: 60, paddingBottom: 40, alignItems: 'center' },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.accent + '22',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  name:      { color: Colors.text, fontSize: 22, fontWeight: '700' },
  email:     { color: Colors.textSecondary, fontSize: 14, marginTop: 4 },
  joinDate:  { color: Colors.textMuted, fontSize: 12, marginTop: 4, marginBottom: 24 },
  card:      { width: '100%', marginBottom: 12 },
  sectionHeader: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: Colors.accent + '1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconDanger: { backgroundColor: Colors.danger + '1A' },
  rowLabel:   { color: Colors.text, fontSize: 14, fontWeight: '500' },
  rowSublabel:{ color: Colors.textMuted, fontSize: 12, marginTop: 1 },
  divider:    { height: 1, backgroundColor: Colors.border, marginVertical: 4 },
  logoutBtn:  { width: '100%', marginTop: 8 },
});
