/**
 * Legend — uppercase, wide-tracked instrument label ("NEXT WORKOUT", "OPTIONAL",
 * "YOUR FIRST WEEK"). Reads as a gauge legend, not a heading.
 *
 * v7 sets every one of these in IBM Plex Mono 500 / 11px / .16em — that is the
 * handoff, one-to-one, and it is what every `<div style="font:500 11px 'IBM Plex
 * Mono'…letter-spacing:.16em">` in the source says. The face is chosen per STRING
 * (`legendFamily`), so a Hebrew legend — which mono cannot draw at all — falls back
 * to Assistant instead of breaking mid-line.
 */
import React from 'react';
import { Text, StyleSheet, type TextStyle } from 'react-native';
import { color, font, textScale, trackingPx, tracking } from '@/design/tokens';
import { monoCanDraw } from '@/design/monoVoice';

interface Props {
  children: string;
  size?: number; // px, default 11 (micro legend)
  tone?: 'muted' | 'faint' | 'onStage' | 'accent';
  /** Letter-spacing in EM. The handoff's legends run .16 by default and .18–.22 when they stamp. */
  track?: number;
  /** 500 by default; 600 where the legend is a stamp (1.5's FREE pill), 400 where it is fine print. */
  weight?: 'regular' | 'medium' | 'semibold';
  align?: TextStyle['textAlign'];
  style?: TextStyle | TextStyle[];
}

export function Legend({
  children,
  size = textScale['2xs'],
  tone = 'muted',
  track = tracking.legend,
  weight = 'medium',
  align = 'left',
  style,
}: Props) {
  const colorFor =
    tone === 'faint'
      ? color.textTertiary
      : tone === 'accent'
        ? color.accentText
        : tone === 'onStage'
          ? color.textTertiary
          : color.textMuted;
  const label = children.toUpperCase();
  const monoFamily = weight === 'semibold' ? font.monoSemibold : weight === 'regular' ? font.mono : font.monoMedium;
  const sansFamily = weight === 'semibold' ? font.sansSemibold : weight === 'regular' ? font.sans : font.sansMedium;
  return (
    <Text
      style={[
        styles.base,
        {
          fontFamily: monoCanDraw(label) ? monoFamily : sansFamily,
          fontSize: size,
          letterSpacing: trackingPx(size, track),
          color: colorFor,
          textAlign: align,
        },
        style,
      ]}
    >
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: { fontFamily: font.sansMedium, textTransform: 'uppercase', textAlign: 'left' },
});
