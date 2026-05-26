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

export default function SignIn() {
  const { login } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSignIn() {
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await login(email.trim(), password);
      router.replace('/(app)/dashboard');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Sign-in failed.');
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
        {/* Logo / branding */}
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoGlyph}>PDV</Text>
          </View>
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to access your secure vault</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

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
            placeholder="••••••••"
          />

          <Button
            title="Sign In"
            onPress={handleSignIn}
            loading={loading}
            style={styles.submitBtn}
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <Link href="/(auth)/register" style={styles.link}>Create one</Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: 64, paddingBottom: 40 },
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
