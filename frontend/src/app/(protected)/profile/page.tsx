'use client';

import { useRouter } from 'next/navigation';
import { useAuthState, useAuth } from '@/lib/auth';
import Button from '@/components/Button';

const VAULT_LINKS = [
  { label: 'Identity', icon: '👤', href: '/vault/identity' },
  { label: 'Address', icon: '🏠', href: '/vault/address' },
  { label: 'Payment Cards', icon: '💳', href: '/vault/cards' },
  { label: 'Contacts', icon: '📞', href: '/vault/contacts' },
];

export default function ProfilePage() {
  const { user } = useAuthState();
  const { logout } = useAuth();
  const router = useRouter();

  function handleLogout() {
    logout();
    router.replace('/');
  }

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <div className="page-container">
      {/* Header */}
      <div
        style={{
          background: 'var(--color-navy)',
          padding: '52px 24px 32px',
          textAlign: 'center',
          marginBottom: 24,
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            background: 'rgba(255,255,255,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 14px',
            fontSize: 26,
            fontWeight: 800,
            color: 'white',
          }}
        >
          {initials}
        </div>
        <h1 style={{ color: 'white', fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{user?.name}</h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>{user?.email}</p>
      </div>

      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Vault quick links */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--color-border)' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Your Vault
            </span>
          </div>
          {VAULT_LINKS.map((link, i) => (
            <button
              key={link.href}
              onClick={() => router.push(link.href)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px 18px',
                background: 'none',
                border: 'none',
                borderBottom: i < VAULT_LINKS.length - 1 ? '1px solid var(--color-border)' : 'none',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 20 }}>{link.icon}</span>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--color-text-1)' }}>{link.label}</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 4L10 8L6 12" stroke="var(--color-text-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ))}
        </div>

        {/* Compliance section */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--color-border)' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Compliance
            </span>
          </div>
          {[
            { icon: '🇪🇺', label: 'GDPR (EU 2016/679)', color: '#003399' },
            { icon: '🇮🇳', label: 'DPDPA 2023 (India)', color: '#FF9933' },
            { icon: '💳', label: 'PCI-DSS v4.0', color: '#1A5276' },
          ].map((c, i) => (
            <div
              key={c.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 18px',
                borderBottom: i < 2 ? '1px solid var(--color-border)' : 'none',
              }}
            >
              <span style={{ fontSize: 18 }}>{c.icon}</span>
              <span style={{ fontSize: 13, color: 'var(--color-text-2)', fontWeight: 500 }}>{c.label}</span>
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--color-teal)',
                  background: 'var(--color-teal-lt)',
                  padding: '2px 8px',
                  borderRadius: 10,
                }}
              >
                ✓
              </span>
            </div>
          ))}
        </div>

        {/* Account info */}
        <div className="card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            Account
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
            <span style={{ color: 'var(--color-text-3)' }}>Member since</span>
            <span style={{ fontWeight: 600, color: 'var(--color-text-1)' }}>
              {user?.created_at ? new Date(user.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '—'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: 'var(--color-text-3)' }}>User ID</span>
            <span style={{ fontWeight: 600, color: 'var(--color-text-1)', fontFamily: 'monospace', fontSize: 11 }}>
              {user?.id?.slice(0, 8)}…
            </span>
          </div>
        </div>

        <Button variant="destructive" fullWidth onClick={handleLogout}>
          Sign Out
        </Button>

        <p style={{ textAlign: 'center', color: 'var(--color-text-3)', fontSize: 11, marginBottom: 8 }}>
          Personal Data Vault · v1.0.0
        </p>
      </div>
    </div>
  );
}
