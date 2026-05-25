'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from '@/lib/auth';
import { useRealtime, type RealtimeMessage } from '@/lib/ws';
import { api, ConsentGrant } from '@/lib/api';
import ConsentCard from '@/components/ConsentCard';

type Filter = 'ALL' | 'ACTIVE' | 'REVOKED' | 'EXPIRED';

export default function ConsentsPage() {
  const { user } = useAuthState();
  const router = useRouter();
  const [grants, setGrants] = useState<ConsentGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('ALL');

  const reload = useCallback(() => {
    if (!user) return;
    api.consents.list(user.id).then(setGrants).catch(() => {}).finally(() => setLoading(false));
  }, [user]);

  useEffect(() => { reload(); }, [reload]);

  // Refresh whenever a consent event fires.
  const onRealtime = useCallback((msg: RealtimeMessage) => {
    if (msg?.type === 'CONNECTED') return;
    if (msg?.type?.startsWith('CONSENT_') || msg?.event?.startsWith('consent.')) {
      reload();
    }
  }, [reload]);
  useRealtime(onRealtime);

  const filtered = filter === 'ALL' ? grants : grants.filter((g) => g.status === filter);

  const FILTERS: Filter[] = ['ALL', 'ACTIVE', 'REVOKED', 'EXPIRED'];

  return (
    <div className="page-container">
      {/* Header */}
      <div style={{ background: 'var(--color-navy)', padding: '52px 24px 24px', marginBottom: 0 }}>
        <h1 style={{ color: 'white', fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Consents</h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Manage who can access your data</p>
      </div>

      {/* Filter tabs */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '16px 16px 0',
          overflowX: 'auto',
          background: 'white',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '8px 16px',
              borderRadius: 20,
              border: 'none',
              background: filter === f ? 'var(--color-navy)' : 'var(--color-bg)',
              color: filter === f ? 'white' : 'var(--color-text-2)',
              fontWeight: filter === f ? 700 : 500,
              fontSize: 13,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              marginBottom: 12,
            }}
          >
            {f}
            {f !== 'ALL' && (
              <span
                style={{
                  marginLeft: 6,
                  background: filter === f ? 'rgba(255,255,255,0.25)' : 'var(--color-border)',
                  borderRadius: 10,
                  padding: '1px 6px',
                  fontSize: 11,
                }}
              >
                {grants.filter((g) => g.status === f).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Grant new button */}
      <div style={{ padding: '16px 16px 8px' }}>
        <button
          onClick={() => router.push('/consents/grant')}
          style={{
            width: '100%',
            height: 48,
            borderRadius: 12,
            border: '2px dashed var(--color-blue)',
            background: 'rgba(25, 102, 153, 0.06)',
            color: 'var(--color-blue)',
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          + Grant new access
        </button>
      </div>

      {/* List */}
      <div style={{ padding: '8px 16px' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <p style={{ fontSize: 32, marginBottom: 8 }}>📋</p>
            <p style={{ fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 4 }}>No {filter !== 'ALL' ? filter.toLowerCase() : ''} consents</p>
            <p style={{ fontSize: 13, color: 'var(--color-text-3)' }}>
              {filter === 'ALL' ? 'Grant access to apps you trust' : `No ${filter.toLowerCase()} consents found`}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map((grant) => (
              <ConsentCard key={grant.id} grant={grant} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
