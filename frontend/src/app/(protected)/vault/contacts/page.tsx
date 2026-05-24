'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from '@/lib/auth';
import { api, ContactsData } from '@/lib/api';
import FieldRow from '@/components/FieldRow';
import Button from '@/components/Button';

export default function ContactsPage() {
  const { user } = useAuthState();
  const router = useRouter();
  const [data, setData] = useState<ContactsData | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // F8 — social / secondary contact handles
  const [form, setForm] = useState({
    phone_primary:   '',
    phone_type:      'mobile',
    email_secondary: '',
    linkedin_url:    '',
    twitter_handle:  '',
    website_url:     '',
  });
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!user) return;
    api.vault
      .getContacts(user.id)
      .then((d) => {
        setData(d);
        setForm({
          phone_primary:   d.phone_primary   ?? '',
          phone_type:      d.phone_type      ?? 'mobile',
          email_secondary: d.email_secondary ?? '',
          linkedin_url:    d.linkedin_url    ?? '',
          twitter_handle:  d.twitter_handle  ?? '',
          website_url:     d.website_url     ?? '',
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
      const updated = await api.vault.updateContacts(user.id, form);
      setData(updated);
      setEditing(false);
      setToast('Contacts saved');
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
          <span style={{ fontSize: 28 }}>📞</span>
          <div>
            <h1 style={{ color: 'white', fontSize: 20, fontWeight: 700 }}>Contacts</h1>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Phone, email & social handles</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" /></div>
      ) : editing ? (
        <form onSubmit={handleSave} style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label htmlFor="phone_primary" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 6 }}>
              Primary phone
            </label>
            <input
              id="phone_primary"
              type="tel"
              placeholder="+91 98765 43210"
              value={form.phone_primary}
              onChange={(e) => setForm((f) => ({ ...f, phone_primary: e.target.value }))}
              className="form-input"
            />
          </div>

          <div>
            <label htmlFor="phone_type" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 6 }}>
              Phone type
            </label>
            <select
              id="phone_type"
              value={form.phone_type}
              onChange={(e) => setForm((f) => ({ ...f, phone_type: e.target.value }))}
              className="form-input"
            >
              {['mobile', 'home', 'work', 'other'].map((t) => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="email_secondary" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 6 }}>
              Secondary email (optional)
            </label>
            <input
              id="email_secondary"
              type="email"
              placeholder="backup@example.com"
              value={form.email_secondary}
              onChange={(e) => setForm((f) => ({ ...f, email_secondary: e.target.value }))}
              className="form-input"
            />
          </div>

          {/* F8 — social handles */}
          <div>
            <label htmlFor="linkedin_url" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 6 }}>
              LinkedIn URL (optional)
            </label>
            <input
              id="linkedin_url"
              type="url"
              placeholder="https://linkedin.com/in/yourprofile"
              value={form.linkedin_url}
              onChange={(e) => setForm((f) => ({ ...f, linkedin_url: e.target.value }))}
              className="form-input"
            />
          </div>

          <div>
            <label htmlFor="twitter_handle" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 6 }}>
              X / Twitter handle (optional)
            </label>
            <input
              id="twitter_handle"
              type="text"
              placeholder="@yourhandle"
              value={form.twitter_handle}
              onChange={(e) => setForm((f) => ({ ...f, twitter_handle: e.target.value }))}
              className="form-input"
            />
          </div>

          <div>
            <label htmlFor="website_url" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 6 }}>
              Website (optional)
            </label>
            <input
              id="website_url"
              type="url"
              placeholder="https://yourwebsite.com"
              value={form.website_url}
              onChange={(e) => setForm((f) => ({ ...f, website_url: e.target.value }))}
              className="form-input"
            />
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <Button type="button" variant="secondary" fullWidth onClick={() => setEditing(false)}>Cancel</Button>
            <Button type="submit" variant="primary" fullWidth loading={saving}>Save</Button>
          </div>
        </form>
      ) : (
        <div style={{ padding: '0 16px' }}>
          <div className="card" style={{ marginBottom: 16 }}>
            <FieldRow label="Primary phone" value={data?.phone_primary ?? '—'} mask="PARTIAL" />
            <div style={{ height: 1, background: 'var(--color-border)', margin: '12px 0' }} />
            <FieldRow label="Phone type" value={data?.phone_type ?? '—'} mask="NONE" />
            <div style={{ height: 1, background: 'var(--color-border)', margin: '12px 0' }} />
            <FieldRow label="Secondary email" value={data?.email_secondary ?? '—'} mask="PARTIAL" />
          </div>

          {/* F8 — social handles card (only shown if any value is set) */}
          {(data?.linkedin_url || data?.twitter_handle || data?.website_url) && (
            <div className="card" style={{ marginBottom: 16 }}>
              {data?.linkedin_url && (
                <>
                  <FieldRow label="LinkedIn" value={data.linkedin_url} mask="NONE" />
                  {(data?.twitter_handle || data?.website_url) && (
                    <div style={{ height: 1, background: 'var(--color-border)', margin: '12px 0' }} />
                  )}
                </>
              )}
              {data?.twitter_handle && (
                <>
                  <FieldRow label="X / Twitter" value={data.twitter_handle} mask="NONE" />
                  {data?.website_url && (
                    <div style={{ height: 1, background: 'var(--color-border)', margin: '12px 0' }} />
                  )}
                </>
              )}
              {data?.website_url && (
                <FieldRow label="Website" value={data.website_url} mask="NONE" />
              )}
            </div>
          )}
          <Button variant="secondary" fullWidth onClick={() => setEditing(true)}>Edit Contacts</Button>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
