'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuthState } from '@/lib/auth';
import { useRealtime, type RealtimeMessage } from '@/lib/ws';
import { api, type ContactsData } from '@/lib/api';
import PageHeader from '@/components/PageHeader';
import FormField from '@/components/FormField';
import FieldRow from '@/components/FieldRow';
import Spinner from '@/components/Spinner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

export default function ContactsPage() {
  const { user } = useAuthState();
  const [data,    setData]    = useState<ContactsData | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [toast,   setToast]   = useState('');
  const [form,    setForm]    = useState({
    phone_primary: '', phone_type: 'mobile',
    email_secondary: '', linkedin_url: '', twitter_handle: '', website_url: '',
  });

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500); }

  useEffect(() => {
    if (!user) return;
    api.vault.getContacts(user.id)
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

  const onRealtime = useCallback((msg: RealtimeMessage) => {
    if (msg.type !== 'VAULT_UPDATED' || msg.resource !== 'contacts') return;
    if (editing) return;
    const d = msg.data as ContactsData;
    setData(d);
    setForm({
      phone_primary: d.phone_primary ?? '', phone_type: d.phone_type ?? 'mobile',
      email_secondary: d.email_secondary ?? '', linkedin_url: d.linkedin_url ?? '',
      twitter_handle: d.twitter_handle ?? '', website_url: d.website_url ?? '',
    });
  }, [editing]);
  useRealtime(onRealtime);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const updated = await api.vault.updateContacts(user.id, form);
      setData(updated);
      setEditing(false);
      showToast('Contacts saved');
    } catch {
      showToast('Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-container">
      <PageHeader title="Contacts" subtitle="Phone, email & social handles" icon="📞" />

      {loading ? <Spinner /> : editing ? (
        <form onSubmit={handleSave} className="flex flex-col gap-4 px-4">
          <FormField id="phone_primary" label="Primary phone" type="tel"
            placeholder="+91 98765 43210" value={form.phone_primary}
            onChange={(v) => setForm((f) => ({ ...f, phone_primary: v }))} />

          <div className="form-group">
            <Label htmlFor="phone_type">Phone type</Label>
            <select
              id="phone_type" value={form.phone_type}
              onChange={(e) => setForm((f) => ({ ...f, phone_type: e.target.value }))}
              className="form-input"
            >
              {['mobile', 'home', 'work', 'other'].map((t) => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>

          <FormField id="email_secondary" label="Secondary email (optional)" type="email"
            placeholder="backup@example.com" value={form.email_secondary}
            onChange={(v) => setForm((f) => ({ ...f, email_secondary: v }))} />

          <FormField id="linkedin_url" label="LinkedIn URL (optional)" type="url"
            placeholder="https://linkedin.com/in/yourprofile" value={form.linkedin_url}
            onChange={(v) => setForm((f) => ({ ...f, linkedin_url: v }))} />

          <FormField id="twitter_handle" label="X / Twitter handle (optional)"
            placeholder="@yourhandle" value={form.twitter_handle}
            onChange={(v) => setForm((f) => ({ ...f, twitter_handle: v }))} />

          <FormField id="website_url" label="Website (optional)" type="url"
            placeholder="https://yourwebsite.com" value={form.website_url}
            onChange={(v) => setForm((f) => ({ ...f, website_url: v }))} />

          <div className="flex gap-3 mt-2">
            <Button type="button" variant="secondary" fullWidth onClick={() => setEditing(false)}>Cancel</Button>
            <Button type="submit" variant="primary"   fullWidth loading={saving}>Save</Button>
          </div>
        </form>
      ) : (
        <div className="px-4 flex flex-col gap-4">
          <Card>
            <FieldRow label="Primary phone"   value={data?.phone_primary}   mask="PARTIAL" />
            <FieldRow label="Phone type"      value={data?.phone_type}      mask="NONE" divider />
            <FieldRow label="Secondary email" value={data?.email_secondary} mask="PARTIAL" divider />
          </Card>

          {(data?.linkedin_url || data?.twitter_handle || data?.website_url) && (
            <Card>
              {data?.linkedin_url   && <FieldRow label="LinkedIn"   value={data.linkedin_url}   mask="NONE" />}
              {data?.twitter_handle && <FieldRow label="X / Twitter" value={data.twitter_handle} mask="NONE" divider={!!data.linkedin_url} />}
              {data?.website_url    && <FieldRow label="Website"    value={data.website_url}    mask="NONE" divider={!!(data.linkedin_url || data.twitter_handle)} />}
            </Card>
          )}

          <Button variant="secondary" fullWidth onClick={() => setEditing(true)}>Edit Contacts</Button>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
