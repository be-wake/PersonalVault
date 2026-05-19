'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from '@/lib/auth';
import { api, AddressData } from '@/lib/api';
import FieldRow from '@/components/FieldRow';
import Button from '@/components/Button';

export default function AddressPage() {
  const { user } = useAuthState();
  const router = useRouter();
  const [data, setData] = useState<AddressData | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ line1: '', line2: '', city: '', state: '', postal: '', country: '' });
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!user) return;
    api.vault
      .getAddress(user.id)
      .then((d) => {
        setData(d);
        setForm({
          line1: d.line1 ?? '',
          line2: d.line2 ?? '',
          city: d.city ?? '',
          state: d.state ?? '',
          postal: d.postal ?? '',
          country: d.country ?? '',
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const updated = await api.vault.updateAddress(user.id, form);
      setData(updated);
      setEditing(false);
      setToast('Address saved');
      setTimeout(() => setToast(''), 2500);
    } catch {
      setToast('Save failed');
      setTimeout(() => setToast(''), 2500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-container">
      <div style={{ background: 'var(--color-navy)', padding: '52px 24px 24px', marginBottom: 24 }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 14, marginBottom: 12 }}
        >
          ← Back
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 28 }}>🏠</span>
          <div>
            <h1 style={{ color: 'white', fontSize: 20, fontWeight: 700 }}>Address</h1>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Current & address history</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" /></div>
      ) : editing ? (
        <form onSubmit={handleSave} style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            { id: 'line1', label: 'Address line 1', placeholder: '123 Main St' },
            { id: 'line2', label: 'Address line 2', placeholder: 'Apt 4B (optional)' },
            { id: 'city', label: 'City', placeholder: 'Mumbai' },
            { id: 'state', label: 'State / Region', placeholder: 'Maharashtra' },
            { id: 'postal', label: 'Postal code', placeholder: '400001' },
            { id: 'country', label: 'Country', placeholder: 'IN' },
          ].map(({ id, label, placeholder }) => (
            <div key={id}>
              <label htmlFor={id} style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 6 }}>{label}</label>
              <input
                id={id}
                type="text"
                placeholder={placeholder}
                value={(form as any)[id]}
                onChange={(e) => setForm((f) => ({ ...f, [id]: e.target.value }))}
                className="form-input"
              />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <Button type="button" variant="secondary" fullWidth onClick={() => setEditing(false)}>Cancel</Button>
            <Button type="submit" variant="primary" fullWidth loading={saving}>Save</Button>
          </div>
        </form>
      ) : (
        <div style={{ padding: '0 16px' }}>
          <div className="card" style={{ marginBottom: 16 }}>
            <FieldRow label="Line 1" value={data?.line1 ?? '—'} mask="NONE" />
            <div style={{ height: 1, background: 'var(--color-border)', margin: '12px 0' }} />
            <FieldRow label="Line 2" value={data?.line2 ?? '—'} mask="NONE" />
            <div style={{ height: 1, background: 'var(--color-border)', margin: '12px 0' }} />
            <FieldRow label="City" value={data?.city ?? '—'} mask="NONE" />
            <div style={{ height: 1, background: 'var(--color-border)', margin: '12px 0' }} />
            <FieldRow label="State" value={data?.state ?? '—'} mask="NONE" />
            <div style={{ height: 1, background: 'var(--color-border)', margin: '12px 0' }} />
            <FieldRow label="Postal code" value={data?.postal ?? '—'} mask="PARTIAL" />
            <div style={{ height: 1, background: 'var(--color-border)', margin: '12px 0' }} />
            <FieldRow label="Country" value={data?.country ?? '—'} mask="NONE" />
          </div>
          <Button variant="secondary" fullWidth onClick={() => setEditing(true)}>Edit Address</Button>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
