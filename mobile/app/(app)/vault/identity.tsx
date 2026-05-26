import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Modal, FlatList, Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/src/lib/auth';
import { vault, type IdentityDocument } from '@/src/lib/api';
import Button from '@/src/components/Button';
import LoadingSpinner from '@/src/components/LoadingSpinner';
import { Colors } from '@/src/constants/colors';
import { Ionicons } from '@expo/vector-icons';

// ── Document type catalogue ───────────────────────────────────────────────────
const DOC_TYPES: { key: string; label: string; icon: string; placeholder: string }[] = [
  { key: 'aadhaar',         label: 'Aadhaar',         icon: '🪪', placeholder: '1234 5678 9012' },
  { key: 'passport',        label: 'Passport',         icon: '🛂', placeholder: 'A1234567' },
  { key: 'driving_license', label: 'Driving License',  icon: '🚗', placeholder: 'DL-1234567890' },
  { key: 'pan',             label: 'PAN Card',         icon: '📋', placeholder: 'AAAAA9999A' },
  { key: 'voter_id',        label: 'Voter ID',         icon: '🗳️', placeholder: 'ABC1234567' },
  { key: 'national_id',     label: 'National ID',      icon: '🆔', placeholder: '' },
];

const DOC_MAP = Object.fromEntries(DOC_TYPES.map((d) => [d.key, d]));

function maskNumber(n: string) {
  if (!n) return '—';
  const clean = n.replace(/\s/g, '');
  if (clean.length <= 4) return n;
  return '•'.repeat(clean.length - 4) + clean.slice(-4);
}

// ── Type-picker modal ─────────────────────────────────────────────────────────
function TypePicker({
  visible,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selected: string;
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Select ID Type</Text>
          <FlatList
            data={DOC_TYPES}
            keyExtractor={(item) => item.key}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.typeRow, item.key === selected && styles.typeRowSelected]}
                onPress={() => { onSelect(item.key); onClose(); }}
              >
                <Text style={styles.typeIcon}>{item.icon}</Text>
                <Text style={[styles.typeLabel, item.key === selected && styles.typeLabelSelected]}>
                  {item.label}
                </Text>
                {item.key === selected && (
                  <Ionicons name="checkmark" size={18} color={Colors.primary ?? '#196699'} />
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      </Pressable>
    </Modal>
  );
}

// ── Document form ─────────────────────────────────────────────────────────────
function DocForm({
  initial,
  saving,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: { id_type: string; id_number: string };
  saving: boolean;
  submitLabel: string;
  onSubmit: (data: { id_type: string; id_number: string }) => void;
  onCancel: () => void;
}) {
  const [idType,   setIdType]   = useState(initial?.id_type   ?? 'aadhaar');
  const [idNumber, setIdNumber] = useState(initial?.id_number ?? '');
  const [picker,   setPicker]   = useState(false);

  const typeInfo = DOC_MAP[idType] ?? DOC_TYPES[0];

  return (
    <View style={styles.formCard}>
      {/* Type selector */}
      <Text style={styles.fieldLabel}>ID Type</Text>
      <TouchableOpacity style={styles.typeSelector} onPress={() => setPicker(true)}>
        <Text style={styles.typeSelectorText}>{typeInfo.icon}  {typeInfo.label}</Text>
        <Ionicons name="chevron-down" size={16} color={Colors.textMuted ?? '#93A0AB'} />
      </TouchableOpacity>

      {/* Number input */}
      <Text style={[styles.fieldLabel, { marginTop: 12 }]}>ID Number</Text>
      <TextInput
        style={styles.textInput}
        value={idNumber}
        onChangeText={setIdNumber}
        placeholder={typeInfo.placeholder || 'Enter ID number'}
        placeholderTextColor={Colors.textMuted ?? '#93A0AB'}
        autoCapitalize="characters"
        autoCorrect={false}
      />

      {/* Buttons */}
      <View style={styles.formButtons}>
        <Button
          title="Cancel"
          onPress={onCancel}
          style={[styles.formBtn, styles.cancelBtn]}
          textStyle={{ color: Colors.text }}
        />
        <Button
          title={submitLabel}
          onPress={() => idNumber.trim() && onSubmit({ id_type: idType, id_number: idNumber.trim() })}
          loading={saving}
          style={styles.formBtn}
        />
      </View>

      <TypePicker
        visible={picker}
        selected={idType}
        onSelect={(k) => { setIdType(k); setIdNumber(''); }}
        onClose={() => setPicker(false)}
      />
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function IdentityScreen() {
  const { user } = useAuth();
  const router   = useRouter();

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

  useEffect(() => {
    if (!user) return;
    vault.getIdentity(user.id)
      .then((r) => setDocs(r.documents ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  async function handleAdd(data: { id_type: string; id_number: string }) {
    if (!user) return;
    setSaving(true);
    try {
      const result = await vault.addDocument(user.id, data);
      setDocs(result.documents ?? []);
      setAdding(false);
      showToast('Document added');
    } catch {
      showToast('Failed to add');
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(data: { id_type: string; id_number: string }) {
    if (!user || !editId) return;
    setSaving(true);
    try {
      const result = await vault.updateDocument(user.id, editId, data);
      setDocs(result.documents ?? []);
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
      await vault.deleteDocument(user.id, docId);
      setDocs((prev) => prev.filter((d) => d.id !== docId));
      showToast('Document removed');
    } catch {
      showToast('Remove failed');
    }
  }

  if (loading) return <LoadingSpinner message="Loading…" />;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Identity Documents</Text>
      </View>

      {/* Empty state */}
      {docs.length === 0 && !adding && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🪪</Text>
          <Text style={styles.emptyTitle}>No documents yet</Text>
          <Text style={styles.emptySubtitle}>
            Add your Aadhaar, Passport or Driving License.
          </Text>
        </View>
      )}

      {/* Document cards */}
      {docs.map((doc) => {
        const typeInfo = DOC_MAP[doc.id_type] ?? { label: doc.id_type, icon: '🆔' };
        const isEditing = editId === doc.id;

        if (isEditing) {
          return (
            <DocForm
              key={doc.id}
              initial={{ id_type: doc.id_type, id_number: doc.id_number }}
              saving={saving}
              submitLabel="Save"
              onSubmit={handleEdit}
              onCancel={() => setEditId(null)}
            />
          );
        }

        return (
          <View key={doc.id} style={styles.docCard}>
            <Text style={styles.docIcon}>{typeInfo.icon}</Text>
            <View style={styles.docInfo}>
              <Text style={styles.docLabel}>{typeInfo.label}</Text>
              <Text style={styles.docNumber}>{maskNumber(doc.id_number)}</Text>
            </View>
            <TouchableOpacity
              onPress={() => { setAdding(false); setEditId(doc.id); }}
              style={styles.iconBtn}
            >
              <Ionicons name="pencil-outline" size={18} color={Colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleDelete(doc.id)}
              style={styles.iconBtn}
            >
              <Ionicons name="trash-outline" size={18} color="#A32D2D" />
            </TouchableOpacity>
          </View>
        );
      })}

      {/* Add form */}
      {adding && (
        <DocForm
          saving={saving}
          submitLabel="Add"
          onSubmit={handleAdd}
          onCancel={() => setAdding(false)}
        />
      )}

      {/* Add button */}
      {!adding && editId === null && (
        <Button
          title="+ Add Identity Document"
          onPress={() => setAdding(true)}
          style={styles.addBtn}
        />
      )}

      {/* Toast */}
      {!!toast && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const Colors_primary = '#196699';
const Colors_border  = '#DDDEE9';
const Colors_surface = '#FFFFFF';
const Colors_bg      = '#F5F6F8';
const Colors_text2   = '#5A6178';
const Colors_text3   = '#93A0AB';

const styles = StyleSheet.create({
  scroll:     { flex: 1, backgroundColor: Colors.background ?? Colors_bg },
  container:  { padding: 20, paddingTop: 52, paddingBottom: 100 },

  header:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  backBtn: { padding: 4 },
  title:   { color: Colors.text, fontSize: 20, fontWeight: '700' },

  // Empty state
  emptyState:    { alignItems: 'center', paddingVertical: 48 },
  emptyIcon:     { fontSize: 48, marginBottom: 12 },
  emptyTitle:    { color: Colors.text, fontSize: 16, fontWeight: '600', marginBottom: 4 },
  emptySubtitle: { color: Colors_text3, fontSize: 13, textAlign: 'center' },

  // Document cards
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors_surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors_border,
    padding: 14,
    marginBottom: 10,
    gap: 10,
  },
  docIcon:   { fontSize: 26 },
  docInfo:   { flex: 1 },
  docLabel:  { color: Colors.text, fontSize: 14, fontWeight: '600' },
  docNumber: { color: Colors_text3, fontSize: 13, fontFamily: 'monospace', marginTop: 2, letterSpacing: 1 },
  iconBtn:   { padding: 6, borderRadius: 8 },

  // Form
  formCard: {
    backgroundColor: Colors_surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors_border,
    padding: 16,
    marginBottom: 10,
  },
  fieldLabel:  { color: Colors_text2, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  typeSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 48,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: Colors_border,
    borderRadius: 10,
    backgroundColor: Colors_surface,
  },
  typeSelectorText: { color: Colors.text, fontSize: 15 },
  textInput: {
    height: 48,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: Colors_border,
    borderRadius: 10,
    fontSize: 15,
    color: Colors.text,
    backgroundColor: Colors_surface,
  },
  formButtons: { flexDirection: 'row', gap: 10, marginTop: 14 },
  formBtn:     { flex: 1 },
  cancelBtn:   { backgroundColor: Colors_border },

  addBtn: { marginTop: 8 },

  // Type picker modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors_surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '70%',
  },
  modalTitle:        { fontSize: 17, fontWeight: '700', color: Colors.text, marginBottom: 14 },
  typeRow:           { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12, borderRadius: 10, paddingHorizontal: 8 },
  typeRowSelected:   { backgroundColor: '#EAF3FB' },
  typeIcon:          { fontSize: 22 },
  typeLabel:         { flex: 1, fontSize: 15, color: Colors.text },
  typeLabelSelected: { fontWeight: '600', color: Colors_primary },

  // Toast
  toast:     { position: 'absolute', bottom: 100, left: 20, right: 20, backgroundColor: '#1A1A2E', borderRadius: 9999, padding: 12, alignItems: 'center' },
  toastText: { color: '#fff', fontSize: 14 },
});
