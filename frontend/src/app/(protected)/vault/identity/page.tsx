'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from '@/lib/auth';
import { api, IdentityData } from '@/lib/api';
import FieldRow from '@/components/FieldRow';
import Button from '@/components/Button';

export default function IdentityPage() {
  const { user } = useAuthState();
  const router = useRouter();
  const [data, setData] = useState<IdentityData | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email_primary: '',
    date_of_birth: '',
    id_type: '',
    id_number: '',
  });
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!user) return;
    api.vault
      .getIdentity(user.id)
      .then((d) => {
        setData(d);
        setForm({
          first_name: d.first_name ?? '',
          last_name: d.last_name ?? '',
          email_primary: d.email_primary ?? '',
          date_of_birth: d.date_of_birth ?? '',
          id_type: d.id_type ?? '',
          id_number: d.id_number ?? '',
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
      const updated = await api.vault.updateIdentity(user.id, form);
      setData(updated);
      setEditing(false);
      setToast('Identity saved');
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
          <span style={{ fontSize: 28 }}>👤</span>
          <div>
            <h1 style={{ color: 'white', fontSize: 20, fontWeight: 700 }}>Identity</h1>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Name, email, DOB, gov ID</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" /></div>
      ) : editing ? (
        <form onSubmit={handleSave} style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            { id: 'first_name', label: 'First name', type: 'text', placeholder: 'Jane' },
            { id: 'last_name', label: 'Last name', type: 'text', placeholder: 'Smith' },
            { id: 'email_primary', label: 'Primary email', type: 'email', placeholder: 'jane@example.com' },
            { id: 'date_of_birth', label: 'Date of birth', type: 'date', placeholder: '' },
            { id: 'id_type', label: 'Gov ID type', type: 'text', placeholder: 'PASSPORT / AADHAAR / SSN' },
            { id: 'id_number', label: 'Gov ID number', type: 'text', placeholder: '•••••••••' },
          ].map(({ id, label, type, placeholder }) => (
            <div key={id}>
              <label htmlFor={id} style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 6 }}>
                {label}
              </label>
              <input
                id={id}
                type={type}
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
            <FieldRow label="First name" value={data?.first_name ?? '—'} mask="NONE" />
            <div style={{ height: 1, background: 'var(--color-border)', margin: '12px 0' }} />
            <FieldRow label="Last name" value={data?.last_name ?? '—'} mask="NONE" />
            <div style={{ height: 1, background: 'var(--color-border)', margin: '12px 0' }} />
            <FieldRow label="Primary email" value={data?.email_primary ?? '—'} mask="PARTIAL" />
            <div style={{ height: 1, background: 'var(--color-border)', margin: '12px 0' }} />
            <FieldRow label="Date of birth" value={data?.date_of_birth ?? '—'} mask="PARTIAL" />
            <div style={{ height: 1, background: 'var(--color-border)', margin: '12px 0' }} />
            <FieldRow label="Gov ID type" value={data?.id_type ?? '—'} mask="NONE" />
            <div style={{ height: 1, background: 'var(--color-border)', margin: '12px 0' }} />
            <FieldRow label="Gov ID number" value={data?.id_number ?? '—'} mask="FULL" />
          </div>
          <Button variant="secondary" fullWidth onClick={() => setEditing(true)}>Edit Identity</Button>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
