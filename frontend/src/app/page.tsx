'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from '@/lib/auth';

const FEATURES = [
  { icon: '🔒', text: 'Zero-trust encryption' },
  { icon: '✅', text: 'Consent-driven access' },
  { icon: '⚡', text: 'Instant revocation' },
];

export default function LandingPage() {
  const router = useRouter();
  const { user, loading } = useAuthState();

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [loading, user, router]);

  return (
    <div className="min-h-dvh flex flex-col bg-[var(--color-navy)]">
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-12 pb-8 text-center">
        {/* Shield logo */}
        <div className="w-[88px] h-[88px] rounded-[24px] bg-white/[0.12] flex items-center justify-center mb-7">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <path
              d="M24 4L8 10V24C8 33.6 15.2 42.4 24 44C32.8 42.4 40 33.6 40 24V10L24 4Z"
              fill="white" opacity="0.95"
            />
            <path
              d="M19 24L22.5 27.5L30 20"
              stroke="var(--color-navy)" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
        </div>

        <h1 className="text-[32px] font-extrabold text-white tracking-tight mb-3">
          Personal Data Vault
        </h1>
        <p className="text-[16px] text-white/72 max-w-[300px] leading-relaxed mb-12">
          Take full control of your personal data. Choose exactly what you share, with whom, and for how long.
        </p>

        {/* Feature pills */}
        <div className="flex flex-col gap-3 w-full max-w-[320px] mb-12">
          {FEATURES.map((f) => (
            <div
              key={f.text}
              className="flex items-center gap-3 bg-white/[0.08] rounded-xl px-4 py-3"
            >
              <span className="text-[20px]">{f.icon}</span>
              <span className="text-white/90 text-[14px] font-medium">{f.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="px-6 pb-10 flex flex-col gap-3">
        <button
          onClick={() => router.push('/auth/register')}
          className="w-full h-[52px] rounded-[14px] bg-white border-0 text-[var(--color-navy)] text-[16px] font-bold cursor-pointer hover:opacity-95 transition-opacity"
        >
          Create Account
        </button>
        <button
          onClick={() => router.push('/auth/sign-in')}
          className="w-full h-[52px] rounded-[14px] bg-white/[0.12] border border-white/25 text-white text-[16px] font-semibold cursor-pointer hover:opacity-90 transition-opacity"
        >
          Sign In
        </button>
        <p className="text-center text-white/45 text-[12px] mt-2">
          GDPR · DPDPA · PCI-DSS v4 compliant
        </p>
      </div>
    </div>
  );
}
