/**
 * Avatar — 1:1 from the design `components/layout/Avatar.jsx`.
 * Identity, rendered quietly: initials in mono on a neutral surface. No colorful
 * gradients, no photos — a professional tool, not a social profile.
 */
import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { color, radius, font, paper, ink } from '@/design/tokens';

function initials(name?: string): string {
  if (!name) return '';
  const p = String(name).trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

interface Props {
  name?: string;
  size?: number;
  square?: boolean;
  solid?: boolean;
  style?: ViewStyle | ViewStyle[];
}

export function Avatar({ name, size = 40, square = false, solid = false, style }: Props) {
  return (
    <View
      style={[
        styles.base,
        { width: size, height: size, borderRadius: square ? radius.md : radius.full },
        solid && styles.solid,
        style,
      ]}
    >
      <Text style={[styles.text, { fontSize: Math.round(size * 0.36) }, solid && styles.textSolid]}>
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.fillSubtle,
    borderWidth: 1,
    borderColor: color.border,
  },
  solid: { backgroundColor: ink[0], borderColor: ink[0] },
  text: { fontFamily: font.sansMedium, color: color.textSecondary, textTransform: 'uppercase', textAlign: 'left' },
  // White on the ink chip — `paper.lift`, by NAME. It read `paper[0]`, a ladder POSITION that used
  // to hold "white with a hint" and now holds the ground; see Switch's knob for the same story.
  textSolid: { color: paper.lift },
});
