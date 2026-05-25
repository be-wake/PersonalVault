'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuthState } from '@/lib/auth';
import { useRealtime, type RealtimeMessage } from '@/lib/ws';
import { api, type AddressData } from '@/lib/api';
import PageHeader from '@/components/PageHeader';
import FormField from '@/components/FormField';
import FieldRow from '@/components/FieldRow';
import Spinner from '@/components/Spinner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const FIELDS = [
  { id: 'line1',   label: 'Address line 1',  placeholder: '123 Main St' },
  { id: 'line2',   label: 'Address line 2',  placeholder: 'Apt 4B (optional)' },
  { id: 'city',    label: 'City',            placeholder: 'Mumbai' },
  { id: 'state',   label: 'State / Region',  placeholder: 'Maharashtra' },
  { id: 'postal',  label: 'Postal code',     placeholder: '400001' },
  { id: 'country', label: 'Country',         placeholder: 'IN' },
] as const;

type FormKey = typeof FIELDS[number]['id'];

export default function AddressPage() {
  const { user } = useAuthState();
  const [data,    setData]    = useState<AddressData | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [toast,   setToast]   = useState('');
  const [form,    setForm]    = useState<Record<FormKey, string>>({
    line1: '', line2: '', city: '', state: '', postal: '', country: '',
  });

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500); }

  useEffect(() => {
    if (!user) return;
    api.vault.getAddress(user.id)
      .then((d) => {
        setData(d);
        setForm({ line1: d.line1 ?? '', line2: d.line2 ?? '', city: d.city ?? '', state: d.state ?? '', postal: d.postal ?? '', country: d.country ?? '' });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  const onRealtime = useCallback((msg: RealtimeMessage) => {
    if (msg.type !== 'VAULT_UPDATED' || msg.resource !== 'address') return;
    if (editing) return;
    const d = msg.data as AddressData;
    setData(d);
    setForm({ line1: d.line1 ?? '', line2: d.line2 ?? '', city: d.city ?? '', state: d.state ?? '', postal: d.postal ?? '', country: d.country ?? '' });
  }, [editing]);
  useRealtime(onRealtime);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const updated = await api.vault.updateAddress(user.id, form);
      setData(updated);
      setEditing(false);
      showToast('Address saved');
    } catch {
      showToast('Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-container">
      <PageHeader title="Address" subtitle="Current & address history" icon="🏠" />

      {loading ? <Spinner /> : editing ? (
        <form onSubmit={handleSave} className="flex flex-col gap-4 px-4">
          {FIELDS.map(({ id, label, placeholder }) => (
            <FormField
              key={id} id={id} label={label} placeholder={placeholder}
              value={form[id]}
              onChange={(v) => setForm((f) => ({ ...f, [id]: v }))}
            />
          ))}
          <div className="flex gap-3 mt-2">
            <Button type="button" variant="secondary" fullWidth onClick={() => setEditing(false)}>Cancel</Button>
            <Button type="submit" variant="primary"   fullWidth loading={saving}>Save</Button>
          </div>
        </form>
      ) : (
        <div className="px-4">
          <Card className="mb-4">
            <FieldRow label="Line 1"      value={data?.line1}   mask="NONE" />
            <FieldRow label="Line 2"      value={data?.line2}   mask="NONE"    divider />
            <FieldRow label="City"        value={data?.city}    mask="NONE"    divider />
            <FieldRow label="State"       value={data?.state}   mask="NONE"    divider />
            <FieldRow label="Postal code" value={data?.postal}  mask="PARTIAL" divider />
            <FieldRow label="Country"     value={data?.country} mask="NONE"    divider />
          </Card>
          <Button variant="secondary" fullWidth onClick={() => setEditing(true)}>Edit Address</Button>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
