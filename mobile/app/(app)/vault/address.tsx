import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Modal, FlatList, Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/src/lib/auth';
import { vault, type AddressData } from '@/src/lib/api';
import Button from '@/src/components/Button';
import LoadingSpinner from '@/src/components/LoadingSpinner';
import { Colors } from '@/src/constants/colors';
import { Ionicons } from '@expo/vector-icons';

// ── Label catalogue ───────────────────────────────────────────────────────────
const ADDR_LABELS = [
  { key: 'home',   name: 'Home',   icon: '🏠' },
  { key: 'work',   name: 'Work',   icon: '🏢' },
  { key: 'family', name: 'Family', icon: '👨‍👩‍👧' },
  { key: 'other',  name: 'Other',  icon: '📍' },
] as const;

const LABEL_MAP = Object.fromEntries(ADDR_LABELS.map((l) => [l.key, l])) as Record<string, typeof ADDR_LABELS[number]>;

type AddrForm = {
  label: string;
  line1: string; line2: string;
  city: string;  state: string;
  postal: string; country: string;
};

const BLANK: AddrForm = { label: 'home', line1: '', line2: '', city: '', state: '', postal: '', country: '' };

function oneLiner(a: AddressData) {
  return [a.city, a.state, a.country].filter(Boolean).join(', ') || a.line1 || '';
}

// ── Label picker modal ────────────────────────────────────────────────────────
function LabelPicker({
  visible, selected, onSelect, onClose,
}: { visible: boolean; selected: string; onSelect: (k: string) => void; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        <View style={s.sheet}>
          <Text style={s.sheetTitle}>Address Type</Text>
          <FlatList
            data={ADDR_LABELS}
            keyExtractor={(i) => i.key}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[s.pickerRow, item.key === selected && s.pickerRowSel]}
                onPress={() => { onSelect(item.key); onClose(); }}
              >
                <Text style={s.pickerIcon}>{item.icon}</Text>
                <Text style={[s.pickerName, item.key === selected && s.pickerNameSel]}>{item.name}</Text>
                {item.key === selected && <Ionicons name="checkmark" size={18} color="#196699" />}
              </TouchableOpacity>
            )}
          />
        </View>
      </Pressable>
    </Modal>
  );
}

// ── Address form ──────────────────────────────────────────────────────────────
function AddrFormView({
  initial = BLANK, saving, submitLabel, onSubmit, onCancel,
}: { initial?: AddrForm; saving: boolean; submitLabel: string; onSubmit: (f: AddrForm) => void; onCancel: () => void }) {
  const [form,   setForm]   = useState<AddrForm>(initial);
  const [picker, setPicker] = useState(false);
  const set = (k: keyof AddrForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const lbl = LABEL_MAP[form.label] ?? ADDR_LABELS[0];

  return (
    <View style={s.formCard}>
      <Text style={s.fieldLabel}>Type</Text>
      <TouchableOpacity style={s.selector} onPress={() => setPicker(true)}>
        <Text style={s.selectorText}>{lbl.icon}  {lbl.name}</Text>
        <Ionicons name="chevron-down" size={16} color="#93A0AB" />
      </TouchableOpacity>

      {([
        ['line1',   'Address Line 1', 'Street / House No.'],
        ['line2',   'Address Line 2', 'Apt, Floor (optional)'],
        ['city',    'City',           'Mumbai'],
        ['state',   'State',          'Maharashtra'],
        ['postal',  'Postal Code',    '400001'],
        ['country', 'Country',        'IN'],
      ] as [keyof AddrForm, string, string][]).map(([key, label, placeholder]) => (
        <View key={key}>
          <Text style={[s.fieldLabel, { marginTop: 10 }]}>{label}</Text>
          <TextInput
            style={s.input}
            value={form[key]}
            onChangeText={set(key)}
            placeholder={placeholder}
            placeholderTextColor="#93A0AB"
            autoCapitalize={key === 'country' ? 'characters' : 'words'}
            keyboardType={key === 'postal' ? 'numeric' : 'default'}
          />
        </View>
      ))}

      <View style={s.formBtns}>
        <Button title="Cancel" onPress={onCancel} style={[s.btn, s.cancelBtn]} textStyle={{ color: Colors.text }} />
        <Button title={submitLabel} onPress={() => onSubmit(form)} loading={saving} style={s.btn} />
      </View>

      <LabelPicker visible={picker} selected={form.label} onSelect={(k) => setForm((f) => ({ ...f, label: k }))} onClose={() => setPicker(false)} />
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function AddressScreen() {
  const { user } = useAuth();
  const router   = useRouter();

  const [addresses, setAddresses] = useState<AddressData[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [adding,    setAdding]    = useState(false);
  const [editId,    setEditId]    = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [toast,     setToast]     = useState('');

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500); }

  useEffect(() => {
    if (!user) return;
    vault.getAddresses(user.id)
      .then((r) => setAddresses(r.addresses ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  async function handleAdd(form: AddrForm) {
    if (!user) return;
    setSaving(true);
    try {
      const r = await vault.addAddress(user.id, form);
      setAddresses(r.addresses ?? []);
      setAdding(false);
      showToast('Address added');
    } catch { showToast('Failed to add'); }
    finally { setSaving(false); }
  }

  async function handleEdit(form: AddrForm) {
    if (!user || !editId) return;
    setSaving(true);
    try {
      const r = await vault.updateAddress(user.id, editId, form);
      setAddresses(r.addresses ?? []);
      setEditId(null);
      showToast('Address updated');
    } catch { showToast('Update failed'); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!user) return;
    try {
      await vault.deleteAddress(user.id, id);
      setAddresses((prev) => prev.filter((a) => a.id !== id));
      showToast('Address removed');
    } catch { showToast('Remove failed'); }
  }

  async function handleSetPrimary(id: string) {
    if (!user) return;
    try {
      const r = await vault.setPrimaryAddress(user.id, id);
      setAddresses(r.addresses ?? []);
      showToast('Primary address updated');
    } catch { showToast('Failed'); }
  }

  if (loading) return <LoadingSpinner message="Loading…" />;

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={s.title}>Addresses</Text>
      </View>

      {/* Empty state */}
      {addresses.length === 0 && !adding && (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>🏠</Text>
          <Text style={s.emptyTitle}>No addresses yet</Text>
          <Text style={s.emptySub}>Add your Home, Work or other addresses.</Text>
        </View>
      )}

      {/* Address cards */}
      {addresses.map((addr) => {
        const lbl = LABEL_MAP[addr.type ?? addr.label ?? ''] ?? { name: addr.type ?? 'Other', icon: '📍' };
        if (editId === addr.id) {
          return (
            <AddrFormView
              key={addr.id}
              initial={{ label: addr.type ?? addr.label ?? 'home', line1: addr.line1 ?? '', line2: addr.line2 ?? '', city: addr.city ?? '', state: addr.state ?? '', postal: addr.postal ?? '', country: addr.country ?? '' }}
              saving={saving}
              submitLabel="Save"
              onSubmit={handleEdit}
              onCancel={() => setEditId(null)}
            />
          );
        }
        return (
          <View key={addr.id} style={s.card}>
            {/* Top row: icon + label + primary badge + edit/delete */}
            <View style={s.cardTop}>
              <Text style={s.cardIcon}>{lbl.icon}</Text>
              <Text style={s.cardLabel}>{lbl.name}</Text>
              {addr.is_current && (
                <View style={s.primaryBadge}>
                  <Text style={s.primaryBadgeText}>PRIMARY</Text>
                </View>
              )}
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={() => { setAdding(false); setEditId(addr.id!); }} style={s.iconBtn}>
                <Ionicons name="pencil-outline" size={17} color={Colors.text} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(addr.id!)} style={s.iconBtn}>
                <Ionicons name="trash-outline" size={17} color="#A32D2D" />
              </TouchableOpacity>
            </View>

            {/* Address lines */}
            <Text style={s.cardAddr} numberOfLines={2}>
              {[addr.line1, addr.line2].filter(Boolean).join(', ')}
            </Text>
            <Text style={s.cardCity}>{oneLiner(addr)}</Text>

            {/* Set as primary */}
            {!addr.is_current && (
              <TouchableOpacity onPress={() => handleSetPrimary(addr.id!)} style={s.setPrimaryBtn}>
                <Ionicons name="star-outline" size={13} color="#196699" />
                <Text style={s.setPrimaryText}>Set as Primary</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}

      {/* Add form */}
      {adding && (
        <AddrFormView saving={saving} submitLabel="Add" onSubmit={handleAdd} onCancel={() => setAdding(false)} />
      )}

      {/* Add button */}
      {!adding && editId === null && (
        <Button title="+ Add Address" onPress={() => setAdding(true)} style={s.addBtn} />
      )}

      {/* Toast */}
      {!!toast && (
        <View style={s.toast}>
          <Text style={s.toastText}>{toast}</Text>
        </View>
      )}
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const SURFACE = '#FFFFFF';
const BORDER  = '#DDDEE9';
const TEXT2   = '#5A6178';
const TEXT3   = '#93A0AB';
const TEAL    = '#0F6A5B';
const TEAL_LT = '#E0F4EF';
const PRIMARY = '#196699';

const s = StyleSheet.create({
  scroll:     { flex: 1, backgroundColor: Colors.background ?? '#F5F6F8' },
  container:  { padding: 20, paddingTop: 52, paddingBottom: 100 },
  header:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  backBtn:    { padding: 4 },
  title:      { color: Colors.text, fontSize: 20, fontWeight: '700' },

  empty:      { alignItems: 'center', paddingVertical: 48 },
  emptyIcon:  { fontSize: 48, marginBottom: 12 },
  emptyTitle: { color: Colors.text, fontSize: 16, fontWeight: '600', marginBottom: 4 },
  emptySub:   { color: TEXT3, fontSize: 13, textAlign: 'center' },

  // Address card
  card:          { backgroundColor: SURFACE, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 14, marginBottom: 10 },
  cardTop:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  cardIcon:      { fontSize: 20 },
  cardLabel:     { fontSize: 14, fontWeight: '700', color: Colors.text },
  primaryBadge:  { backgroundColor: TEAL_LT, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  primaryBadgeText: { fontSize: 9, fontWeight: '700', color: TEAL, letterSpacing: 0.5, textTransform: 'uppercase' },
  iconBtn:       { padding: 5, borderRadius: 8 },
  cardAddr:      { fontSize: 13, color: Colors.text, marginLeft: 28, lineHeight: 18 },
  cardCity:      { fontSize: 12, color: TEXT2, marginLeft: 28, marginTop: 1 },
  setPrimaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, marginLeft: 28 },
  setPrimaryText:{ fontSize: 12, fontWeight: '600', color: PRIMARY },

  // Form card
  formCard:  { backgroundColor: SURFACE, borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 16, marginBottom: 10 },
  fieldLabel:{ color: TEXT2, fontSize: 12, fontWeight: '600', marginBottom: 5 },
  selector:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 48, paddingHorizontal: 14, borderWidth: 1.5, borderColor: BORDER, borderRadius: 10, backgroundColor: SURFACE },
  selectorText: { color: Colors.text, fontSize: 15 },
  input:     { height: 48, paddingHorizontal: 14, borderWidth: 1.5, borderColor: BORDER, borderRadius: 10, fontSize: 15, color: Colors.text, backgroundColor: SURFACE },
  formBtns:  { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn:       { flex: 1 },
  cancelBtn: { backgroundColor: BORDER },

  addBtn: { marginTop: 8 },

  // Label picker modal
  overlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet:         { backgroundColor: SURFACE, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '60%' },
  sheetTitle:    { fontSize: 17, fontWeight: '700', color: Colors.text, marginBottom: 14 },
  pickerRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12, borderRadius: 10, paddingHorizontal: 8 },
  pickerRowSel:  { backgroundColor: '#EAF3FB' },
  pickerIcon:    { fontSize: 22 },
  pickerName:    { flex: 1, fontSize: 15, color: Colors.text },
  pickerNameSel: { fontWeight: '600', color: PRIMARY },

  toast:     { position: 'absolute', bottom: 100, left: 20, right: 20, backgroundColor: '#1A1A2E', borderRadius: 9999, padding: 12, alignItems: 'center' },
  toastText: { color: '#fff', fontSize: 14 },
});
