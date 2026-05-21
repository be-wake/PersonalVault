'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuthState } from '@/lib/auth';
import { api, ConsentGrant, SCOPE_LABELS } from '@/lib/api';
import RPHeader from '@/components/RPHeader';
import StatusBadge from '@/components/StatusBadge';
import Button from '@/components/Button';

export default function ConsentDetailPage() {
  const { user } = useAuthState();
  const router = useRouter();
  const params = useParams();
  const grantId = params.grantId as string;

  const [grant, setGrant] = useState<ConsentGrant | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRevoke, setShowRevoke] = useState(false);
  const [pin, setPin] = useState('');
  const [revoking, setRevoking] = useState(false);
  const [pinError, setPinError] = useState('');
  const [toast, setToast] = useState('');
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!user) return;
    api.consents
      .get(user.id, grantId)
      .then(setGrant)
      .catch(() => router.replace('/consents'))
      .finally(() => setLoading(false));

    // WebSocket for real-time revocation updates.
    // Derive ws(s):// from the same base the REST API uses so dev
    // (http://localhost:4000) and prod (https://… → wss://…) both work.
    const token = localStorage.getItem('pdv_token');
    if (token) {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const wsBase  = apiBase.replace(/^http/, 'ws');
      const ws = new WebSocket(`${wsBase}/v1/ws?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          // Backend currently broadcasts { type: 'CONSENT_REVOKED', grant }.
          // Accept the legacy { event: 'consent.revoked', grantId } shape too
          // so older backends keep working during a rolling deploy.
          const isRevoke =
            msg?.type === 'CONSENT_REVOKED' ||
            msg?.event === 'consent.revoked';
          const affectedId = msg?.grant?.id ?? msg?.grantId;
          if (isRevoke && affectedId === grantId) {
            setGrant((g) =>
              g
                ? { ...g, status: 'REVOKED', revoked_at: msg?.grant?.revoked_at ?? new Date().toISOString() }
                : g,
            );
          }
        } catch {
          /* ignore malformed messages */
        }
      };
    }
    return () => wsRef.current?.close();
  }, [user, grantId, router]);

  async function handleRevoke() {
    // SECURITY-PLACEHOLDER: see /consents/grant page — same caveat applies.
    // The backend currently accepts DELETE /v1/consents/:id with only a normal
    // access token; this PIN is purely cosmetic. Replace with X-PDV-Stepup.
    if (pin !== '1234') {
      setPinError('Incorrect PIN. (Demo placeholder: enter 1234.)');
      return;
    }
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

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    );
  }
  if (!grant) return null;

  const rp = grant.rp;

  return (
    <div className="page-container" style={{ paddingBottom: 100 }}>
      {/* Back */}
      <div style={{ padding: '52px 16px 0' }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', color: 'var(--color-text-3)', cursor: 'pointer', fontSize: 14, marginBottom: 16 }}
        >
          ← Consents
        </button>
      </div>

      {/* RP Header */}
      {rp && <div style={{ padding: '0 16px' }}><RPHeader rp={rp} status={grant.status} /></div>}

      <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Dates */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Granted</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-1)' }}>{formatDate(grant.granted_at)}</div>
            </div>
            {grant.expires_at && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Expires</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-1)' }}>{formatDate(grant.expires_at)}</div>
              </div>
            )}
          </div>
          {grant.revoked_at && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Revoked</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-red)' }}>{formatDate(grant.revoked_at)}</div>
            </div>
          )}
        </div>

        {/* Scopes */}
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
            Data access granted
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {grant.scopes.map((scope) => (
              <div key={scope} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: 'var(--color-teal-lt)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    flexShrink: 0,
                  }}
                >
                  {scope.startsWith('identity') ? '👤' : scope.startsWith('address') ? '🏠' : scope.startsWith('payment') ? '💳' : '📞'}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-1)' }}>
                    {SCOPE_LABELS[scope] ?? scope}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{scope}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Revoke button */}
        {grant.status === 'ACTIVE' && (
          <Button variant="destructive" fullWidth onClick={() => setShowRevoke(true)}>
            Revoke Access
          </Button>
        )}

        {grant.status !== 'ACTIVE' && (
          <div style={{ textAlign: 'center', padding: 16, color: 'var(--color-text-3)', fontSize: 13 }}>
            This consent is {grant.status.toLowerCase()} and no longer active.
          </div>
        )}
      </div>

      {/* Revoke bottom sheet */}
      {showRevoke && (
        <div className="bottom-sheet-overlay" onClick={() => setShowRevoke(false)}>
          <div
            className="bottom-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-1)', marginBottom: 4 }}>Confirm Revocation</h2>
                <p style={{ fontSize: 13, color: 'var(--color-text-3)' }}>
                  {rp?.name} will lose access within 5 seconds.
                </p>
              </div>
              <button
                onClick={() => setShowRevoke(false)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-text-3)', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 8 }}>
                Enter your PIN to confirm
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder="••••"
                value={pin}
                onChange={(e) => { setPin(e.target.value); setPinError(''); }}
                className="form-input"
                style={{ textAlign: 'center', fontSize: 22, letterSpacing: 8 }}
                autoFocus
              />
              {pinError && <div className="form-error" style={{ marginTop: 6 }}>{pinError}</div>}
              <p style={{ fontSize: 11, color: 'var(--color-amber)', marginTop: 6, textAlign: 'center' }}>
                ⚠ Demo placeholder — not real security. Enter 1234.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <Button variant="secondary" fullWidth onClick={() => setShowRevoke(false)}>Cancel</Button>
              <Button variant="destructive" fullWidth loading={revoking} onClick={handleRevoke}>
                Revoke
              </Button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
