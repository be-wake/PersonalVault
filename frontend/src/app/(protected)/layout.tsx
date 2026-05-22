'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from '@/lib/auth';
import { WebSocketProvider } from '@/lib/ws';
import BottomNav from '@/components/BottomNav';

// AuthProvider is mounted at the root layout — this guard just reads from it.
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthState();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/auth/sign-in');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-bg)',
        }}
      >
        <div className="spinner" />
      </div>
    );
  }

  if (!user) return null;

  // One WebSocket for the whole authenticated app (F22/C6) — every screen can
  // now react to CONSENT_GRANTED / CONSENT_REVOKED / CONSENT_EXPIRED.
  return (
    <WebSocketProvider>
      <main
        style={{
          minHeight: '100dvh',
          paddingBottom: 80,
          background: 'var(--color-bg)',
        }}
      >
        {children}
      </main>
      <BottomNav />
    </WebSocketProvider>
  );
}

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
