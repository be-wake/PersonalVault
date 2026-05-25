'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuthState } from '@/lib/auth';
import { useRealtime, type RealtimeMessage } from '@/lib/ws';
import { api, type ConsentGrant, SCOPE_LABELS } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import RPHeader from '@/components/RPHeader';
import Spinner from '@/components/Spinner';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function ScopeIcon({ scope }: { scope: string }) {
  const icon = scope.startsWith('identity') ? '👤'
    : scope.startsWith('address')  ? '🏠'
    : scope.startsWith('payment')  ? '💳'
    : '📞';
  return (
    <div className="w-7 h-7 rounded-lg bg-[var(--color-teal-lt)] flex items-center justify-center text-[14px] shrink-0">
      {icon}
    </div>
  );
}

export default function ConsentDetailPage() {
  const { user }  = useAuthState();
  const router    = useRouter();
  const params    = useParams();
  const grantId   = params.grantId as string;

  const [grant,      setGrant]      = useState<ConsentGrant | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [showRevoke, setShowRevoke] = useState(false);
  const [pin,        setPin]        = useState('');
  const [revoking,   setRevoking]   = useState(false);
  const [pinError,   setPinError]   = useState('');
  const [toast,      setToast]      = useState('');

  useEffect(() => {
    if (!user) return;
    api.consents.get(user.id, grantId)
      .then(setGrant)
      .catch(() => router.replace('/consents'))
      .finally(() => setLoading(false));
  }, [user, grantId, router]);

  const onRealtime = useCallback((msg: RealtimeMessage) => {
    const affectedId = msg?.grant?.id ?? msg?.grantId;
    if (affectedId !== grantId) return;
    if (msg?.type === 'CONSENT_REVOKED' || msg?.event === 'consent.revoked') {
      setGrant((g) => g ? { ...g, status: 'REVOKED', revoked_at: (msg?.grant as any)?.revoked_at ?? new Date().toISOString() } : g);
    } else if (msg?.type === 'CONSENT_EXPIRED' || msg?.event === 'consent.expired') {
      setGrant((g) => g ? { ...g, status: 'EXPIRED' } : g);
    }
  }, [grantId]);
  useRealtime(onRealtime);

  async function handleRevoke() {
    if (pin !== '1234') { setPinError('Incorrect PIN. (Demo placeholder: enter 1234.)'); return; }
    setPinError('');
    setRevoking(true);
    try {
      await api.consents.revoke(grantId);
      setGrant((g) => g ? { ...g, status: 'REVOKED' } : g);
      setShowRevoke(false);
      setToast('Access revoked');
      setTimeout(() => setToast(''), 2500);
    } catch (err: any) {
      setToast(err.message || 'Revocation failed');
      setTimeout(() => setToast(''), 2500);
    } finally {
      setRevoking(false);
      setPin('');
    }
  }

  if (loading) return <Spinner fullPage />;
  if (!grant)  return null;

  return (
    <div className="page-container pb-[100px]">
      {/* Back */}
      <div className="pt-[52px] pb-0 px-4">
        <button
          onClick={() => router.back()}
          className="bg-transparent border-0 text-[var(--color-text-3)] text-[14px] cursor-pointer mb-4 hover:text-[var(--color-text-2)] transition-colors"
        >
          ← Consents
        </button>
      </div>

      <div className="px-4">
        <RPHeader rp={grant.rp} status={grant.status} />
      </div>

      <div className="px-4 pt-5 flex flex-col gap-4">
        {/* Dates card */}
        <Card>
          <div className="flex justify-between">
            <div>
              <p className="section-header mb-0.5">Granted</p>
              <p className="text-[14px] font-semibold text-[var(--color-text-1)]">{formatDate(grant.granted_at)}</p>
            </div>
            {grant.expires_at && (
              <div className="text-right">
                <p className="section-header mb-0.5">Expires</p>
                <p className="text-[14px] font-semibold text-[var(--color-text-1)]">{formatDate(grant.expires_at)}</p>
              </div>
            )}
          </div>
          {grant.revoked_at && (
            <div className="mt-3">
              <p className="section-header mb-0.5">Revoked</p>
              <p className="text-[14px] font-semibold text-[var(--color-red)]">{formatDate(grant.revoked_at)}</p>
            </div>
          )}
        </Card>

        {/* Scopes card */}
        <Card>
          <p className="section-header mb-3.5">Data access granted</p>
          <div className="flex flex-col gap-2.5">
            {grant.scopes.map((scope) => (
              <div key={scope} className="flex items-center gap-2.5">
                <ScopeIcon scope={scope} />
                <div>
                  <p className="text-[13px] font-semibold text-[var(--color-text-1)]">
                    {SCOPE_LABELS[scope] ?? scope}
                  </p>
                  <p className="text-[11px] text-[var(--color-text-3)]">{scope}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {grant.status === 'ACTIVE' && (
          <Button variant="destructive" fullWidth onClick={() => setShowRevoke(true)}>
            Revoke Access
          </Button>
        )}

        {grant.status !== 'ACTIVE' && (
          <p className="text-center py-4 text-[var(--color-text-3)] text-[13px]">
            This consent is {grant.status.toLowerCase()} and no longer active.
          </p>
        )}
      </div>

      {/* Revoke bottom sheet */}
      {showRevoke && (
        <div className="overlay" onClick={() => setShowRevoke(false)}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-5">
              <div>
                <h2 className="text-[18px] font-bold text-[var(--color-text-1)] mb-1">Confirm Revocation</h2>
                <p className="text-[13px] text-[var(--color-text-3)]">
                  {grant.rp?.name} will lose access within 5 seconds.
                </p>
              </div>
              <button
                onClick={() => setShowRevoke(false)}
                className="bg-transparent border-0 text-[20px] text-[var(--color-text-3)] cursor-pointer leading-none"
              >
                ×
              </button>
            </div>

            <div className="mb-4">
              <Label className="block mb-2 text-center">Enter your PIN to confirm</Label>
              <Input
                type="password" inputMode="numeric" maxLength={4} placeholder="••••"
                value={pin} onChange={(e) => { setPin(e.target.value); setPinError(''); }}
                style={{ textAlign: 'center', fontSize: 22, letterSpacing: 8 }}
                autoFocus
                error={!!pinError}
              />
              {pinError && <p className="form-error mt-1.5">{pinError}</p>}
              <p className="text-[11px] text-[var(--color-amber)] mt-1.5 text-center">
                ⚠ Demo placeholder — not real security. Enter 1234.
              </p>
            </div>

            <div className="flex gap-3">
              <Button variant="secondary"   fullWidth onClick={() => setShowRevoke(false)}>Cancel</Button>
              <Button variant="destructive" fullWidth loading={revoking} onClick={handleRevoke}>Revoke</Button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
