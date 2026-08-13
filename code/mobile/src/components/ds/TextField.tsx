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
// @ts-nocheck

// 

import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, type TextInputProps, type ViewStyle } from 'react-native';
import { line, color, font, textScale, tracking, trackingPx } from '@/design/tokens';

interface Props extends Omit<TextInputProps, 'style'> {
  label?: string;
  block?: boolean;
  style?: ViewStyle | ViewStyle[];
}

export function TextField({ label, block, style, onFocus, onBlur, ...input }: Props) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[block && styles.block, style]}>
      {label ? <Text style={styles.label}>{label.toUpperCase()}</Text> : null}
      <View style={[styles.well, focused && styles.wellFocused]}>
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
  // v7: the field's label is the same mono legend every other legend on the stage is.
  label: {
    fontFamily: font.monoMedium,
    fontSize: textScale['2xs'],
    letterSpacing: trackingPx(textScale['2xs'], tracking.legend),
    textTransform: 'uppercase',
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
  well: {
    borderBottomWidth: 1.5,
    borderBottomColor: line[1],
    paddingBottom: 12,
    justifyContent: 'center',
  },
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
