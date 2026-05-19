type MaskType = 'NONE' | 'PARTIAL' | 'FULL' | 'HASH';

const CONFIG: Record<MaskType, { bg: string; text: string; label: string }> = {
  NONE:    { bg: 'var(--color-teal-lt)',  text: 'var(--color-teal)',  label: 'Full' },
  PARTIAL: { bg: 'var(--color-amber-lt)', text: 'var(--color-amber)', label: 'Partial' },
  FULL:    { bg: 'var(--color-bg)',       text: 'var(--color-text-3)', label: 'Hidden' },
  HASH:    { bg: 'var(--color-amber-lt)', text: 'var(--color-amber)', label: 'Hashed' },
};

export default function MaskBadge({ mask }: { mask: MaskType }) {
  const c = CONFIG[mask] ?? CONFIG['NONE'];
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 6px',
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
