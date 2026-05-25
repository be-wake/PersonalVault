'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuthState } from '@/lib/auth';
import { useRealtime, type RealtimeMessage } from '@/lib/ws';
import { api, type IdentityData } from '@/lib/api';
import PageHeader from '@/components/PageHeader';
import FormField from '@/components/FormField';
import FieldRow from '@/components/FieldRow';
import Spinner from '@/components/Spinner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const FIELDS = [
  { id: 'first_name',     label: 'First name',     type: 'text',  placeholder: 'Jane' },
  { id: 'last_name',      label: 'Last name',       type: 'text',  placeholder: 'Smith' },
  { id: 'email_primary',  label: 'Primary email',   type: 'email', placeholder: 'jane@example.com' },
  { id: 'date_of_birth',  label: 'Date of birth',   type: 'date',  placeholder: '' },
  { id: 'id_type',        label: 'Gov ID type',     type: 'text',  placeholder: 'PASSPORT / AADHAAR / SSN' },
  { id: 'id_number',      label: 'Gov ID number',   type: 'text',  placeholder: '•••••••••' },
] as const;

type FormKey = typeof FIELDS[number]['id'];

export default function IdentityPage() {
  const { user } = useAuthState();
  const [data,    setData]    = useState<IdentityData | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [toast,   setToast]   = useState('');
  const [form,    setForm]    = useState<Record<FormKey, string>>({
    first_name: '', last_name: '', email_primary: '',
    date_of_birth: '', id_type: '', id_number: '',
  });

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500); }

  useEffect(() => {
    if (!user) return;
    api.vault.getIdentity(user.id)
      .then((d) => {
        setData(d);
        setForm({
          first_name: d.first_name ?? '', last_name: d.last_name ?? '',
          email_primary: d.email_primary ?? '', date_of_birth: d.date_of_birth ?? '',
          id_type: d.id_type ?? '', id_number: d.id_number ?? '',
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  // Real-time sync from other tabs/devices — skip if the user is mid-edit.
  const onRealtime = useCallback((msg: RealtimeMessage) => {
    if (msg.type !== 'VAULT_UPDATED' || msg.resource !== 'identity') return;
    if (editing) return;
    const d = msg.data as IdentityData;
    setData(d);
    setForm({
      first_name: d.first_name ?? '', last_name: d.last_name ?? '',
      email_primary: d.email_primary ?? '', date_of_birth: d.date_of_birth ?? '',
      id_type: d.id_type ?? '', id_number: d.id_number ?? '',
    });
  }, [editing]);
  useRealtime(onRealtime);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const updated = await api.vault.updateIdentity(user.id, form);
      setData(updated);
      setEditing(false);
      showToast('Identity saved');
    } catch {
      showToast('Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-container">
      <PageHeader title="Identity" subtitle="Name, email, DOB, gov ID" icon="👤" />

      {loading ? <Spinner /> : editing ? (
        <form onSubmit={handleSave} className="flex flex-col gap-4 px-4">
          {FIELDS.map(({ id, label, type, placeholder }) => (
            <FormField
              key={id} id={id} label={label} type={type} placeholder={placeholder}
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
            <FieldRow label="First name"    value={data?.first_name}    mask="NONE" />
            <FieldRow label="Last name"     value={data?.last_name}     mask="NONE"    divider />
            <FieldRow label="Primary email" value={data?.email_primary} mask="PARTIAL" divider />
            <FieldRow label="Date of birth" value={data?.date_of_birth} mask="PARTIAL" divider />
            <FieldRow label="Gov ID type"   value={data?.id_type}       mask="NONE"    divider />
            <FieldRow label="Gov ID number" value={data?.id_number}     mask="FULL"    divider />
          </Card>
          <Button variant="secondary" fullWidth onClick={() => setEditing(true)}>Edit Identity</Button>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
