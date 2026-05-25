'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from '@/lib/auth';
import { useRealtime, type RealtimeMessage } from '@/lib/ws';
import { api, type ConsentGrant } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ConsentCard from '@/components/ConsentCard';
import Spinner from '@/components/Spinner';

type Filter = 'ALL' | 'ACTIVE' | 'REVOKED' | 'EXPIRED';
const FILTERS: Filter[] = ['ALL', 'ACTIVE', 'REVOKED', 'EXPIRED'];

const FILTER_VARIANT: Record<string, 'active' | 'revoked' | 'expired'> = {
  ACTIVE: 'active', REVOKED: 'revoked', EXPIRED: 'expired',
};

export default function ConsentsPage() {
  const { user }  = useAuthState();
  const router    = useRouter();
  const [grants,  setGrants]  = useState<ConsentGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<Filter>('ALL');

  const reload = useCallback(() => {
    if (!user) return;
    api.consents.list(user.id).then(setGrants).catch(() => {}).finally(() => setLoading(false));
  }, [user]);

  useEffect(() => { reload(); }, [reload]);

  // Refresh whenever a consent event fires.
  const onRealtime = useCallback((msg: RealtimeMessage) => {
    if (msg?.type === 'CONNECTED') return;
    if (msg?.type?.startsWith('CONSENT_') || msg?.event?.startsWith('consent.')) reload();
  }, [reload]);
  useRealtime(onRealtime);

  const filtered = filter === 'ALL' ? grants : grants.filter((g) => g.status === filter);

  return (
    <div className="page-container">
      {/* Header */}
      <div className="bg-[var(--color-navy)] -mx-4 px-6 pt-[52px] pb-6 mb-0">
        <h1 className="text-white text-[22px] font-extrabold mb-1">Consents</h1>
        <p className="text-white/60 text-[13px]">Manage who can access your data</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 px-4 pt-4 pb-0 overflow-x-auto bg-white border-b border-[var(--color-border)]">
        {FILTERS.map((f) => {
          const active = filter === f;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full border-0 text-[13px] cursor-pointer whitespace-nowrap mb-3 transition-colors"
              style={{
                background: active ? 'var(--color-navy)' : 'var(--color-bg)',
                color:      active ? 'white'            : 'var(--color-text-2)',
                fontWeight: active ? 700 : 500,
              }}
            >
              {f}
              {f !== 'ALL' && (
                <Badge
                  variant={active ? 'navy' : (FILTER_VARIANT[f] ?? 'active')}
                  className="text-[11px]"
                >
                  {grants.filter((g) => g.status === f).length}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Grant new */}
      <div className="px-4 pt-4 pb-2">
        <Button
          variant="ghost"
          fullWidth
          onClick={() => router.push('/consents/grant')}
          className="h-12 border-2 border-dashed border-[var(--color-blue)] bg-[rgba(25,102,153,0.06)] text-[var(--color-blue)] font-bold"
        >
          + Grant new access
        </Button>
      </div>

      {/* List */}
      <div className="px-4 py-2">
        {loading ? <Spinner /> : filtered.length === 0 ? (
          <div className="empty-state">
            <p className="text-[32px] mb-2">📋</p>
            <p className="font-semibold text-[var(--color-text-2)] mb-1">
              No {filter !== 'ALL' ? filter.toLowerCase() : ''} consents
            </p>
            <p className="text-[13px] text-[var(--color-text-3)]">
              {filter === 'ALL' ? 'Grant access to apps you trust' : `No ${filter.toLowerCase()} consents found`}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {filtered.map((grant) => <ConsentCard key={grant.id} grant={grant} />)}
          </div>
        )}
      </div>
    </div>
  );
}
