/**
 * Badge — 1:1 from the design `components/core/Badge.jsx`.
 * A small, quiet status marker. Tones map to the semantic system: neutral,
 * outline, signal (ochre), up (sage), down (clay), solid (ink). A badge always
 * carries state — never decoration. `legend` switches to the uppercase voice.
 */
// @ts-nocheck

// 

import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { color, font, textScale, paper, ink, signal, up, down, tracking, trackingPx } from '@/design/tokens';

type Tone = 'neutral' | 'outline' | 'signal' | 'up' | 'down' | 'solid';

interface Props {
  tone?: Tone;
  legend?: boolean;
  children: string;
  style?: ViewStyle | ViewStyle[];
}

const BG: Record<Tone, string> = {
  neutral: color.fillSubtle,
  outline: 'transparent',
  // No tinted grounds. A badge is a chip in a well; what it MEANS is carried by its ink.
  signal: color.fillSubtle,
  up: color.fillSubtle,
  down: color.fillSubtle,
  solid: ink[0],
};
const FG: Record<Tone, string> = {
  neutral: color.textSecondary,
  outline: color.textSecondary,
  signal: color.accentText,
  up: up.stage,
  down: down.stage,
  solid: paper.lift, // white on the ink badge — the VALUE by name, never a ladder position
};

export function Badge({ tone = 'neutral', legend = false, children, style }: Props) {
  return (
    <View
      style={[
        styles.base,
        { backgroundColor: BG[tone] },
        tone === 'outline' && styles.outline,
        style,
      ]}
    >
      <Text
        style={[
          legend ? styles.legendText : styles.text,
          { color: FG[tone] },
          legend && { letterSpacing: trackingPx(textScale['2xs'], tracking.legend) },
        ]}
      >
        {legend ? children.toUpperCase() : children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: 'transparent',
    alignSelf: 'flex-start',
  },
  outline: { borderColor: color.borderControl },
  text: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], letterSpacing: 0.2, textAlign: 'left' },
  legendText: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], textTransform: 'uppercase', textAlign: 'left' },
});
