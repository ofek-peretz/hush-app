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
// @ts-nocheck

// 

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
  /**
   * ⛔ THE TRACKING FOLLOWS THE FACE, BECAUSE TRACKING IS A LATIN DEVICE.
   *
   * This component already asks the STRING and not the locale — a label mono cannot draw falls
   * back to Assistant. The letter-spacing did not follow, so a Hebrew legend was drawn in the
   * sans face and then opened up by .16em anyway, and the founder saw the result on the live
   * stage: `מ ש ק ל` and `ח ז ר ו ת`, every legend in the app, in every Hebrew screen.
   *
   * Tracked all-caps is a convention of an alphabet that HAS caps and whose letters are built to
   * stand apart. Hebrew has no majuscule and its letters carry the word as a connected block —
   * pushing them apart does not read as "instrument label", it reads as a rendering fault. The
   * `.toUpperCase()` above is already a no-op on Hebrew for the same reason; this closes the
   * other half of the same idea.
   *
   * Same test as the face, deliberately: one question decides both, so they can never disagree.
   */
  const latinFace = monoCanDraw(label);
  return (
    <Text
      style={[
        styles.base,
        {
          fontFamily: latinFace ? monoFamily : sansFamily,
          fontSize: size,
          letterSpacing: latinFace ? trackingPx(size, track) : 0,
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
