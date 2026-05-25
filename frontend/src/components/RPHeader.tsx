import { Card } from './ui/card';
import StatusBadge from './StatusBadge';
import type { ConsentGrant } from '@/lib/api';

interface RPHeaderProps {
  rp:     ConsentGrant['rp'];
  status: ConsentGrant['status'];
}

export default function RPHeader({ rp, status }: RPHeaderProps) {
  return (
    <Card className="bg-[var(--color-navy)] border-0 flex items-center gap-4 p-6">
      <div className="w-[52px] h-[52px] rounded-full bg-white/15 flex items-center justify-center text-[22px] font-bold text-white shrink-0">
        {rp.name[0]}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[17px] font-semibold text-white leading-snug">{rp.name}</p>
        <p className="text-[13px] text-white/65 mt-0.5">{rp.domain}</p>
      </div>
      <StatusBadge status={status} />
    </Card>
  );
}
