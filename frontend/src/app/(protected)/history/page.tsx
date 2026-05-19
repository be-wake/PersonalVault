'use client';

import { useEffect, useState } from 'react';
import { useAuthState } from '@/lib/auth';
import { api, AuditEvent } from '@/lib/api';
import AuditEntry from '@/components/AuditEntry';

const RESOURCE_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Identity', value: 'identity' },
  { label: 'Address', value: 'address' },
  { label: 'Payment', value: 'payment' },
  { label: 'Contacts', value: 'contacts' },
  { label: 'Consent', value: 'consent' },
];

export default function HistoryPage() {
  const { user } = useAuthState();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [resource, setResource] = useState('');

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    api.audit
      .list(user.id, { resource: resource || undefined, limit: 50 })
      .then(setEvents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, resource]);

  return (
    <div className="page-container">
      {/* Header */}
      <div style={{ background: 'var(--color-navy)', padding: '52px 24px 24px', marginBottom: 0 }}>
        <h1 style={{ color: 'white', fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Access History</h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Full audit log of your data</p>
      </div>

      {/* Resource filter */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '12px 16px',
          overflowX: 'auto',
          background: 'white',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        {RESOURCE_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setResource(f.value)}
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              border: 'none',
              background: resource === f.value ? 'var(--color-navy)' : 'var(--color-bg)',
              color: resource === f.value ? 'white' : 'var(--color-text-2)',
              fontWeight: resource === f.value ? 700 : 500,
              fontSize: 13,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Events */}
      <div style={{ padding: '16px 16px' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <div className="spinner" />
          </div>
        ) : events.length === 0 ? (
          <div className="empty-state">
            <p style={{ fontSize: 32, marginBottom: 8 }}>📋</p>
            <p style={{ fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 4 }}>No events found</p>
            <p style={{ fontSize: 13, color: 'var(--color-text-3)' }}>
              {resource ? `No ${resource} events recorded` : 'No audit events yet'}
            </p>
          </div>
        ) : (
          <div
            style={{
              background: 'white',
              borderRadius: 16,
              border: '1px solid var(--color-border)',
              overflow: 'hidden',
            }}
          >
            {events.map((event, i) => (
              <div key={event.id}>
                <AuditEntry event={event} />
                {i < events.length - 1 && (
                  <div style={{ height: 1, background: 'var(--color-border)', margin: '0 16px' }} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
