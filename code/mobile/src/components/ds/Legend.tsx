/**
 * Legend — uppercase, wide-tracked instrument label ("NEXT WORKOUT", "OPTIONAL",
 * "YOUR FIRST WEEK"). Reads as a gauge legend, not a heading.
 *
 * v7 set every one of these in IBM Plex Mono 500 / 11px / .16em — the handoff, one-to-one. ⚠️ THE
 * SIZE IS NO LONGER 11: the founder's type floor (2026-08-12) took the legend's separate, lower
 * floor away with it, so the default is `textScale['2xs']` — **17** — and the weight and tracking are
 * all that survive of that line. The face is chosen per STRING (`monoCanDraw`), so a Hebrew legend —
 * which mono cannot draw at all — falls back to Assistant instead of breaking mid-line.
 */

// 

import React from 'react';
import { Text, StyleSheet, type TextStyle } from 'react-native';
import { color, font, textScale, trackingPx, tracking } from '@/design/tokens';
import { legendVoice } from '@/design/monoVoice';

interface Props {
  children: string;
  size?: number; // px, default `textScale['2xs']` = 17 — the floor, never below it
  /**
   * `muted` / `faint` — in a card, resting in shadow. `onStage` — directly on the black, standing
   * in the light. `accent` — lit moss, a decision made. See the note in the body.
   */
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
  /*
   * ⛔ `onStage` MEANT NOTHING FOR AS LONG AS IT HAS EXISTED.
   *
   * It resolved to `color.textTertiary`, `faint` resolved to `color.textTertiary`, and `muted`
   * resolved to `color.textMuted` — and `tokens.ts` defines `textTertiary` and `textMuted` as the
   * SAME value (`cream[2]`). Three of the four tones were one colour. `Legend` is the most-used
   * component in this app (~195 call sites) and roughly thirty of them reach for a tone that changes
   * nothing, so the "on the stage vs inside a card" distinction the prop was written for has never
   * once been drawn.
   *
   * `onStage` is given the real value instead of being deleted, because deleting it means editing
   * thirty screens and the distinction is genuine: the app's ground is ABSOLUTE BLACK now, and a
   * legend sitting directly on it can afford — and needs — a brighter tier than one sitting inside a
   * cream-wash card, where the ground is 5% lighter and the same ink reads louder. So a legend on
   * the stage stands in the light (`textSecondary`, 8.1:1) and a legend in a card rests in shadow
   * (`textMuted`, 5.4:1). That IS this product's emphasis rule — distance from the ground, never a
   * second hue.
   *
   * ⚠️ `faint` AND `muted` STAY IDENTICAL, AND THAT IS A DECISION RATHER THAN THE SAME BUG. v7 Rev
   * 14 lifted the faint tier to the muted value on purpose: `#7a7260` was sub-AA against the top of
   * the stage gradient, and `tokens.ts` states plainly that there is no legible tier below the muted
   * one on the stage. A third, dimmer legend would be a law violation, not a design.
   */
  const colorFor =
    tone === 'faint'
      ? color.textTertiary
      : tone === 'accent'
        ? color.accentText
        : tone === 'onStage'
          ? color.textSecondary
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
  /* ⛔ ONE QUESTION, ONE ANSWER — and it lives in the design layer now (`legendVoice`).
     The reasoning below is unchanged; what moved is that it is no longer a rule this component
     keeps to itself. The first screen of the app was still tracking Hebrew on 2026-08-26 because
     the fix had been made HERE and written down as prose everywhere else. */
  const { latin: latinFace, letterSpacing } = legendVoice(label, size, track);
  return (
    <Text
      style={[
        styles.base,
        {
          fontFamily: latinFace ? monoFamily : sansFamily,
          fontSize: size,
          letterSpacing,
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
