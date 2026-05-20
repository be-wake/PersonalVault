import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/src/lib/auth';
import { Colors } from '@/src/constants/colors';
import { initLogShipper, shutdownLogShipper } from '@/src/lib/logShipper';

export default function RootLayout() {
  useEffect(() => {
    initLogShipper();
    return () => { shutdownLogShipper().catch(() => {}); };
  }, []);

  return (
    <AuthProvider>
      <StatusBar style="light" backgroundColor={Colors.background} />
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  );
}
