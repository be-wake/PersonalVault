'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuthState } from '@/lib/auth';
import { useRealtime, type RealtimeMessage } from '@/lib/ws';
import { api, type AuditEvent } from '@/lib/api';
import { Card } from '@/components/ui/card';
import AuditEntry from '@/components/AuditEntry';
import Spinner from '@/components/Spinner';

const RESOURCE_FILTERS = [
  { label: 'All',      value: '' },
  { label: 'Identity', value: 'identity' },
  { label: 'Address',  value: 'address' },
  { label: 'Payment',  value: 'payment' },
  { label: 'Contacts', value: 'contacts' },
  { label: 'Consent',  value: 'consent' },
];
export const AUDIT_PAGE_LIMIT = 50;

export default function HistoryPage() {
  const { user } = useAuthState();
  const [events,   setEvents]   = useState<AuditEvent[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [resource, setResource] = useState('');

  const fetchEvents = useCallback(() => {
    if (!user) return Promise.resolve<AuditEvent[]>([]);
    return api.audit.list(user.id, { resource: resource || undefined, limit: AUDIT_PAGE_LIMIT });
  }, [user, resource]);

  const reload = useCallback(() => {
    setLoading(true);
    void fetchEvents()
      .then((nextEvents) => {
        setEvents(nextEvents);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [fetchEvents]);

  useEffect(() => {
    if (!user) return;

    let active = true;
    void fetchEvents()
      .then((nextEvents) => {
        if (active) setEvents(nextEvents);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [fetchEvents, user]);

  // Auto-refresh after vault saves or consent changes (both create audit rows).
  const onRealtime = useCallback((msg: RealtimeMessage) => {
    if (
      msg.type === 'VAULT_UPDATED' ||
      msg.type?.startsWith('CONSENT_') ||
      msg.event?.startsWith('consent.')
    ) {
      reload();
    }
  }, [reload]);
  useRealtime(onRealtime);

  return (
    <div className="page-container">
      {/* Header */}
      <div className="bg-[var(--color-navy)] -mx-4 px-6 pt-[52px] pb-6 mb-0">
        <h1 className="text-white text-[22px] font-extrabold mb-1">Access History</h1>
        <p className="text-white/60 text-[13px]">Full audit log of your data</p>
      </div>

      {/* Resource filter */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto bg-white border-b border-[var(--color-border)]">
        {RESOURCE_FILTERS.map((f) => {
          const active = resource === f.value;
          return (
            <button
              key={f.value}
              onClick={() => {
                if (resource === f.value) return;
                setLoading(true);
                setResource(f.value);
              }}
              className="px-3.5 py-1.5 rounded-full border-0 text-[13px] cursor-pointer whitespace-nowrap transition-colors"
              style={{
                background: active ? 'var(--color-navy)' : 'var(--color-bg)',
                color:      active ? 'white'            : 'var(--color-text-2)',
                fontWeight: active ? 700 : 500,
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Events */}
      <div className="px-4 py-4">
        {loading ? <Spinner /> : events.length === 0 ? (
          <div className="empty-state">
            <p className="text-[32px] mb-2">📋</p>
            <p className="font-semibold text-[var(--color-text-2)] mb-1">No events found</p>
            <p className="text-[13px] text-[var(--color-text-3)]">
              {resource ? `No ${resource} events recorded` : 'No audit events yet'}
            </p>
          </div>
        ) : (
          <Card className="p-0 overflow-hidden">
            {events.map((event, i) => (
              <AuditEntry key={event.id} event={event} divider={i > 0} />
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
