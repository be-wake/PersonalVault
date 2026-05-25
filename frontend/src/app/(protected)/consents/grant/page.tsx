'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from '@/lib/auth';
import { api, type RelyingParty, SCOPE_LABELS } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import Spinner from '@/components/Spinner';
import PageHeader from '@/components/PageHeader';

type Step = 'select-rp' | 'select-scopes' | 'authenticate' | 'success';

const SCOPE_GROUPS = [
  { group: 'Identity', icon: '👤', scopes: ['identity:name', 'identity:email', 'identity:dob', 'identity:gov_id'] },
  { group: 'Address',  icon: '🏠', scopes: ['address:current', 'address:history'] },
  { group: 'Payment',  icon: '💳', scopes: ['payment:card_ref'] },
  { group: 'Contacts', icon: '📞', scopes: ['contacts:phone', 'contacts:all'] },
];

export default function GrantPage() {
  const { user }  = useAuthState();
  const router    = useRouter();

  const [step,           setStep]           = useState<Step>('select-rp');
  const [rps,            setRps]            = useState<RelyingParty[]>([]);
  const [loadingRPs,     setLoadingRPs]     = useState(true);
  const [selectedRp,     setSelectedRp]     = useState<RelyingParty | null>(null);
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [pin,            setPin]            = useState('');
  const [pinError,       setPinError]       = useState('');
  const [granting,       setGranting]       = useState(false);
  const [createdGrantId, setCreatedGrantId] = useState('');

  useEffect(() => {
    api.relyingParties.list().then(setRps).catch(() => {}).finally(() => setLoadingRPs(false));
  }, []);

  function toggleScope(scope: string) {
    setSelectedScopes((prev) => prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]);
  }

  async function handleGrant() {
    if (pin !== '1234') { setPinError('Incorrect PIN. (Demo placeholder: enter 1234.)'); return; }
    if (!user || !selectedRp) return;
    setPinError('');
    setGranting(true);
    try {
      const grant = await api.consents.create({ relying_party_id: selectedRp.id, scopes: selectedScopes });
      setCreatedGrantId(grant.id);
      setStep('success');
    } catch (err: any) {
      setPinError(err.message || 'Grant failed');
    } finally {
      setGranting(false);
    }
  }

  // ── Step 1: Select RP ──────────────────────────────────────────────────────
  if (step === 'select-rp') {
    return (
      <div className="page-container">
        <PageHeader
          title="Grant Access"
          subtitle="Step 1 of 3 — Choose an app"
          onBack={() => router.back()}
        />
        <div className="px-4">
          {loadingRPs ? <Spinner /> : (
            <div className="flex flex-col gap-2.5">
              {rps.map((rp) => (
                <button
                  key={rp.id}
                  onClick={() => { setSelectedRp(rp); setSelectedScopes([]); setStep('select-scopes'); }}
                  className="bg-white border border-[var(--color-border)] rounded-2xl px-[18px] py-4 flex items-center gap-3.5 text-left cursor-pointer hover:shadow-md transition-shadow"
                >
                  <div className="w-11 h-11 rounded-xl bg-[var(--color-navy)] flex items-center justify-center text-white text-[18px] font-extrabold shrink-0">
                    {rp.name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <p className="text-[15px] font-bold text-[var(--color-text-1)] mb-0.5">{rp.name}</p>
                    <p className="text-[12px] text-[var(--color-text-3)]">{rp.domain}</p>
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

  // ── Step 2: Select scopes ──────────────────────────────────────────────────
  if (step === 'select-scopes') {
    const allowed = selectedRp?.allowedScopes ?? [];
    return (
      <div className="page-container pb-[100px]">
        <PageHeader
          title="Review Access"
          subtitle={`Step 2 of 3 — Choose what to share with ${selectedRp?.name}`}
          onBack={() => setStep('select-rp')}
        />
        <div className="px-4 flex flex-col gap-4">
          {SCOPE_GROUPS.map(({ group, icon, scopes }) => {
            const available = scopes.filter((s) => allowed.includes(s));
            if (available.length === 0) return null;
            return (
              <Card key={group}>
                <div className="flex items-center gap-2 mb-3.5">
                  <span className="text-[18px]">{icon}</span>
                  <span className="font-bold text-[14px] text-[var(--color-text-1)]">{group}</span>
                </div>
                <div className="flex flex-col gap-2.5">
                  {available.map((scope) => (
                    <label key={scope} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedScopes.includes(scope)}
                        onChange={() => toggleScope(scope)}
                        className="w-[18px] h-[18px] cursor-pointer accent-[var(--color-navy)]"
                      />
                      <div>
                        <p className="text-[13px] font-semibold text-[var(--color-text-1)]">
                          {SCOPE_LABELS[scope] ?? scope}
                        </p>
                        <p className="text-[11px] text-[var(--color-text-3)]">{scope}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </Card>
            );
          })}

          <Button
            variant="primary" fullWidth
            disabled={selectedScopes.length === 0}
            onClick={() => setStep('authenticate')}
          >
            Continue ({selectedScopes.length} scope{selectedScopes.length !== 1 ? 's' : ''})
          </Button>
        </div>
      </div>
    );
  }

  // ── Step 3: Authenticate ───────────────────────────────────────────────────
  if (step === 'authenticate') {
    return (
      <div className="page-container">
        <PageHeader
          title="Authenticate"
          subtitle="Step 3 of 3 — Confirm with your PIN"
          onBack={() => setStep('select-scopes')}
        />
        <div className="px-6 max-w-[400px] mx-auto">
          <Card className="text-center mb-6">
            <p className="text-[40px] mb-3">🔐</p>
            <h2 className="text-[16px] font-bold text-[var(--color-text-1)] mb-2">
              Granting {selectedScopes.length} scope{selectedScopes.length !== 1 ? 's' : ''} to {selectedRp?.name}
            </h2>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {selectedScopes.map((s) => (
                <Badge key={s} variant="navy">{SCOPE_LABELS[s] ?? s}</Badge>
              ))}
            </div>
          </Card>

          <div className="mb-5">
            <Label className="block text-center mb-2">Enter PIN</Label>
            <Input
              type="password" inputMode="numeric" maxLength={4} placeholder="••••"
              value={pin} onChange={(e) => { setPin(e.target.value); setPinError(''); }}
              style={{ textAlign: 'center', fontSize: 26, letterSpacing: 10 }}
              autoFocus error={!!pinError}
            />
            {pinError && <p className="form-error mt-1.5">{pinError}</p>}
            <p className="text-[11px] text-[var(--color-amber)] mt-1.5 text-center">
              ⚠ Demo placeholder — not real security. Enter 1234.
            </p>
          </div>

          <Button variant="primary" fullWidth loading={granting} onClick={handleGrant}>
            Confirm Grant
          </Button>
        </div>
      </div>
    );
  }

  // ── Step 4: Success ────────────────────────────────────────────────────────
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-8 text-center bg-[var(--color-bg)]">
      <p className="text-[72px] mb-6">✅</p>
      <h1 className="text-[24px] font-extrabold text-[var(--color-text-1)] mb-2">Access Granted</h1>
      <p className="text-[15px] text-[var(--color-text-2)] mb-8 max-w-[280px]">
        {selectedRp?.name} now has access to your selected data. You can revoke this at any time.
      </p>
      <div className="flex flex-col gap-3 w-full max-w-[320px]">
        <Button variant="primary"   fullWidth onClick={() => router.push(`/consents/${createdGrantId}`)}>
          View Consent
        </Button>
        <Button variant="secondary" fullWidth onClick={() => router.push('/consents')}>
          Back to Consents
        </Button>
      </div>
    </div>
  );
}
