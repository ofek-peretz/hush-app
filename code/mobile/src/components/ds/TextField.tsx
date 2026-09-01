/**
 * TextField — a quiet labelled input. Label above (legend voice), value written on a
 * RULE, not inside a box.
 *
 * Founder 2026-07-12: the bordered well read as a generic form field — the one place the
 * instrument looked like everybody else's app. A single baseline under the text is what an
 * instrument does: the value sits ON something, the way a figure sits on a scale. The rule
 * inks up and turns moss on focus, so the active field is unmistakable without a box, and
 * the type itself steps up to display size — the athlete's name is the largest thing on
 * the screen, because it is the answer.
 */

// 

import { legendVoice } from '@/design/monoVoice';
import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, type TextInputProps, type ViewStyle } from 'react-native';
import { line, color, font, textScale, tracking, trackingPx } from '@/design/tokens';

interface Props extends Omit<TextInputProps, 'style'> {
  label?: string;
  block?: boolean;
  style?: ViewStyle | ViewStyle[];
  /**
   * ✦ A glyph on the rule, before the value (2026-08-27).
   *
   * The founder's 2026-07-12 ruling above is about the BOX, and it holds: an instrument writes its
   * value on a baseline, not inside a generic well. But the ruling leaves a field with no boundary
   * and no label carrying nothing at all to say what it is — and the library's search is the app's
   * only `TextField` without a `label`, so on that screen a 24-point placeholder under a rule read
   * as a section HEADING, directly beneath an actual heading. The screen's first verb looked like
   * furniture.
   *
   * A magnifier is not the bordered well returning; it is the one mark that says "type here to
   * look for something" in every language. Optional, so every labelled field stays exactly as it
   * was.
   */
  leading?: React.ReactNode;
}

export function TextField({ label, block, style, leading, onFocus, onBlur, ...input }: Props) {
  const [focused, setFocused] = useState(false);
  /* Face AND tracking, from the string — see the note at the label. */
  const labelVoice = legendVoice(label ?? '', textScale['2xs'], tracking.legend);
  return (
    <View style={[block && styles.block, style]}>
      {/*
        ⛔ THE FIELD'S LABEL WAS SETTING HEBREW IN MONO, OPENED (found 2026-08-27).

        The style below said it plainly — *"the same mono legend every other legend on the stage
        is"* — and that is the half that was wrong. Every OTHER legend goes through `Legend`, which
        has asked the STRING which face and which tracking since 2026-08-21, when the founder saw
        `מ ש ק ל` and `ח ז ר ו ת` on the live stage. This one kept the hard-coded half of that
        answer: `monoMedium`, `tracking.legend`, `textTransform: 'uppercase'`, and a `.toUpperCase()`
        here for good measure — applied to whatever label it is handed, which in a Hebrew-first app
        is Hebrew.

        IBM Plex Mono carries no Hebrew, so the label fell to a substitute face and then had a
        legend's tracking driven between letters that carry the word as a connected block. On the
        design system's own text field, so on every labelled input in the product.

        `legendVoice` answers both halves from the string. `.toUpperCase()` goes with it: it is a
        no-op in Hebrew and belongs to the Latin convention that `latin` now gates.
      */}
      {label ? (
        <Text style={[styles.label, labelVoice.latin ? styles.labelLatin : null, { letterSpacing: labelVoice.letterSpacing }]}>
          {labelVoice.latin ? label.toUpperCase() : label}
        </Text>
      ) : null}
      <View style={[styles.well, focused && styles.wellFocused, leading ? styles.wellLeading : null]}>
        {leading ? <View style={styles.leading}>{leading}</View> : null}
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
          // ════ THE KEYBOARD IS PART OF THE SCREEN (founder A.1) ════
          // iOS defaults a keyboard to LIGHT, so the one place the athlete types raised a white
          // slab under an all-dark stage — the single brightest thing in the product, and not
          // ours. This is the ONLY TextInput in the app, so one word fixes it everywhere and
          // cannot drift: there is nowhere else for it to drift to.
          keyboardAppearance="dark"
          placeholderTextColor={color.textTertiary}
          // v7 1.2: the caret is moss — selectionColor carries it on iOS, cursorColor on Android.
          selectionColor={color.accent}
          cursorColor={color.accent}
          style={styles.input}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { width: '100%' },
  /* v7: the field's label is the same legend every other legend on the stage is — which as of
     2026-08-27 means the face and the tracking come from `legendVoice`, not from here. Declaring no
     family inherits the app's sans, the right default for a Hebrew label; `labelLatin` puts the
     mono back only when the string is one mono can actually draw. */
  label: {
    fontSize: textScale['2xs'],
    color: color.textMuted,
    marginBottom: 10,
    textAlign: 'left',
  },
  /*
   * The rule: a baseline the value is written on. No box, no fill — 12px of air above a hairline.
   *
   * ⛔ THE HAIRLINE WAS INK, ON A DARK STAGE, AND SO IT WAS NOT THERE (founder 2026-08-12: *"האפשרות
   * של רישום השם אין סימן בכלל שזה חלון שאפשר לכתוב בו זה פשוט חלל שחור וזהו"*).
   *
   * It read `rgba(27,25,19,0.35)` under a comment saying it "reads as a shadow, not a border" — true
   * of a PAPER card and false of the only surface this control has ever been used on. Dark ink at
   * 35% on `stage[0]` is invisible, so the field was a name-shaped hole in a black screen with no
   * indication anything could be typed there.
   *
   * `line[1]` is the emphasised cream hairline the rest of the stage draws with, and the focused
   * rule is lit moss (`color.accent` resolves to it on the stage). One family, both states visible.
   */
  labelLatin: { fontFamily: font.monoMedium, textTransform: 'uppercase', textAlign: 'left' },
  well: {
    borderBottomWidth: 1.5,
    borderBottomColor: line[1],
    paddingBottom: 12,
    justifyContent: 'center',
  },
  /* Only when there IS a glyph — a bare field keeps the block layout it has always had, so nothing
     that does not ask for a `leading` changes by a pixel. */
  wellLeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  leading: { flexShrink: 0 },
  wellFocused: { borderBottomColor: color.accent },
  input: {
    fontFamily: font.sans,
    fontSize: 30,
    lineHeight: 38,
    color: color.textPrimary,
    padding: 0,
    textAlign: 'left',
  },
});
