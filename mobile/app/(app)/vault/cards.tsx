import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/src/lib/auth';
import { vault, PaymentCard } from '@/src/lib/api';
import Input from '@/src/components/Input';
import Button from '@/src/components/Button';
import Card from '@/src/components/Card';
import LoadingSpinner from '@/src/components/LoadingSpinner';
import { Colors } from '@/src/constants/colors';
import { Ionicons } from '@expo/vector-icons';

const CARD_TYPE_ICONS: Record<string, string> = {
  visa: '💳',
  mastercard: '💳',
  amex: '💳',
  discover: '💳',
};

function CardItem({ card, onDelete }: { card: PaymentCard; onDelete: () => void }) {
  return (
    <View style={cardStyles.row}>
      <Text style={cardStyles.emoji}>{CARD_TYPE_ICONS[card.card_type.toLowerCase()] ?? '💳'}</Text>
      <View style={cardStyles.info}>
        <Text style={cardStyles.label}>
          {card.card_type.toUpperCase()} •••• {card.last_4}
        </Text>
        <Text style={cardStyles.expiry}>Expires {card.expiry_mm_yy}</Text>
      </View>
      <TouchableOpacity
        onPress={() =>
          Alert.alert('Remove Card', `Remove •••• ${card.last_4}?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: onDelete },
          ])
        }
      >
        <Ionicons name="trash-outline" size={18} color={Colors.danger} />
      </TouchableOpacity>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  emoji: { fontSize: 24 },
  info: { flex: 1 },
  label: { color: Colors.text, fontSize: 14, fontWeight: '600' },
  expiry: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
});

export default function CardsScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [cards, setCards] = useState<PaymentCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Add card form state
  const [showForm, setShowForm] = useState(false);
  const [cardType, setCardType] = useState('');
  const [last4, setLast4] = useState('');
  const [expiry, setExpiry] = useState('');
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    const { cards: c } = await vault.getCards(user.id);
    setCards(c);
  }, [user]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load().catch(() => {});
    setRefreshing(false);
  }

  async function handleAdd() {
    if (!user) return;
    if (!cardType.trim() || last4.length !== 4 || !expiry.trim()) {
      setFormError('Card type, last 4 digits, and expiry (MM/YY) are required.');
      return;
    }
    setAdding(true);
    setFormError('');
    try {
      await vault.addCard(user.id, { card_type: cardType.trim(), last_4: last4, expiry_mm_yy: expiry.trim() });
      await load();
      setShowForm(false);
      setCardType('');
      setLast4('');
      setExpiry('');
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Failed to add card.');
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(cardId: string) {
    if (!user) return;
    try {
      await vault.removeCard(user.id, cardId);
      await load();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Delete failed.');
    }
  }

  if (loading) return <LoadingSpinner message="Loading…" />;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Payment Cards</Text>
      </View>

      {/* Card list */}
      {cards.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="card-outline" size={40} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No cards saved yet</Text>
        </View>
      ) : (
        <Card style={styles.cardList}>
          {cards.map((c, idx) => (
            <View key={c.id}>
              <CardItem card={c} onDelete={() => handleDelete(c.id)} />
              {idx < cards.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </Card>
      )}

      {/* Add card section */}
      {showForm ? (
        <Card style={styles.form}>
          <Text style={styles.formTitle}>Add New Card</Text>
          {formError ? <Text style={styles.errorText}>{formError}</Text> : null}
          <Input label="Card Type" value={cardType} onChangeText={setCardType} placeholder="visa / mastercard / amex" autoCapitalize="none" />
          <Input label="Last 4 Digits" value={last4} onChangeText={t => setLast4(t.replace(/\D/g, '').slice(0, 4))} keyboardType="numeric" placeholder="1234" maxLength={4} />
          <Input label="Expiry (MM/YY)" value={expiry} onChangeText={setExpiry} placeholder="09/27" keyboardType="numeric" maxLength={5} />
          <View style={styles.formBtns}>
            <Button title="Cancel" variant="secondary" onPress={() => setShowForm(false)} style={{ flex: 1 }} />
            <Button title="Add Card" onPress={handleAdd} loading={adding} style={{ flex: 1 }} />
          </View>
        </Card>
      ) : (
        <Button
          title="+ Add Card"
          variant="secondary"
          onPress={() => setShowForm(true)}
          style={styles.addBtn}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 20, paddingTop: 52 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  backBtn: { padding: 4 },
  title: { color: Colors.text, fontSize: 20, fontWeight: '700' },
  cardList: { marginBottom: 16 },
  divider: { height: 1, backgroundColor: Colors.border },
  emptyWrap: { alignItems: 'center', gap: 10, paddingVertical: 32 },
  emptyText: { color: Colors.textMuted, fontSize: 14 },
  addBtn: { marginTop: 8 },
  form: { marginTop: 16 },
  formTitle: { color: Colors.text, fontSize: 16, fontWeight: '600', marginBottom: 14 },
  errorText: { color: Colors.danger, fontSize: 13, marginBottom: 10 },
  formBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
});
