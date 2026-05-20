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
            <Text style={styles.eyeText}>{hidden ? '👁' : '🙈'}</Text>
          </TouchableOpacity>
        )}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 14 },
  label: { color: Colors.textSecondary, fontSize: 13, marginBottom: 6, fontWeight: '500' },
  row: { flexDirection: 'row', alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: Colors.card,
    color: Colors.text,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  inputError: { borderColor: Colors.danger },
  eye: { position: 'absolute', right: 12 },
  eyeText: { fontSize: 18 },
  error: { color: Colors.danger, fontSize: 12, marginTop: 4 },
});
