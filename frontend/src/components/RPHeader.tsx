import type { ConsentGrant } from '@/lib/api';
import StatusBadge from './StatusBadge';

interface RPHeaderProps {
  rp: ConsentGrant['rp'];
  status: ConsentGrant['status'];
}

export default function RPHeader({ rp, status }: RPHeaderProps) {
  return (
    <div style={{
      background: 'var(--color-navy)',
      borderRadius: 'var(--radius-md)',
      padding: 'var(--space-xl)',
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-lg)',
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: '50%',
        background: 'rgba(255,255,255,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, fontWeight: 700, color: '#fff', flexShrink: 0,
      }}>
        {rp.name[0]}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 17, fontWeight: 600, color: '#fff' }}>{rp.name}</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>{rp.domain}</div>
      </div>
      <StatusBadge status={status} />
    </div>
  );
}
