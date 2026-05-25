'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuthState } from '@/lib/auth';
import { useRealtime, type RealtimeMessage } from '@/lib/ws';
import { api, type PaymentCard } from '@/lib/api';
import PageHeader from '@/components/PageHeader';
import FormField from '@/components/FormField';
import Spinner from '@/components/Spinner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

const CARD_COLORS: Record<string, string> = {
  VISA:       '#1A1F71',
  MASTERCARD: '#EB001B',
  AMEX:       '#007BC1',
  DISCOVER:   '#FF6600',
  RUPAY:      '#197A3E',
};

export default function CardsPage() {
  const { user } = useAuthState();
  const [cards,    setCards]    = useState<PaymentCard[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [adding,   setAdding]   = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [toast,    setToast]    = useState('');
  const [form,     setForm]     = useState({ card_type: 'VISA', last_4: '', expiry_mm_yy: '' });

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500); }

  useEffect(() => {
    if (!user) return;
    api.vault.getCards(user.id).then(setCards).catch(() => {}).finally(() => setLoading(false));
  }, [user]);

  const onRealtime = useCallback((msg: RealtimeMessage) => {
    if (msg.type === 'VAULT_UPDATED' && msg.resource === 'cards') {
      setCards(msg.data as PaymentCard[]);
    }
  }, []);
  useRealtime(onRealtime);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!/^\d{4}$/.test(form.last_4)) { showToast('Last 4 digits must be exactly 4 numbers'); return; }
    setSaving(true);
    try {
      const card = await api.vault.addCard(user.id, form);
      setCards((c) => [...c, card]);
      setAdding(false);
      setForm({ card_type: 'VISA', last_4: '', expiry_mm_yy: '' });
      showToast('Card added');
    } catch (err: any) {
      showToast(err.message || 'Failed to add card');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(cardId: string) {
    if (!user) return;
    setRemoving(cardId);
    try {
      await api.vault.removeCard(user.id, cardId);
      setCards((c) => c.filter((card) => card.id !== cardId));
      showToast('Card removed');
    } catch {
      showToast('Failed to remove card');
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="page-container">
      <PageHeader title="Payment Cards" subtitle="PCI-DSS tokenised references" icon="💳" />

      <div className="px-4">
        {loading ? <Spinner /> : (
          <>
            {cards.length === 0 && !adding ? (
              <div className="empty-state">
                <p className="text-[32px] mb-2">💳</p>
                <p className="font-semibold text-[var(--color-text-2)] mb-1">No cards stored</p>
                <p className="text-[13px] text-[var(--color-text-3)] mb-4">Only last 4 digits &amp; network token stored</p>
                <Button variant="primary" onClick={() => setAdding(true)}>Add Card</Button>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-3 mb-4">
                  {cards.map((card) => (
                    <Card key={card.id} className="flex items-center justify-between px-[18px] py-4">
                      <div className="flex items-center gap-3.5">
                        <div
                          className="w-11 h-7 rounded-md flex items-center justify-center shrink-0"
                          style={{ background: CARD_COLORS[card.card_type] ?? '#555' }}
                        >
                          <span className="text-white text-[9px] font-extrabold tracking-[0.05em]">
                            {card.card_type}
                          </span>
                        </div>
                        <div>
                          <p className="text-[14px] font-bold text-[var(--color-text-1)]">
                            ••••&nbsp;{card.last_4}
                          </p>
                          <p className="text-[12px] text-[var(--color-text-3)]">{card.expiry_mm_yy}</p>
                        </div>
                      </div>
                      <Button
                        variant="destructive" size="sm"
                        loading={removing === card.id}
                        onClick={() => handleRemove(card.id)}
                      >
                        Remove
                      </Button>
                    </Card>
                  ))}
                </div>

                {!adding && (
                  <Button variant="secondary" fullWidth onClick={() => setAdding(true)}>
                    + Add Card
                  </Button>
                )}
              </>
            )}

            {adding && (
              <Card className="flex flex-col gap-3.5 mt-4">
                <div>
                  <h3 className="font-bold text-[15px] text-[var(--color-text-1)]">Add a card reference</h3>
                  <p className="text-[12px] text-[var(--color-text-3)] mt-1">
                    Raw card numbers are never stored — only last 4 digits and a network token.
                  </p>
                </div>

                <form onSubmit={handleAdd} className="flex flex-col gap-3.5">
                  <div className="form-group">
                    <Label htmlFor="card_type">Card network</Label>
                    <select
                      id="card_type" value={form.card_type}
                      onChange={(e) => setForm((f) => ({ ...f, card_type: e.target.value }))}
                      className="form-input"
                    >
                      {['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER', 'RUPAY'].map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>

                  <FormField id="last_4" label="Last 4 digits" type="text" inputMode="numeric"
                    maxLength={4} placeholder="1234" value={form.last_4}
                    onChange={(v) => setForm((f) => ({ ...f, last_4: v.replace(/\D/g, '') }))} />

                  <FormField id="expiry_mm_yy" label="Expiry (MM/YY)"
                    placeholder="08/27" maxLength={5} value={form.expiry_mm_yy}
                    onChange={(v) => setForm((f) => ({ ...f, expiry_mm_yy: v }))} />

                  <div className="flex gap-3">
                    <Button type="button" variant="secondary" fullWidth onClick={() => setAdding(false)}>Cancel</Button>
                    <Button type="submit" variant="primary"   fullWidth loading={saving}>Add</Button>
                  </div>
                </form>
              </Card>
            )}
          </>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
