'use client';

// E23 — removed unused Button import.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from '@/lib/auth';

export default function LandingPage() {
  const router = useRouter();
  // S1 — auth is now cookie-based; check session via AuthContext instead of localStorage.
  const { user, loading } = useAuthState();

  useEffect(() => {
    if (!loading && user) {
      router.replace('/dashboard');
    }
  }, [loading, user, router]);

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-navy)',
      }}
    >
      {/* Hero */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 24px 32px',
          textAlign: 'center',
        }}
      >
        {/* Shield logo */}
        <div
          style={{
            width: 88,
            height: 88,
            borderRadius: 24,
            background: 'rgba(255,255,255,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 28,
          }}
        >
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <path
              d="M24 4L8 10V24C8 33.6 15.2 42.4 24 44C32.8 42.4 40 33.6 40 24V10L24 4Z"
              fill="white"
              opacity="0.95"
            />
            <path
              d="M19 24L22.5 27.5L30 20"
              stroke="var(--color-navy)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h1
          style={{
            fontSize: 32,
            fontWeight: 800,
            color: 'white',
            marginBottom: 12,
            letterSpacing: '-0.5px',
          }}
        >
          Personal Data Vault
        </h1>

        <p
          style={{
            fontSize: 16,
            color: 'rgba(255,255,255,0.72)',
            maxWidth: 300,
            lineHeight: 1.6,
            marginBottom: 48,
          }}
        >
          Take full control of your personal data. Choose exactly what you share, with whom, and for how long.
        </p>

        {/* Feature pills */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 320, marginBottom: 48 }}>
          {[
            { icon: '🔒', text: 'Zero-trust encryption' },
            { icon: '✅', text: 'Consent-driven access' },
            { icon: '⚡', text: 'Instant revocation' },
          ].map((f) => (
            <div
              key={f.text}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: 'rgba(255,255,255,0.08)',
                borderRadius: 12,
                padding: '12px 16px',
              }}
            >
              <span style={{ fontSize: 20 }}>{f.icon}</span>
              <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: 500 }}>{f.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div
        style={{
          padding: '24px 24px 40px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <button
          onClick={() => router.push('/auth/register')}
          style={{
            width: '100%',
            height: 52,
            borderRadius: 14,
            background: 'white',
            border: 'none',
            color: 'var(--color-navy)',
            fontSize: 16,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Create Account
        </button>
        <button
          onClick={() => router.push('/auth/sign-in')}
          style={{
            width: '100%',
            height: 52,
            borderRadius: 14,
            background: 'rgba(255,255,255,0.12)',
            border: '1.5px solid rgba(255,255,255,0.25)',
            color: 'white',
            fontSize: 16,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Sign In
        </button>

        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 8 }}>
          GDPR · DPDPA · PCI-DSS v4 compliant
        </p>
      </div>
    </div>
  );
}
