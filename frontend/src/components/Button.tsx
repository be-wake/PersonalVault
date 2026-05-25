import type { ButtonHTMLAttributes, CSSProperties } from 'react';

type Variant = 'primary' | 'secondary' | 'destructive' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  fullWidth?: boolean;
}

const STYLES: Record<Variant, CSSProperties> = {
  primary: {
    background: 'var(--color-navy)',
    color: '#fff',
    border: 'none',
  },
  secondary: {
    background: 'var(--color-bg)',
    color: 'var(--color-text-1)',
    border: '1.5px solid var(--color-border)',
  },
  destructive: {
    background: 'var(--color-red-lt)',
    color: 'var(--color-red)',
    border: '1.5px solid var(--color-red)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--color-blue)',
    border: 'none',
  },
};

export default function Button({
  variant = 'primary',
  loading = false,
  fullWidth = false,
  children,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        height: '48px',
        padding: '0 24px',
        borderRadius: 'var(--radius-sm)',
        fontSize: '15px',
        fontWeight: 600,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled && !loading ? 0.4 : 1,
        width: fullWidth ? '100%' : undefined,
        transition: 'opacity 0.15s ease',
        ...STYLES[variant],
        ...style,
      }}
      {...rest}
    >
      {loading ? <span className="spinner" /> : children}
    </button>
  );
}
