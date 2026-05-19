'use client';

import { usePathname, useRouter } from 'next/navigation';

const tabs = [
  {
    label: 'Home',
    href: '/dashboard',
    icon: (active: boolean) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path
          d="M3 9.5L12 3L21 9.5V20C21 20.5523 20.5523 21 20 21H15V15H9V21H4C3.44772 21 3 20.5523 3 20V9.5Z"
          fill={active ? 'var(--color-navy)' : 'none'}
          stroke={active ? 'var(--color-navy)' : 'var(--color-text-3)'}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    label: 'Consents',
    href: '/consents',
    icon: (active: boolean) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect
          x="3" y="3" width="18" height="18" rx="3"
          fill={active ? 'var(--color-navy)' : 'none'}
          stroke={active ? 'var(--color-navy)' : 'var(--color-text-3)'}
          strokeWidth="1.8"
        />
        <path
          d="M7 8H17M7 12H14M7 16H11"
          stroke={active ? 'white' : 'var(--color-text-3)'}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    label: 'History',
    href: '/history',
    icon: (active: boolean) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle
          cx="12" cy="12" r="9"
          stroke={active ? 'var(--color-navy)' : 'var(--color-text-3)'}
          strokeWidth="1.8"
          fill={active ? 'var(--color-navy)' : 'none'}
        />
        <path
          d="M12 7V12L15 15"
          stroke={active ? 'white' : 'var(--color-text-3)'}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    label: 'Profile',
    href: '/profile',
    icon: (active: boolean) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle
          cx="12" cy="8" r="4"
          fill={active ? 'var(--color-navy)' : 'none'}
          stroke={active ? 'var(--color-navy)' : 'var(--color-text-3)'}
          strokeWidth="1.8"
        />
        <path
          d="M4 20C4 17 7.58172 14 12 14C16.4183 14 20 17 20 20"
          stroke={active ? 'var(--color-navy)' : 'var(--color-text-3)'}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 64,
        background: 'white',
        borderTop: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'stretch',
        zIndex: 100,
        boxShadow: '0 -2px 12px rgba(0,0,0,0.06)',
      }}
      aria-label="Main navigation"
    >
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(tab.href + '/');
        return (
          <button
            key={tab.href}
            onClick={() => router.push(tab.href)}
            aria-label={tab.label}
            aria-current={active ? 'page' : undefined}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              padding: '6px 0 8px',
              color: active ? 'var(--color-navy)' : 'var(--color-text-3)',
              transition: 'color 0.15s',
            }}
          >
            {tab.icon(active)}
            <span
              style={{
                fontSize: 10,
                fontWeight: active ? 700 : 500,
                letterSpacing: '0.02em',
                lineHeight: 1,
              }}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
