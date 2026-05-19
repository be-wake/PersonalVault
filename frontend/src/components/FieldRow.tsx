import MaskBadge from './MaskBadge';

type MaskType = 'NONE' | 'PARTIAL' | 'FULL' | 'HASH';

interface FieldRowProps {
  label: string;
  value: string | undefined | null;
  mask?: MaskType;
}

function maskValue(value: string | undefined | null, mask: MaskType): string {
  if (!value) return '—';
  if (mask === 'FULL') return '••••••••';
  if (mask === 'PARTIAL') {
    if (value.length <= 4) return '••••';
    return '••••' + value.slice(-4);
  }
  if (mask === 'HASH') return value.slice(0, 8) + '…';
  return value;
}

export default function FieldRow({ label, value, mask = 'NONE' }: FieldRowProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 'var(--space-md) 0',
      borderBottom: '1px solid var(--color-border)',
      gap: 'var(--space-md)',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {label}
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-1)', marginTop: 2 }}>
          {maskValue(value, mask)}
        </div>
      </div>
      <MaskBadge mask={mask} />
    </div>
  );
}
