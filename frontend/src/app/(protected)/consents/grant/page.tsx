'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from '@/lib/auth';
import { api, RelyingParty, SCOPE_LABELS } from '@/lib/api';
import Button from '@/components/Button';

type Step = 'select-rp' | 'select-scopes' | 'authenticate' | 'success';

const SCOPE_GROUPS = [
  {
    group: 'Identity',
    icon: '👤',
    scopes: ['identity:name', 'identity:email', 'identity:dob', 'identity:gov_id'],
  },
  {
    group: 'Address',
    icon: '🏠',
    scopes: ['address:current', 'address:history'],
  },
  {
    group: 'Payment',
    icon: '💳',
    scopes: ['payment:card_ref'],
  },
  {
    group: 'Contacts',
    icon: '📞',
    scopes: ['contacts:phone', 'contacts:all'],
  },
];

export default function GrantPage() {
  const { user } = useAuthState();
  const router = useRouter();

  const [step, setStep] = useState<Step>('select-rp');
  const [rps, setRps] = useState<RelyingParty[]>([]);
  const [loadingRPs, setLoadingRPs] = useState(true);
  const [selectedRp, setSelectedRp] = useState<RelyingParty | null>(null);
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [granting, setGranting] = useState(false);
  const [createdGrantId, setCreatedGrantId] = useState('');

  useEffect(() => {
    api.relyingParties
      .list()
      .then(setRps)
      .catch(() => {})
      .finally(() => setLoadingRPs(false));
  }, []);

  function toggleScope(scope: string) {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  }

  async function handleGrant() {
    if (pin !== '1234') {
      setPinError('Incorrect PIN. Use 1234 for demo.');
      return;
    }
    if (!user || !selectedRp) return;
    setPinError('');
    setGranting(true);
    try {
      const grant = await api.consents.create({
        user_id: user.id,
        relying_party_id: selectedRp.id,
        scopes: selectedScopes,
      });
      setCreatedGrantId(grant.id);
      setStep('success');
    } catch (err: any) {
      setPinError(err.message || 'Grant failed');
    } finally {
      setGranting(false);
    }
  }

  // ── Step 1: Select RP ──
  if (step === 'select-rp') {
    return (
      <div className="page-container">
        <div style={{ background: 'var(--color-navy)', padding: '52px 24px 24px', marginBottom: 24 }}>
          <button
            onClick={() => router.back()}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 14, marginBottom: 12 }}
          >
            ← Back
          </button>
          <h1 style={{ color: 'white', fontSize: 20, fontWeight: 700 }}>Grant Access</h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 4 }}>Step 1 of 3 — Choose an app</p>
        </div>

        <div style={{ padding: '0 16px' }}>
          {loadingRPs ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" /></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rps.map((rp) => (
                <button
                  key={rp.id}
                  onClick={() => { setSelectedRp(rp); setSelectedScopes([]); setStep('select-scopes'); }}
                  style={{
                    background: 'white',
                    border: '1.5px solid var(--color-border)',
                    borderRadius: 16,
                    padding: '16px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: 'var(--color-navy)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: 18,
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    {rp.name.charAt(0)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-1)', marginBottom: 2 }}>{rp.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}>{rp.domain}</div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M6 4L10 8L6 12" stroke="var(--color-text-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Step 2: Select scopes ──
  if (step === 'select-scopes') {
    const allowedScopes = selectedRp?.allowedScopes ?? [];
    return (
      <div className="page-container" style={{ paddingBottom: 100 }}>
        <div style={{ background: 'var(--color-navy)', padding: '52px 24px 24px', marginBottom: 24 }}>
          <button
            onClick={() => setStep('select-rp')}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 14, marginBottom: 12 }}
          >
            ← Back
          </button>
          <h1 style={{ color: 'white', fontSize: 20, fontWeight: 700 }}>Review Access</h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 4 }}>Step 2 of 3 — Choose what to share with {selectedRp?.name}</p>
        </div>

        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {SCOPE_GROUPS.map(({ group, icon, scopes }) => {
            const available = scopes.filter((s) => allowedScopes.includes(s));
            if (available.length === 0) return null;
            return (
              <div key={group} className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <span style={{ fontSize: 18 }}>{icon}</span>
                  <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text-1)' }}>{group}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {available.map((scope) => {
                    const checked = selectedScopes.includes(scope);
                    return (
                      <label
                        key={scope}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleScope(scope)}
                          style={{ width: 18, height: 18, accentColor: 'var(--color-navy)', cursor: 'pointer' }}
                        />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-1)' }}>
                            {SCOPE_LABELS[scope] ?? scope}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{scope}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <Button
            variant="primary"
            fullWidth
            disabled={selectedScopes.length === 0}
            onClick={() => setStep('authenticate')}
          >
            Continue ({selectedScopes.length} scope{selectedScopes.length !== 1 ? 's' : ''})
          </Button>
        </div>
      </div>
    );
  }

  // ── Step 3: Authenticate ──
  if (step === 'authenticate') {
    return (
      <div className="page-container">
        <div style={{ background: 'var(--color-navy)', padding: '52px 24px 24px', marginBottom: 24 }}>
          <button
            onClick={() => setStep('select-scopes')}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 14, marginBottom: 12 }}
          >
            ← Back
          </button>
          <h1 style={{ color: 'white', fontSize: 20, fontWeight: 700 }}>Authenticate</h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 4 }}>Step 3 of 3 — Confirm with your PIN</p>
        </div>

        <div style={{ padding: '0 24px', maxWidth: 400, margin: '0 auto' }}>
          <div className="card" style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔐</div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-1)', marginBottom: 8 }}>
              Granting {selectedScopes.length} scope{selectedScopes.length !== 1 ? 's' : ''} to {selectedRp?.name}
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginBottom: 4 }}>
              {selectedScopes.map((s) => (
                <span
                  key={s}
                  style={{
                    background: 'var(--color-navy)',
                    color: 'white',
                    borderRadius: 20,
                    padding: '3px 10px',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {SCOPE_LABELS[s] ?? s}
                </span>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 8, textAlign: 'center' }}>
              Enter PIN
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="••••"
              value={pin}
              onChange={(e) => { setPin(e.target.value); setPinError(''); }}
              className="form-input"
              style={{ textAlign: 'center', fontSize: 26, letterSpacing: 10 }}
              autoFocus
            />
            {pinError && <div className="form-error" style={{ marginTop: 6 }}>{pinError}</div>}
            <p style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 6, textAlign: 'center' }}>Demo PIN: 1234</p>
          </div>

          <Button variant="primary" fullWidth loading={granting} onClick={handleGrant}>
            Confirm Grant
          </Button>
        </div>
      </div>
    );
  }

  // ── Step 4: Success ──
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        textAlign: 'center',
        background: 'var(--color-bg)',
      }}
    >
      <div style={{ fontSize: 72, marginBottom: 24 }}>✅</div>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--color-text-1)', marginBottom: 8 }}>Access Granted</h1>
      <p style={{ fontSize: 15, color: 'var(--color-text-2)', marginBottom: 32, maxWidth: 280 }}>
        {selectedRp?.name} now has access to your selected data. You can revoke this at any time.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 320 }}>
        <Button
          variant="primary"
          fullWidth
          onClick={() => router.push(`/consents/${createdGrantId}`)}
        >
          View Consent
        </Button>
        <Button
          variant="secondary"
          fullWidth
          onClick={() => router.push('/consents')}
        >
          Back to Consents
        </Button>
      </div>
    </div>
  );
}
