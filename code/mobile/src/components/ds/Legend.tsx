/**
 * Legend — uppercase, wide-tracked instrument label ("NEXT WORKOUT",
 * "WORKING WEIGHT"). Reads as a gauge legend, not a heading. Mirrors the
 * design's `.hush-metric__label` / legend treatment (Hanken, 11px, 0.09em).
 */
import React from 'react';
import { Text, StyleSheet, type TextStyle } from 'react-native';
import { color, font, textScale, trackingPx, tracking } from '@/design/tokens';

interface Props {
  children: string;
  size?: number; // px, default 11 (micro legend)
  tone?: 'muted' | 'faint' | 'onStage' | 'accent';
  align?: TextStyle['textAlign'];
  style?: TextStyle | TextStyle[];
}

export function Legend({ children, size = textScale['2xs'], tone = 'muted', align = 'left', style }: Props) {
  const colorFor =
    tone === 'faint'
      ? color.textTertiary
      : tone === 'accent'
        ? color.accentText
        : tone === 'onStage'
          ? color.textTertiary
          : color.textMuted;
  return (
    <Text
      style={[
        styles.base,
        { fontSize: size, letterSpacing: trackingPx(size, tracking.legend), color: colorFor, textAlign: align },
        style,
      ]}
    >
      {children.toUpperCase()}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: { fontFamily: font.sansMedium, textTransform: 'uppercase' },
});
