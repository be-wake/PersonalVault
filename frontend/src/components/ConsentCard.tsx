'use client';

import { useRouter } from 'next/navigation';
import { Card } from './ui/card';
import StatusBadge, { statusBorderColor } from './StatusBadge';
import type { ConsentGrant } from '@/lib/api';
import { SCOPE_LABELS } from '@/lib/api';

function timeAgo(dateStr: string): string {
  const diff  = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function ConsentCard({ grant }: { grant: ConsentGrant }) {
  const router      = useRouter();
  const scopeLabels = grant.scopes.map((s) => SCOPE_LABELS[s] || s).join(', ');
  const borderColor = statusBorderColor(grant.status);
  const timestamp   =
    grant.status === 'REVOKED' && grant.revoked_at
      ? `Revoked ${timeAgo(grant.revoked_at)}`
      : `Granted ${timeAgo(grant.granted_at)}`;

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={`${grant.rp.name}, ${grant.status}, sharing ${scopeLabels}. Tap to view details.`}
      onClick={() => router.push(`/consents/${grant.id}`)}
      onKeyDown={(e) => e.key === 'Enter' && router.push(`/consents/${grant.id}`)}
      className="flex items-center gap-4 py-3 px-4 cursor-pointer min-h-[44px] transition-shadow hover:shadow-md"
      style={{ borderLeft: `4px solid ${borderColor}` }}
    >
      {/* Avatar */}
      <div className="w-9 h-9 rounded-full bg-[var(--color-navy)] text-white flex items-center justify-center text-[14px] font-bold shrink-0">
        {grant.rp.name[0]}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <p className="text-[17px] font-semibold text-[var(--color-text-1)] leading-snug">
          {grant.rp.name}
        </p>
        <p className="text-[13px] text-[var(--color-text-2)] mt-0.5 truncate">{scopeLabels}</p>
        <p className="text-[11px] text-[var(--color-text-3)] mt-0.5">{timestamp}</p>
      </div>

      {/* Status + chevron */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        <StatusBadge status={grant.status} />
        <span className="text-[var(--color-text-3)] text-[16px] leading-none">›</span>
      </div>
    </Card>
  );
}
