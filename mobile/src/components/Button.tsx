import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Colors } from '../constants/colors';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

const variantStyles: Record<Variant, { container: ViewStyle; text: TextStyle }> = {
  primary: {
    container: { backgroundColor: Colors.accent },
    text: { color: '#fff' },
  },
  secondary: {
    container: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border },
    text: { color: Colors.text },
  },
  danger: {
    container: { backgroundColor: Colors.danger },
    text: { color: '#fff' },
  },
  ghost: {
    container: { backgroundColor: 'transparent' },
    text: { color: Colors.accent },
  },
};

export default function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
  textStyle,
}: ButtonProps) {
  const vs = variantStyles[variant];
  return (
    <TouchableOpacity
      style={[styles.base, vs.container, (disabled || loading) && styles.disabled, style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={vs.text.color as string} size="small" />
      ) : (
        <Text style={[styles.text, vs.text, textStyle]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 14,
    minHeight: 50,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1B3A5C',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  text: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  disabled: {
    opacity: 0.5,
  },
});
