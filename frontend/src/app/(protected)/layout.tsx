'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from '@/lib/auth';
import { WebSocketProvider } from '@/lib/ws';
import BottomNav from '@/components/BottomNav';
import Spinner from '@/components/Spinner';

function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuthState();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/auth/sign-in');
  }, [user, loading, router]);

  if (loading) return <Spinner fullPage />;
  if (!user)   return null;

  return (
    <WebSocketProvider>
      <main className="min-h-dvh pb-20 bg-[var(--color-bg)]">
        {children}
      </main>
      <BottomNav />
    </WebSocketProvider>
  );
}

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
