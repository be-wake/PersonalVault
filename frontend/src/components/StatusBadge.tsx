import { Badge } from './ui/badge';
import type { ConsentGrant } from '@/lib/api';

type Status = ConsentGrant['status'];

const VARIANT: Record<Status, 'active' | 'revoked' | 'expired'> = {
  ACTIVE:  'active',
  REVOKED: 'revoked',
  EXPIRED: 'expired',
};

const BORDER_COLOR: Record<Status, string> = {
  ACTIVE:  'var(--color-teal)',
  REVOKED: 'var(--color-red)',
  EXPIRED: 'var(--color-border)',
};

export default function StatusBadge({ status }: { status: Status }) {
  const label = status.charAt(0) + status.slice(1).toLowerCase();
  return <Badge variant={VARIANT[status]}>{label}</Badge>;
}

export function statusBorderColor(status: Status): string {
  return BORDER_COLOR[status] ?? 'var(--color-border)';
}
