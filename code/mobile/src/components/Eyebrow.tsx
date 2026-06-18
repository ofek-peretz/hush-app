/**
 * Eyebrow (spec §2.6.4) — uppercase label. textTertiary, wide tracking.
 * Used for "WHAT ARE YOU TRAINING FOR", "COMPLETED THIS WEEK", "FOCUS ON", etc.
 */
import React from 'react';
import { Text, StyleSheet, type TextStyle } from 'react-native';
import { color } from '@/design/tokens';

interface Props {
  label: string;
  size?: number; // 11–13 per use
  trackingPx?: number; // letter-spacing in px (1.5–3 per use)
  align?: TextStyle['textAlign'];
  style?: TextStyle;
}

export function Eyebrow({ label, size = 12, trackingPx = 2, align = 'left', style }: Props) {
  return (
    <Text
      style={[
        styles.base,
        { fontSize: size, letterSpacing: trackingPx, textAlign: align },
        style,
      ]}
    >
      {label.toUpperCase()}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    color: color.textTertiary,
    fontWeight: '400',
    textTransform: 'uppercase',
  },
});
