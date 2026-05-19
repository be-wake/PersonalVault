'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthState } from '@/lib/auth';
import { api, PaymentCard } from '@/lib/api';
import Button from '@/components/Button';

export default function CardsPage() {
  const { user } = useAuthState();
  const router = useRouter();
  const [cards, setCards] = useState<PaymentCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [form, setForm] = useState({ card_type: 'VISA', last_4: '', expiry_mm_yy: '' });

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  useEffect(() => {
    if (!user) return;
    api.vault
      .getCards(user.id)
      .then(setCards)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (form.last_4.length !== 4 || !/^\d{4}$/.test(form.last_4)) {
      showToast('Last 4 digits must be exactly 4 numbers');
      return;
    }
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

  const CARD_COLORS: Record<string, string> = {
    VISA: '#1A1F71',
    MASTERCARD: '#EB001B',
    AMEX: '#007BC1',
    DISCOVER: '#FF6600',
    RUPAY: '#197A3E',
  };

  return (
    <div className="page-container">
      <div style={{ background: 'var(--color-navy)', padding: '52px 24px 24px', marginBottom: 24 }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 14, marginBottom: 12 }}
        >
          ← Back
        </button>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 28 }}>💳</span>
            <div>
              <h1 style={{ color: 'white', fontSize: 20, fontWeight: 700 }}>Payment Cards</h1>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>PCI-DSS tokenised references</p>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 16px' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" /></div>
        ) : (
          <>
            {cards.length === 0 && !adding ? (
              <div className="empty-state">
                <p style={{ fontSize: 32, marginBottom: 8 }}>💳</p>
                <p style={{ fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 4 }}>No cards stored</p>
                <p style={{ fontSize: 13, color: 'var(--color-text-3)', marginBottom: 16 }}>Only last 4 digits & network token stored</p>
                <Button variant="primary" onClick={() => setAdding(true)}>Add Card</Button>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                  {cards.map((card) => (
                    <div
                      key={card.id}
                      className="card"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div
                          style={{
                            width: 44,
                            height: 28,
                            borderRadius: 6,
                            background: CARD_COLORS[card.card_type] ?? '#555',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <span style={{ color: 'white', fontSize: 9, fontWeight: 800, letterSpacing: '0.05em' }}>
                            {card.card_type}
                          </span>
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-1)' }}>
                            ••••&nbsp;{card.last_4}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}>
                            {card.expiry_mm_yy}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="destructive"
                        loading={removing === card.id}
                        onClick={() => handleRemove(card.id)}
                        style={{ fontSize: 12, padding: '6px 12px', height: 'auto' }}
                      >
                        Remove
                      </Button>
                    </div>
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
              <form onSubmit={handleAdd} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
                <h3 style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text-1)' }}>Add a card reference</h3>
                <p style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: -8 }}>
                  Raw card numbers are never stored — only last 4 digits and a network token.
                </p>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 6 }}>
                    Card network
                  </label>
                  <select
                    value={form.card_type}
                    onChange={(e) => setForm((f) => ({ ...f, card_type: e.target.value }))}
                    className="form-input"
                  >
                    {['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER', 'RUPAY'].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 6 }}>
                    Last 4 digits
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="1234"
                    value={form.last_4}
                    onChange={(e) => setForm((f) => ({ ...f, last_4: e.target.value.replace(/\D/g, '') }))}
                    className="form-input"
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-2)', marginBottom: 6 }}>
                    Expiry (MM/YY)
                  </label>
                  <input
                    type="text"
                    placeholder="08/27"
                    maxLength={5}
                    value={form.expiry_mm_yy}
                    onChange={(e) => setForm((f) => ({ ...f, expiry_mm_yy: e.target.value }))}
                    className="form-input"
                    required
                  />
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <Button type="button" variant="secondary" fullWidth onClick={() => setAdding(false)}>Cancel</Button>
                  <Button type="submit" variant="primary" fullWidth loading={saving}>Add</Button>
                </div>
              </form>
            )}
          </>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
