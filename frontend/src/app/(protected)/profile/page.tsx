'use client';

import { useRouter } from 'next/navigation';
import { useAuthState, useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

const VAULT_LINKS = [
  { label: 'Identity',      icon: '👤', href: '/vault/identity' },
  { label: 'Address',       icon: '🏠', href: '/vault/address' },
  { label: 'Payment Cards', icon: '💳', href: '/vault/cards' },
  { label: 'Contacts',      icon: '📞', href: '/vault/contacts' },
];

const COMPLIANCE = [
  { icon: '🇪🇺', label: 'GDPR (EU 2016/679)' },
  { icon: '🇮🇳', label: 'DPDPA 2023 (India)' },
  { icon: '💳', label: 'PCI-DSS v4.0' },
];

export default function ProfilePage() {
  const { user }   = useAuthState();
  const { logout } = useAuth();
  const router     = useRouter();

  function handleLogout() { logout(); router.replace('/'); }

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <div className="page-container">
      {/* Hero */}
      <div className="bg-[var(--color-navy)] -mx-4 px-6 pt-[52px] pb-8 text-center mb-6">
        <div className="w-[72px] h-[72px] rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3.5 text-[26px] font-extrabold text-white">
          {initials}
        </div>
        <h1 className="text-white text-[20px] font-bold mb-1">{user?.name}</h1>
        <p className="text-white/60 text-[13px]">{user?.email}</p>
      </div>

      <div className="px-4 flex flex-col gap-5">
        {/* Vault quick links */}
        <Card className="p-0 overflow-hidden">
          <div className="px-[18px] py-3.5 border-b border-[var(--color-border)]">
            <span className="section-header">Your Vault</span>
          </div>
          {VAULT_LINKS.map((link, i) => (
            <button
              key={link.href}
              onClick={() => router.push(link.href)}
              className="w-full flex items-center gap-3.5 px-[18px] py-3.5 bg-transparent border-0 text-left cursor-pointer hover:bg-[var(--color-bg)] transition-colors"
              style={{ borderBottom: i < VAULT_LINKS.length - 1 ? '1px solid var(--color-border)' : 'none' }}
            >
              <span className="text-[20px]">{link.icon}</span>
              <span className="flex-1 text-[14px] font-semibold text-[var(--color-text-1)]">{link.label}</span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 4L10 8L6 12" stroke="var(--color-text-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ))}
        </Card>

        {/* Compliance */}
        <Card className="p-0 overflow-hidden">
          <div className="px-[18px] py-3.5 border-b border-[var(--color-border)]">
            <span className="section-header">Compliance</span>
          </div>
          {COMPLIANCE.map((c, i) => (
            <div
              key={c.label}
              className="flex items-center gap-3 px-[18px] py-3"
              style={{ borderBottom: i < COMPLIANCE.length - 1 ? '1px solid var(--color-border)' : 'none' }}
            >
              <span className="text-[18px]">{c.icon}</span>
              <span className="text-[13px] text-[var(--color-text-2)] font-medium flex-1">{c.label}</span>
              <Badge variant="active">✓</Badge>
            </div>
          ))}
        </Card>

        {/* Account info */}
        <Card>
          <CardContent>
            <p className="section-header mb-3">Account</p>
            <div className="flex justify-between text-[13px] mb-2">
              <span className="text-[var(--color-text-3)]">Member since</span>
              <span className="font-semibold text-[var(--color-text-1)]">
                {user?.created_at
                  ? new Date(user.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
                  : '—'}
              </span>
            </div>
            <Separator className="my-2" />
            <div className="flex justify-between text-[13px]">
              <span className="text-[var(--color-text-3)]">User ID</span>
              <span className="font-semibold text-[var(--color-text-1)] font-mono text-[11px]">
                {user?.id?.slice(0, 8)}…
              </span>
            </div>
          </CardContent>
        </Card>

        <Button variant="destructive" fullWidth onClick={handleLogout}>Sign Out</Button>

        <p className="text-center text-[var(--color-text-3)] text-[11px] mb-2">
          Personal Data Vault · v1.0.0
        </p>
      </div>
    </div>
  );
}
