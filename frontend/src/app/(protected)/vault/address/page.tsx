'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuthState } from '@/lib/auth';
import { useRealtime, type RealtimeMessage } from '@/lib/ws';
import { api, type AddressData } from '@/lib/api';
import PageHeader from '@/components/PageHeader';
import FormField from '@/components/FormField';
import Spinner from '@/components/Spinner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

// ── Address label catalogue ───────────────────────────────────────────────────
const ADDR_LABELS: Record<string, { name: string; icon: string }> = {
  home:   { name: 'Home',   icon: '🏠' },
  work:   { name: 'Work',   icon: '🏢' },
  family: { name: 'Family', icon: '👨‍👩‍👧' },
  other:  { name: 'Other',  icon: '📍' },
};

type AddrFormState = {
  label: string;
  line1: string; line2: string;
  city: string;  state: string;
  postal: string; country: string;
};

const BLANK: AddrFormState = {
  label: 'home', line1: '', line2: '', city: '', state: '', postal: '', country: '',
};

function oneLiner(a: AddressData) {
  return [a.city, a.state, a.country].filter(Boolean).join(', ') || a.line1 || '—';
}

// ── Address form (shared by add and edit) ─────────────────────────────────────
function AddrForm({
  initial = BLANK,
  saving,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: AddrFormState;
  saving: boolean;
  submitLabel: string;
  onSubmit: (e: FormEvent, f: AddrFormState) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<AddrFormState>(initial);
  const set = (k: keyof AddrFormState) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <form onSubmit={(e) => onSubmit(e, form)} className="flex flex-col gap-3">
      {/* Label selector */}
      <div className="form-group">
        <Label htmlFor="addr-label">Label</Label>
        <select
          id="addr-label"
          className="form-input"
          value={form.label}
          onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          style={{ height: 48, paddingLeft: 16, cursor: 'pointer' }}
        >
          {Object.entries(ADDR_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v.icon}  {v.name}</option>
          ))}
        </select>
      </div>

      <FormField id="line1"   label="Address line 1" placeholder="123 Main St"        value={form.line1}   onChange={set('line1')}   required />
      <FormField id="line2"   label="Address line 2" placeholder="Apt 4B (optional)"  value={form.line2}   onChange={set('line2')} />
      <FormField id="city"    label="City"            placeholder="Mumbai"             value={form.city}    onChange={set('city')} />
      <FormField id="state"   label="State / Region"  placeholder="Maharashtra"        value={form.state}   onChange={set('state')} />
      <FormField id="postal"  label="Postal code"     placeholder="400001"             value={form.postal}  onChange={set('postal')} />
      <FormField id="country" label="Country"         placeholder="IN"                 value={form.country} onChange={set('country')} />

      <div className="flex gap-3 mt-1">
        <Button type="button" variant="secondary" fullWidth onClick={onCancel}>Cancel</Button>
        <Button type="submit"  variant="primary"   fullWidth loading={saving}>{submitLabel}</Button>
      </div>
    </form>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AddressPage() {
  const { user } = useAuthState();

  const [addresses, setAddresses] = useState<AddressData[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [adding,    setAdding]    = useState(false);
  const [editId,    setEditId]    = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [toast,     setToast]     = useState('');

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500); }

  // ── Load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    api.vault.getAddresses(user.id)
      .then(setAddresses)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  // ── Realtime sync ───────────────────────────────────────────────────────────
  const onRealtime = useCallback((msg: RealtimeMessage) => {
    if (msg.type !== 'VAULT_UPDATED' || msg.resource !== 'address') return;
    const p = msg.data as { addresses?: AddressData[] };
    if (p.addresses) setAddresses(p.addresses);
  }, []);
  useRealtime(onRealtime);

  // ── Actions ─────────────────────────────────────────────────────────────────
  function cancelForm() { setAdding(false); setEditId(null); }

  async function handleAdd(e: FormEvent, form: AddrFormState) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const res = await api.vault.addAddress(user.id, form);
      setAddresses(res.addresses ?? []);
      setAdding(false);
      showToast('Address added');
    } catch { showToast('Failed to add address'); }
    finally { setSaving(false); }
  }

  async function handleEdit(e: FormEvent, form: AddrFormState) {
    e.preventDefault();
    if (!user || !editId) return;
    setSaving(true);
    try {
      const updated = await api.vault.updateAddress(user.id, editId, form);
      setAddresses(updated ?? []);
      setEditId(null);
      showToast('Address updated');
    } catch { showToast('Update failed'); }
    finally { setSaving(false); }
  }

  async function handleDelete(addressId: string) {
    if (!user) return;
    try {
      await api.vault.deleteAddress(user.id, addressId);
      setAddresses((prev) => prev.filter((a) => a.id !== addressId));
      showToast('Address removed');
    } catch { showToast('Remove failed'); }
  }

  async function handleSetPrimary(addressId: string) {
    if (!user) return;
    try {
      const updated = await api.vault.setPrimaryAddress(user.id, addressId);
      setAddresses(updated ?? []);
      showToast('Primary address updated');
    } catch { showToast('Failed to update primary'); }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="page-container">
      <PageHeader title="Addresses" subtitle="Home, Work, Family & more" icon="🏠" />

      {loading ? <Spinner /> : (
        <div className="px-4 flex flex-col gap-3">

          {/* Empty state */}
          {addresses.length === 0 && !adding && (
            <div className="empty-state mt-6">
              <span style={{ fontSize: 48 }}>🏠</span>
              <p style={{ color: 'var(--color-text-2)', fontWeight: 600 }}>No addresses yet</p>
              <p style={{ color: 'var(--color-text-3)', fontSize: 13 }}>
                Add your Home, Work or other addresses below.
              </p>
            </div>
          )}

          {/* Address cards */}
          {addresses.map((addr) => {
            const lbl = ADDR_LABELS[addr.type ?? addr.label ?? ''] ?? { name: addr.type ?? 'Other', icon: '📍' };
            const isEditing = editId === addr.id;

            return (
              <Card key={addr.id} className="p-4">
                {isEditing ? (
                  <AddrForm
                    initial={{
                      label:   addr.type ?? addr.label ?? 'home',
                      line1:   addr.line1   ?? '',
                      line2:   addr.line2   ?? '',
                      city:    addr.city    ?? '',
                      state:   addr.state   ?? '',
                      postal:  addr.postal  ?? '',
                      country: addr.country ?? '',
                    }}
                    saving={saving}
                    submitLabel="Save"
                    onSubmit={handleEdit}
                    onCancel={cancelForm}
                  />
                ) : (
                  <div>
                    {/* Header row */}
                    <div className="flex items-center gap-2 mb-2">
                      <span style={{ fontSize: 20 }}>{lbl.icon}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-1)' }}>
                        {lbl.name}
                      </span>
                      {addr.is_current && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, letterSpacing: '0.5px',
                          textTransform: 'uppercase',
                          background: 'var(--color-teal-lt)', color: 'var(--color-teal)',
                          borderRadius: 99, padding: '2px 8px',
                        }}>
                          Primary
                        </span>
                      )}
                      {/* Spacer + action buttons */}
                      <span className="flex-1" />
                      <button
                        onClick={() => { setAdding(false); setEditId(addr.id!); }}
                        aria-label="Edit address"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, fontSize: 15 }}
                      >✏️</button>
                      <button
                        onClick={() => handleDelete(addr.id!)}
                        aria-label="Delete address"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, fontSize: 15, color: 'var(--color-red)' }}
                      >🗑️</button>
                    </div>

                    {/* Address details */}
                    <div style={{ fontSize: 13, color: 'var(--color-text-2)', lineHeight: 1.6, paddingLeft: 28 }}>
                      {addr.line1 && <div>{addr.line1}</div>}
                      {addr.line2 && <div>{addr.line2}</div>}
                      <div>{oneLiner(addr)}</div>
                    </div>

                    {/* Set primary button */}
                    {!addr.is_current && (
                      <button
                        onClick={() => handleSetPrimary(addr.id!)}
                        style={{
                          marginTop: 10, marginLeft: 28,
                          fontSize: 12, fontWeight: 600,
                          color: 'var(--color-blue)',
                          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                        }}
                      >
                        ☆ Set as Primary
                      </button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}

          {/* Add form */}
          {adding && (
            <Card className="p-4">
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-1)', marginBottom: 12 }}>
                Add Address
              </p>
              <AddrForm
                saving={saving}
                submitLabel="Add"
                onSubmit={handleAdd}
                onCancel={cancelForm}
              />
            </Card>
          )}

          {/* Add button */}
          {!adding && editId === null && (
            <Button variant="secondary" fullWidth onClick={() => setAdding(true)}>
              + Add Address
            </Button>
          )}
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
