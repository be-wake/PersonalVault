import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 font-semibold transition-opacity',
    'disabled:pointer-events-none disabled:opacity-40 cursor-pointer',
    'rounded-[var(--radius-sm)]',
  ],
  {
    variants: {
      variant: {
        primary:     'bg-[var(--color-navy)] text-white border-0 hover:opacity-90',
        secondary:   'bg-[var(--color-bg)] text-[var(--color-text-1)] border border-[var(--color-border)] hover:opacity-80',
        destructive: 'bg-[var(--color-red-lt)] text-[var(--color-red)] border border-[var(--color-red)] hover:opacity-80',
        ghost:       'bg-transparent text-[var(--color-blue)] border-0 hover:opacity-80',
      },
      size: {
        default: 'h-12 px-6 text-[15px]',
        sm:      'h-9 px-4 text-[13px]',
        icon:    'h-10 w-10 p-0',
      },
      fullWidth: {
        true:  'w-full',
        false: 'w-auto',
      },
    },
    defaultVariants: {
      variant:   'primary',
      size:      'default',
      fullWidth: false,
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?:  boolean;
  loading?:  boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, fullWidth, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        disabled={disabled || loading}
        className={cn(buttonVariants({ variant, size, fullWidth }), loading && 'cursor-wait', className)}
        {...props}
      >
        {loading ? <span className="spinner" /> : children}
      </Comp>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
