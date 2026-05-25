import { Separator } from './ui/separator';
import MaskBadge from './MaskBadge';

type MaskType = 'NONE' | 'PARTIAL' | 'FULL' | 'HASH';

interface FieldRowProps {
  label: string;
  value?: string | null;
  mask?:  MaskType;
  /** When true, renders a <Separator> above this row */
  divider?: boolean;
}

function maskValue(value: string | undefined | null, mask: MaskType): string {
  if (!value) return '—';
  if (mask === 'FULL')    return '••••••••';
  if (mask === 'PARTIAL') return value.length <= 4 ? '••••' : '••••' + value.slice(-4);
  if (mask === 'HASH')    return value.slice(0, 8) + '…';
  return value;
}

export default function FieldRow({ label, value, mask = 'NONE', divider = false }: FieldRowProps) {
  return (
    <>
      {divider && <Separator className="my-3" />}
      <div className="flex items-center justify-between gap-3 py-1">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-[var(--color-text-3)] uppercase tracking-[0.5px]">
            {label}
          </p>
          <p className="text-[13px] text-[var(--color-text-1)] mt-0.5 truncate">
            {maskValue(value, mask)}
          </p>
        </div>
        <MaskBadge mask={mask} />
      </div>
    </>
  );
}
