/**
 * TextField — a quiet labelled input. Label above (legend voice), value written on a
 * RULE, not inside a box.
 *
 * Founder 2026-07-12: the bordered well read as a generic form field — the one place the
 * instrument looked like everybody else's app. A single baseline under the text is what an
 * instrument does: the value sits ON something, the way a figure sits on a scale. The rule
 * inks up and turns ochre on focus, so the active field is unmistakable without a box, and
 * the type itself steps up to display size — the athlete's name is the largest thing on
 * the screen, because it is the answer.
 */
import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, type TextInputProps, type ViewStyle } from 'react-native';
import { color, control, font, textScale, tracking, trackingPx } from '@/design/tokens';

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
  // The rule: a baseline the value is written on. No box, no fill.
  well: {
    height: control.hLg,
    borderBottomWidth: 1.5,
    borderBottomColor: color.borderControl,
    paddingHorizontal: 2,
    justifyContent: 'center',
  },
  wellFocused: { borderBottomColor: color.accent, borderBottomWidth: 2 },
  input: {
    fontFamily: font.sans,
    fontSize: textScale.lg,
    color: color.textPrimary,
    padding: 0,
    letterSpacing: trackingPx(textScale.lg, tracking.tight),
  },
});
