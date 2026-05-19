import type { ConsentGrant } from '@/lib/api';

type Status = ConsentGrant['status'];

const CONFIG: Record<Status, { bg: string; text: string; border: string; label: string }> = {
  ACTIVE:  { bg: 'var(--color-teal-lt)',  text: 'var(--color-teal)',  border: 'var(--color-teal)',  label: 'Active' },
  REVOKED: { bg: 'var(--color-red-lt)',   text: 'var(--color-red)',   border: 'var(--color-red)',   label: 'Revoked' },
  EXPIRED: { bg: 'var(--color-bg)',       text: 'var(--color-text-3)', border: 'var(--color-border)', label: 'Expired' },
};

export default function StatusBadge({ status }: { status: Status }) {
  const c = CONFIG[status];
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 8px',
      borderRadius: 'var(--radius-pill)',
      backgroundColor: c.bg,
      color: c.text,
      fontSize: '10px',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      whiteSpace: 'nowrap',
    }}>
      {c.label}
    </span>
  );
}

export function statusBorderColor(status: Status): string {
  return CONFIG[status]?.border ?? 'var(--color-border)';
}
