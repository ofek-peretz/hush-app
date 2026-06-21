/**
 * TextField — 1:1 from the design `components/forms/TextField.jsx`.
 * A quiet labelled input. Label above (legend voice), value in a bordered well
 * that firms its border on focus. Used in onboarding (name) and anywhere the
 * athlete types free text.
 */
import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, type TextInputProps, type ViewStyle } from 'react-native';
import { color, radius, control, font, textScale } from '@/design/tokens';

interface Props extends Omit<TextInputProps, 'style'> {
  label?: string;
  block?: boolean;
  style?: ViewStyle | ViewStyle[];
}

export function TextField({ label, block, style, onFocus, onBlur, ...input }: Props) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[block && styles.block, style]}>
      {label ? <Text style={styles.label}>{label.toUpperCase()}</Text> : null}
      <View style={[styles.well, focused && styles.wellFocused]}>
        <TextInput
          {...input}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          placeholderTextColor={color.textTertiary}
          selectionColor={color.accent}
          style={styles.input}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { width: '100%' },
  label: {
    fontFamily: font.sansMedium,
    fontSize: textScale['2xs'],
    letterSpacing: 0.99, // ~0.09em of 11px
    textTransform: 'uppercase',
    color: color.textMuted,
    marginBottom: 8,
  },
  well: {
    height: control.h,
    borderWidth: 1,
    borderColor: color.borderControl,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  wellFocused: { borderColor: color.accent, borderWidth: 1.5 },
  input: { fontFamily: font.sans, fontSize: textScale.md, color: color.textPrimary, padding: 0 },
});
