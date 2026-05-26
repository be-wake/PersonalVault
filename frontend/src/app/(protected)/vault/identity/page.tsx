'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuthState } from '@/lib/auth';
import { useRealtime, type RealtimeMessage } from '@/lib/ws';
import { api, type IdentityDocument, type IdentityResponse } from '@/lib/api';
import PageHeader from '@/components/PageHeader';
import Spinner from '@/components/Spinner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

// ── Document type catalogue ───────────────────────────────────────────────────
const DOC_TYPES: Record<string, { label: string; icon: string; placeholder: string }> = {
  aadhaar:         { label: 'Aadhaar',         icon: '🪪', placeholder: '1234 5678 9012' },
  passport:        { label: 'Passport',         icon: '🛂', placeholder: 'A1234567' },
  driving_license: { label: 'Driving License',  icon: '🚗', placeholder: 'DL-1234567890' },
  pan:             { label: 'PAN Card',         icon: '📋', placeholder: 'AAAAA9999A' },
  voter_id:        { label: 'Voter ID',         icon: '🗳️', placeholder: 'ABC1234567' },
  national_id:     { label: 'National ID',      icon: '🆔', placeholder: '' },
};

// Show last 4 chars, mask the rest
function maskNumber(n: string) {
  if (!n) return '—';
  if (n.replace(/\s/g, '').length <= 4) return n;
  const clean = n.replace(/\s/g, '');
  return '•'.repeat(Math.max(0, clean.length - 4)) + clean.slice(-4);
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="empty-state mt-8">
      <span style={{ fontSize: 48 }}>🪪</span>
      <p style={{ color: 'var(--color-text-2)', fontWeight: 600 }}>No identity documents yet</p>
      <p style={{ color: 'var(--color-text-3)', fontSize: 13 }}>
        Add your Aadhaar, Passport or Driving License below.
      </p>
    </div>
  );
}

// ── Document form (add / edit) ────────────────────────────────────────────────
interface DocFormProps {
  initial?: { id_type: string; id_number: string };
  saving: boolean;
  onSave: (e: FormEvent, form: { id_type: string; id_number: string }) => void;
  onCancel: () => void;
  label: string;
}

function DocForm({ initial, saving, onSave, onCancel, label }: DocFormProps) {
  const [form, setForm] = useState({
    id_type:   initial?.id_type   ?? 'aadhaar',
    id_number: initial?.id_number ?? '',
  });

  return (
    <form
      onSubmit={(e) => onSave(e, form)}
      className="flex flex-col gap-3"
    >
      <div className="form-group">
        <Label htmlFor="doc-type">ID Type</Label>
        <select
          id="doc-type"
          className="form-input"
          value={form.id_type}
          onChange={(e) => setForm((f) => ({ ...f, id_type: e.target.value, id_number: '' }))}
          style={{ height: 48, paddingLeft: 16, paddingRight: 16, cursor: 'pointer' }}
        >
          {Object.entries(DOC_TYPES).map(([k, v]) => (
            <option key={k} value={k}>{v.icon}  {v.label}</option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <Label htmlFor="doc-number">ID Number</Label>
        <Input
          id="doc-number"
          placeholder={DOC_TYPES[form.id_type]?.placeholder ?? 'Enter ID number'}
          value={form.id_number}
          onChange={(e) => setForm((f) => ({ ...f, id_number: e.target.value }))}
          required
          autoComplete="off"
        />
      </div>

      <div className="flex gap-3 mt-1">
        <Button type="button" variant="secondary" fullWidth onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" fullWidth loading={saving}>
          {label}
        </Button>
      </div>
    </form>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function IdentityPage() {
  const { user } = useAuthState();

  const [docs,    setDocs]    = useState<IdentityDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding,  setAdding]  = useState(false);
  const [editId,  setEditId]  = useState<string | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [toast,   setToast]   = useState('');

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  // ── Load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    api.vault.getIdentity(user.id)
      .then((r: IdentityResponse) => setDocs(r.documents ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  // ── Realtime sync ───────────────────────────────────────────────────────────
  const onRealtime = useCallback((msg: RealtimeMessage) => {
    if (msg.type !== 'VAULT_UPDATED' || msg.resource !== 'identity') return;
    const payload = msg.data as Partial<IdentityResponse>;
    if (payload.documents) setDocs(payload.documents);
  }, []);
  useRealtime(onRealtime);

  // ── Actions ─────────────────────────────────────────────────────────────────
  function startAdd() {
    setEditId(null);
    setAdding(true);
  }

  function startEdit(docId: string) {
    setAdding(false);
    setEditId(docId);
  }

  function cancelForm() {
    setAdding(false);
    setEditId(null);
  }

  async function handleAdd(_e: FormEvent, form: { id_type: string; id_number: string }) {
    if (!user) return;
    setSaving(true);
    try {
      const result = await api.vault.addDocument(user.id, form);
      setDocs(result.documents ?? []);
      setAdding(false);
      showToast('Identity document added');
    } catch {
      showToast('Failed to add document');
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(_e: FormEvent, form: { id_type: string; id_number: string }) {
    if (!user || !editId) return;
    setSaving(true);
    try {
      const updated = await api.vault.updateDocument(user.id, editId, form);
      setDocs(updated ?? []);
      setEditId(null);
      showToast('Document updated');
    } catch {
      showToast('Update failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(docId: string) {
    if (!user) return;
    try {
      await api.vault.deleteDocument(user.id, docId);
      setDocs((prev) => prev.filter((d) => d.id !== docId));
      showToast('Document removed');
    } catch {
      showToast('Remove failed');
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="page-container">
      <PageHeader
        title="Identity"
        subtitle="Government-issued ID documents"
        icon="🪪"
      />

      {loading ? (
        <Spinner />
      ) : (
        <div className="px-4 flex flex-col gap-3">

          {/* Empty state */}
          {docs.length === 0 && !adding && <EmptyState />}

          {/* Document cards */}
          {docs.map((doc) => {
            const typeInfo = DOC_TYPES[doc.id_type] ?? {
              label: doc.id_type,
              icon: '🆔',
              placeholder: '',
            };
            const isEditing = editId === doc.id;

            return (
              <Card key={doc.id} className="p-4">
                {isEditing ? (
                  <DocForm
                    initial={{ id_type: doc.id_type, id_number: doc.id_number }}
                    saving={saving}
                    onSave={handleEdit}
                    onCancel={cancelForm}
                    label="Save"
                  />
                ) : (
                  <div className="flex items-center gap-3">
                    {/* Type icon */}
                    <span style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>
                      {typeInfo.icon}
                    </span>

                    {/* Name + masked number */}
                    <div className="flex-1 min-w-0">
                      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-1)' }}>
                        {typeInfo.label}
                      </p>
                      <p style={{
                        fontSize: 13,
                        color: 'var(--color-text-3)',
                        fontFamily: 'monospace',
                        marginTop: 2,
                        letterSpacing: '0.05em',
                      }}>
                        {maskNumber(doc.id_number)}
                      </p>
                    </div>

                    {/* Edit button */}
                    <button
                      onClick={() => startEdit(doc.id)}
                      aria-label="Edit document"
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: '6px',
                        color: 'var(--color-text-2)',
                        cursor: 'pointer',
                        borderRadius: 8,
                        fontSize: 16,
                        lineHeight: 1,
                      }}
                    >
                      ✏️
                    </button>

                    {/* Delete button */}
                    <button
                      onClick={() => handleDelete(doc.id)}
                      aria-label="Delete document"
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: '6px',
                        color: 'var(--color-red)',
                        cursor: 'pointer',
                        borderRadius: 8,
                        fontSize: 16,
                        lineHeight: 1,
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                )}
              </Card>
            );
          })}

          {/* Add document form */}
          {adding && (
            <Card className="p-4">
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-1)', marginBottom: 12 }}>
                Add Identity Document
              </p>
              <DocForm
                saving={saving}
                onSave={handleAdd}
                onCancel={cancelForm}
                label="Add"
              />
            </Card>
          )}

          {/* Add button — hidden when form is open */}
          {!adding && editId === null && (
            <Button variant="secondary" fullWidth onClick={startAdd}>
              + Add Identity Document
            </Button>
          )}
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
