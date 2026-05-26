import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useAuth } from '@/src/lib/auth';
import Button from '@/src/components/Button';
import Input from '@/src/components/Input';
import { Colors } from '@/src/constants/colors';

export default function Register() {
  const { register } = useAuth();
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleRegister() {
    if (!name.trim() || !email.trim() || !password) {
      setError('All fields are required.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await register(name.trim(), email.trim(), password);
      router.replace('/(app)/dashboard');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoGlyph}>PDV</Text>
          </View>
          <Text style={styles.title}>Create Your Vault</Text>
          <Text style={styles.subtitle}>Your data, your control</Text>
        </View>

        <View style={styles.form}>
          {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

          <Input
            label="Full Name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            placeholder="Jane Smith"
          />
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="you@example.com"
          />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            secureToggle
            placeholder="Min. 8 characters"
          />
          <Input
            label="Confirm Password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            secureToggle
            placeholder="Repeat password"
          />

          <Button
            title="Create Account"
            onPress={handleRegister}
            loading={loading}
            style={styles.submitBtn}
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <Link href="/(auth)/sign-in" style={styles.link}>Sign in</Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: 56, paddingBottom: 40 },
  header: { alignItems: 'center', marginBottom: 28 },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: Colors.accentDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  logoGlyph: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', letterSpacing: 0.8 },
  title: { fontSize: 30, fontWeight: '800', color: Colors.text, marginBottom: 6 },
  subtitle: { fontSize: 14, color: Colors.textSecondary },
  form: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
    shadowColor: '#1B3A5C',
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  errorBanner: {
    backgroundColor: Colors.dangerSoft,
    borderRadius: 10,
    padding: 10,
    color: Colors.danger,
    fontSize: 13,
    marginBottom: 14,
  },
  submitBtn: { marginTop: 8 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 22 },
  footerText: { color: Colors.textSecondary, fontSize: 14 },
  link: { color: Colors.accentDark, fontSize: 14, fontWeight: '700' },
});
