import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-[var(--radius-pill)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.5px] whitespace-nowrap',
  {
    variants: {
      variant: {
        // consent statuses
        active:  'bg-[var(--color-teal-lt)] text-[var(--color-teal)]',
        revoked: 'bg-[var(--color-red-lt)] text-[var(--color-red)]',
        expired: 'bg-[var(--color-bg)] text-[var(--color-text-3)] border border-[var(--color-border)]',
        // mask types
        full:    'bg-[var(--color-teal-lt)] text-[var(--color-teal)]',
        partial: 'bg-[var(--color-amber-lt)] text-[var(--color-amber)]',
        hidden:  'bg-[var(--color-bg)] text-[var(--color-text-3)] border border-[var(--color-border)]',
        hashed:  'bg-[var(--color-amber-lt)] text-[var(--color-amber)]',
        // generic
        navy:    'bg-[var(--color-navy)] text-white',
      },
    },
    defaultVariants: { variant: 'active' },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
