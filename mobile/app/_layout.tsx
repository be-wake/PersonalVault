import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/src/lib/auth';
import ErrorBoundary from '@/src/components/ErrorBoundary';
import { Colors } from '@/src/constants/colors';
import { initLogShipper, shutdownLogShipper } from '@/src/lib/logShipper';

export default function RootLayout() {
  useEffect(() => {
    initLogShipper();
    return () => { shutdownLogShipper().catch(() => {}); };
  }, []);

  return (
    // C11 — catches render errors anywhere in the tree
    <ErrorBoundary>
      <AuthProvider>
        <StatusBar style="light" backgroundColor={Colors.background} />
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </ErrorBoundary>
  );
}
