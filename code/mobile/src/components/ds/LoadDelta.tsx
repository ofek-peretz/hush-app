/**
 * LoadDelta — 1:1 from the design `components/data/LoadDelta.jsx`.
 * The signature mark: how the recommended load changed vs last time. Up reads
 * sage, down reads clay, holding reads neutral. The glyph is a small triangle —
 * a precise gauge needle, not an emoji.
 */
// @ts-nocheck

// 

import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { color, font, textScale, directionTone, directionWash } from '@/design/tokens';

type Dir = 'up' | 'down' | 'hold';
type Size = 'sm' | 'md' | 'lg';

const FONT: Record<Size, number> = { sm: textScale.xs, md: textScale.sm, lg: textScale.md };

interface Props {
  value?: number;
  unit?: string;
  direction?: Dir;
  pill?: boolean;
  size?: Size;
  showValue?: boolean;
  /** Localized text for the `hold` state (defaults to the English mark). */
  holdLabel?: string;
  style?: ViewStyle | ViewStyle[];
}

export function LoadDelta({ value = 0, unit = 'kg', direction, pill, size = 'md', showValue = true, holdLabel = 'hold', style }: Props) {
  const dir: Dir = direction || (value > 0 ? 'up' : value < 0 ? 'down' : 'hold');
  // The direction law, from its one home (`design/tokens`): moss up, blue down, cream on a hold.
  // A hold used to be `textMuted` — grey, i.e. a fourth answer to a three-answer question.
  const tint = directionTone(dir);
  const pillBg = directionWash(dir);
  const mag = Math.abs(value);
  const label = dir === 'hold' ? holdLabel : `${dir === 'up' ? '+' : '−'}${mag}${unit ? ' ' + unit : ''}`;
  return (
    <View style={[styles.row, pill && [styles.pill, { backgroundColor: pillBg }], style]}>
      <Glyph dir={dir} tint={tint} />
      {/* "+2.5 kg" is a FIGURE and holds the mono voice; the hold state is a WORD, and a word goes
          in the voice that can actually draw it — the mono face carries no Hebrew at all, so
          "ללא שינוי" was silently falling out to whatever font the OS could find. */}
      {showValue ? (
        <Text style={[styles.text, dir === 'hold' && styles.word, { fontSize: FONT[size], color: tint }]}>{label}</Text>
      ) : null}
    </View>
  );
}

function Glyph({ dir, tint }: { dir: Dir; tint: string }) {
  if (dir === 'hold') return <View style={[styles.hold, { backgroundColor: tint }]} />;
  return (
    <View
      style={[
        styles.tri,
        dir === 'up'
          ? { borderBottomWidth: 6, borderBottomColor: tint }
          : { borderTopWidth: 6, borderTopColor: tint },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pill: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 4 },
  text: { fontFamily: font.monoMedium, fontVariant: ['tabular-nums'], textAlign: 'left' },
  // A MODIFIER, never a style on its own: composed onto `text` (which declares the logical start)
  // to swap the face when the value is a word. Alignment comes from the base.
  word: { fontFamily: font.sansMedium }, // rtl-ok
  tri: { width: 0, height: 0, borderLeftWidth: 4, borderRightWidth: 4, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  hold: { width: 7, height: 2, borderRadius: 1 },
});
