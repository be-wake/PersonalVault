import { Badge } from './ui/badge';

type MaskType = 'NONE' | 'PARTIAL' | 'FULL' | 'HASH';

const VARIANT: Record<MaskType, 'full' | 'partial' | 'hidden' | 'hashed'> = {
  NONE:    'full',
  PARTIAL: 'partial',
  FULL:    'hidden',
  HASH:    'hashed',
};

const LABEL: Record<MaskType, string> = {
  NONE:    'Full',
  PARTIAL: 'Partial',
  FULL:    'Hidden',
  HASH:    'Hashed',
};

export default function MaskBadge({ mask }: { mask: MaskType }) {
  return <Badge variant={VARIANT[mask]}>{LABEL[mask]}</Badge>;
}
