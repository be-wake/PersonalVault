'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from '@/lib/auth';
import { useRealtime, type RealtimeMessage } from '@/lib/ws';
import { api, ConsentGrant } from '@/lib/api';
import ConsentCard from '@/components/ConsentCard';

const VAULT_SECTIONS = [
  {
    key: 'identity',
    label: 'Identity',
    description: 'Name, email, DOB, gov ID',
    icon: '👤',
    href: '/vault/identity',
    color: 'var(--color-blue)',
  },
  {
    key: 'address',
    label: 'Address',
    description: 'Current & history',
    icon: '🏠',
    href: '/vault/address',
    color: 'var(--color-teal)',
  },
  {
    key: 'cards',
    label: 'Payment',
    description: 'Saved card references',
    icon: '💳',
    href: '/vault/cards',
    color: 'var(--color-amber)',
  },
  {
    key: 'contacts',
    label: 'Contacts',
    description: 'Phone & social',
    icon: '📞',
    href: '/vault/contacts',
    color: '#7C3AED',
  },
];

export default function DashboardPage() {
  const { user } = useAuthState();
  const router = useRouter();
  const [grants, setGrants] = useState<ConsentGrant[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    if (!user) return;
    api.consents
      .list(user.id)
      .then((data) => setGrants(data.filter((g) => g.status === 'ACTIVE').slice(0, 3)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => { reload(); }, [reload]);

  // Live updates (F22/C6): keep the active-consent tiles fresh.
  const onRealtime = useCallback((msg: RealtimeMessage) => {
    if (msg?.type?.startsWith('CONSENT_') || msg?.event?.startsWith('consent.')) reload();
  }, [reload]);
  useRealtime(onRealtime);

  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const activeCount = grants.length;

  return (
    <div className="page-container">
      {/* Header */}
      <div
        style={{
          background: 'var(--color-navy)',
          margin: '-0px',
          padding: '52px 24px 28px',
          marginBottom: 24,
        }}
      >
        <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, marginBottom: 2 }}>Good to see you,</p>
        <h1 style={{ color: 'white', fontSize: 26, fontWeight: 800, marginBottom: 16 }}>{firstName} 👋</h1>

        {/* Security score card */}
        <div
          style={{
            background: 'rgba(255,255,255,0.1)',
            borderRadius: 16,
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
              Active consents
            </p>
            <p style={{ color: 'white', fontSize: 28, fontWeight: 800 }}>{activeCount}</p>
          </div>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              background: activeCount === 0 ? 'var(--color-teal)' : activeCount <= 3 ? 'var(--color-amber)' : 'var(--color-red-lt)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
            }}
          >
            {activeCount === 0 ? '✅' : activeCount <= 3 ? '🟡' : '⚠️'}
          </div>
        </div>
      </div>

      {/* Vault sections */}
      <section style={{ padding: '0 16px', marginBottom: 28 }}>
        <h2 className="text-h3" style={{ marginBottom: 14, padding: '0 8px' }}>Your Vault</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
          }}
        >
          {VAULT_SECTIONS.map((section) => (
            <button
              key={section.key}
              onClick={() => router.push(section.href)}
              style={{
                background: 'white',
                border: '1.5px solid var(--color-border)',
                borderRadius: 16,
                padding: '16px',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  background: section.color + '18',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                }}
              >
                {section.icon}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-1)', marginBottom: 2 }}>
                  {section.label}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-3)', lineHeight: 1.4 }}>{section.description}</div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Active consents */}
      <section style={{ padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, padding: '0 8px' }}>
          <h2 className="text-h3">Active Consents</h2>
          <button
            onClick={() => router.push('/consents')}
            style={{ background: 'none', border: 'none', color: 'var(--color-blue)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
          >
            See all
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
            <div className="spinner" />
          </div>
        ) : grants.length === 0 ? (
          <div className="empty-state">
            <p style={{ fontSize: 32, marginBottom: 8 }}>🔐</p>
            <p style={{ fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 4 }}>No active consents</p>
            <p style={{ fontSize: 13, color: 'var(--color-text-3)' }}>Grant access to apps you trust</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {grants.map((grant) => (
              <ConsentCard key={grant.id} grant={grant} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
