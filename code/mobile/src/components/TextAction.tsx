/**
 * Secondary / text action (spec §8.1): 16px Medium #A1A1AA, centered, no
 * bg/border/icon/chevron. Minimum 44pt tap target even when text is smaller
 * (UX §8.5) — no decision-bearing control is ever smaller than 44pt to hit.
 */
import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { button, color, press } from '@/design/tokens';

interface Props {
  label: string;
  onPress: () => void;
  /** 'secondary' (default, #A1A1AA) or 'primary' (white) per spec §2.6.3. */
  tone?: 'secondary' | 'primary';
  accessibilityLabel?: string;
}

export function TextAction({ label, onPress, tone = 'secondary', accessibilityLabel }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.tap, { opacity: pressed ? press.opacity : 1 }]}
    >
      <Text style={[styles.label, tone === 'primary' ? styles.primary : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tap: {
    minHeight: button.textAction.minTapHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: button.textAction.color,
    fontSize: button.textAction.fontSize,
    fontWeight: button.textAction.fontWeight,
    textAlign: 'center',
  },
  primary: { color: color.textPrimary },
});
