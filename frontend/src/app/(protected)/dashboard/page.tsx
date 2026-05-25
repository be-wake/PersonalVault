'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from '@/lib/auth';
import { useRealtime, type RealtimeMessage } from '@/lib/ws';
import { api, type ConsentGrant } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import ConsentCard from '@/components/ConsentCard';
import Spinner from '@/components/Spinner';

const VAULT_SECTIONS = [
  { key: 'identity', label: 'Identity', description: 'Name, email, DOB, gov ID', icon: '👤', href: '/vault/identity', color: 'var(--color-blue)' },
  { key: 'address',  label: 'Address',  description: 'Current & history',         icon: '🏠', href: '/vault/address',  color: 'var(--color-teal)' },
  { key: 'cards',    label: 'Payment',  description: 'Saved card references',     icon: '💳', href: '/vault/cards',    color: 'var(--color-amber)' },
  { key: 'contacts', label: 'Contacts', description: 'Phone & social',            icon: '📞', href: '/vault/contacts', color: '#7C3AED' },
];

export default function DashboardPage() {
  const { user } = useAuthState();
  const router   = useRouter();
  const [grants,  setGrants]  = useState<ConsentGrant[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    if (!user) return;
    api.consents.list(user.id)
      .then((data) => setGrants(data.filter((g) => g.status === 'ACTIVE').slice(0, 3)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => { reload(); }, [reload]);

  const onRealtime = useCallback((msg: RealtimeMessage) => {
    if (msg?.type?.startsWith('CONSENT_') || msg?.event?.startsWith('consent.')) reload();
  }, [reload]);
  useRealtime(onRealtime);

  const firstName   = user?.name?.split(' ')[0] ?? 'there';
  const activeCount = grants.length;

  return (
    <div className="page-container">
      {/* Hero header */}
      <div className="bg-[var(--color-navy)] -mx-4 px-6 pt-[52px] pb-7 mb-6">
        <p className="text-white/65 text-[13px] mb-0.5">Good to see you,</p>
        <h1 className="text-white text-[26px] font-extrabold mb-4">{firstName} 👋</h1>

        {/* Active-consent counter */}
        <Card className="bg-white/10 border-0 flex items-center justify-between px-5 py-4">
          <div>
            <p className="text-white/65 text-[12px] font-semibold uppercase tracking-widest mb-1">
              Active consents
            </p>
            <p className="text-white text-[28px] font-extrabold">{activeCount}</p>
          </div>
          <div
            className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-[24px]"
            style={{
              background: activeCount === 0
                ? 'var(--color-teal)'
                : activeCount <= 3 ? 'var(--color-amber)'
                : 'var(--color-red-lt)',
            }}
          >
            {activeCount === 0 ? '✅' : activeCount <= 3 ? '🟡' : '⚠️'}
          </div>
        </Card>
      </div>

      {/* Vault sections */}
      <section className="px-4 mb-7">
        <h2 className="text-h3 mb-3.5 px-2">Your Vault</h2>
        <div className="grid grid-cols-2 gap-3">
          {VAULT_SECTIONS.map((section) => (
            <button
              key={section.key}
              onClick={() => router.push(section.href)}
              className="bg-white border border-[var(--color-border)] rounded-2xl p-4 text-left cursor-pointer flex flex-col gap-2 hover:shadow-md transition-shadow"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-[20px]"
                style={{ background: section.color + '18' }}
              >
                {section.icon}
              </div>
              <div>
                <p className="text-[14px] font-bold text-[var(--color-text-1)] mb-0.5">{section.label}</p>
                <p className="text-[11px] text-[var(--color-text-3)] leading-[1.4]">{section.description}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Active consents */}
      <section className="px-4">
        <div className="flex items-center justify-between mb-3.5 px-2">
          <h2 className="text-h3">Active Consents</h2>
          <Button variant="ghost" size="sm" onClick={() => router.push('/consents')}>
            See all
          </Button>
        </div>

        {loading ? <Spinner /> : grants.length === 0 ? (
          <div className="empty-state">
            <p className="text-[32px] mb-2">🔐</p>
            <p className="font-semibold text-[var(--color-text-2)] mb-1">No active consents</p>
            <p className="text-[13px] text-[var(--color-text-3)]">Grant access to apps you trust</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {grants.map((grant) => <ConsentCard key={grant.id} grant={grant} />)}
          </div>
        )}
      </section>
    </div>
  );
}
