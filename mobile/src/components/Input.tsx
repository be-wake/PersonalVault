import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  TextInputProps,
} from 'react-native';
import { Colors } from '../constants/colors';
import { Ionicons } from '@expo/vector-icons';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  secureToggle?: boolean;
}

export default function Input({ label, error, secureToggle, secureTextEntry, style, ...props }: InputProps) {
  const [hidden, setHidden] = useState(secureTextEntry ?? false);

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row}>
        <TextInput
          style={[styles.input, error ? styles.inputError : undefined, style]}
          placeholderTextColor={Colors.textMuted}
          selectionColor={Colors.accent}
          secureTextEntry={hidden}
          {...props}
        />
        {secureToggle && (
          <TouchableOpacity style={styles.eye} onPress={() => setHidden(h => !h)}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 16 },
  label: { color: Colors.textSecondary, fontSize: 13, marginBottom: 7, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: Colors.card,
    color: Colors.text,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
  },
  inputError: { borderColor: Colors.danger },
  eye: { position: 'absolute', right: 12, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  error: { color: Colors.danger, fontSize: 12, marginTop: 4 },
});
