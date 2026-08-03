/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ANSWER CHIPS — the commonest answers, said out loud, so a text field is not a blank page.
 *
 * ⛔ FOUNDER'S LAW, 2026-07-17: *"let the control speak."* A field with a placeholder asks her to
 * invent an answer to a question she has not thought about yet. The chips say what KIND of answer
 * this is, which is the thing a placeholder can never do without becoming a lecture.
 *
 * ── ⚠️ THEY FILL THE FIELD, THEY DO NOT REPLACE IT ──────────────────────────────────────────────
 * Tapping writes the chip's words into the field, where she can edit them or type over them. So the
 * common case costs two taps and the unusual one is still a sentence she writes herself — which is
 * the whole reason the intake can stop being a conversation without losing what a conversation was
 * for.
 *
 * A chip is SELECTED only while the field still says exactly what it wrote. The moment she edits a
 * character it is her sentence, not the chip's, and the highlight lets go — anything else would
 * claim she chose something she has since changed.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { color, font, radius, textScale } from '@/design/tokens';

export function AnswerChips({
  options,
  picked,
  onPick,
}: {
  options: string[];
  /** The field's current text — a chip lights only while it matches exactly. */
  picked: string;
  onPick: (value: string) => void;
}) {
  return (
    <View style={styles.wrap}>
      {options.map((o) => {
        const on = picked.trim() === o;
        return (
          <Pressable
            key={o}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o}
            onPress={() => onPick(on ? '' : o)}
            style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.chipPressed]}
          >
            <Text style={[styles.label, on && styles.labelOn]}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Wraps rather than scrolls: every option must be visible at once, or the chips are just a menu
  // she has to discover — which is the placeholder problem again, one layer out.
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.borderControl,
    backgroundColor: color.surface,
  },
  chipOn: { backgroundColor: color.fillSubtle, borderColor: color.borderStrong },
  /*
   * ⛔ A PRESS CHANGES THE SURFACE, IT NEVER DIMS THE CONTENT — founder A.13, and I broke it on the
   * first draft of this file with `opacity: 0.7`. A word at 70% does not read as "pressed", it reads
   * as disabled. The wash goes UNDER the label; the label never fades.
   */
  chipPressed: { backgroundColor: color.fillSubtle, borderColor: color.borderStrong },
  label: {
    fontFamily: font.sans,
    fontSize: textScale.md,
    color: color.textSecondary,
    textAlign: 'left',
  },
  // `textAlign` repeated because omitting it on a text style freezes the run LTR (lint:rtl).
  labelOn: { fontFamily: font.sansSemibold, color: color.textPrimary, textAlign: 'left' },
});
