'use client';
import type { ConsentGrant } from '@/lib/api';
import { SCOPE_LABELS } from '@/lib/api';
import StatusBadge, { statusBorderColor } from './StatusBadge';
import { useRouter } from 'next/navigation';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function ConsentCard({ grant }: { grant: ConsentGrant }) {
  const router = useRouter();
  const scopeLabels = grant.scopes.map(s => SCOPE_LABELS[s] || s).join(', ');
  const borderColor = statusBorderColor(grant.status);
  const timestamp = grant.status === 'REVOKED' && grant.revoked_at
    ? `Revoked ${timeAgo(grant.revoked_at)}`
    : `Granted ${timeAgo(grant.granted_at)}`;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${grant.rp.name}, ${grant.status}, sharing ${scopeLabels}. Tap to view details.`}
      onClick={() => router.push(`/consents/${grant.id}`)}
      onKeyDown={e => e.key === 'Enter' && router.push(`/consents/${grant.id}`)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-lg)',
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border)',
        borderLeft: `4px solid ${borderColor}`,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        padding: 'var(--space-md) var(--space-lg)',
        cursor: 'pointer',
        minHeight: '44px',
        transition: 'box-shadow 0.15s ease',
      }}
    >
      {/* RP avatar */}
      <div style={{
        width: 36, height: 36,
        borderRadius: '50%',
        background: 'var(--color-navy)',
        color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, fontWeight: 700, flexShrink: 0,
      }}>
        {grant.rp.name[0]}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--color-text-1)' }}>
          {grant.rp.name}
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {scopeLabels}
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 2 }}>
          {timestamp}
        </div>
      </div>

      {/* Right side */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        <StatusBadge status={grant.status} />
        <span style={{ color: 'var(--color-text-3)', fontSize: 16, lineHeight: 1 }}>›</span>
      </div>
    </div>
  );
}
