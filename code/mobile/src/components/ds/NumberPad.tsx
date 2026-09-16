/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE NUMBER PAD — typing a result, in a gym (founder, 2026-08-31)
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 *   > *"בהקלדה… וכל פעם זה יראה כמה משקל עשית לפני וכמה חזרות עשית לפני… ולחיצה על זה תשנה את
 *   > המספר."* — asked for, by name, over the wheel.
 *
 * ── ⛔ WHY THIS DOES NOT VIOLATE THE WHEEL'S OWN RULING ──────────────────────────────────────────
 *
 * The founder's standing ruling of 2026-07-28 is that the engraved wheel is the product's
 * instrument and that it is *"uniform for every wheel in the app"*. That ruling stands and
 * `everyWheelIsTheSameWheel` is untouched — the onboarding rulers, the profile, every place the
 * athlete CHOOSES a value from a range are still the wheel.
 *
 * The set stage stopped being one of those places. A wheel is a chooser: it offers a ladder of
 * legal values and she turns to the one she wants, which is why it enforces the equipment's detent
 * (the *"41.5 kg bench that no plates could build"*). **She is not choosing here; she is reporting.**
 * She has already done the reps and already put the plates on the bar, and the number she needs to
 * get onto the screen is a fact about the past. A ladder is the wrong shape for a fact, and a fast
 * jump (34 → 60) is exactly what a wheel is worst at.
 *
 * ⚠️ AND IT IS WHY THE DETENT GOES WITHOUT LOSS. The detent existed because the wheel was choosing
 * FOR her; typing the per-side weight she just loaded is true by construction — the plates are
 * on the bar, she is reading them off it.
 *
 * ── THE KEYS ────────────────────────────────────────────────────────────────────────────────────
 * 3 × 4, edge to edge of the stage, ~110 × 62 points per key. That is well over twice the 44-point
 * touch floor in both axes, because the hand pressing them is shaking and the phone may be on a
 * bench rather than held. Nothing is small here and nothing is clever: ten digits, a decimal point
 * where a decimal is legal, and a backspace.
 *
 * ⚠️ THE DOT IS BLANK, NOT ABSENT, WHEN IT IS ILLEGAL. Reps have no decimals. Hiding the key would
 * re-flow the grid between two fields that must feel like one instrument, so the cell stays and
 * simply does nothing — the position of `0` never moves under a thumb that has learned it.
 */

//

import React from 'react';
import { I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';
import { font, stage, color } from '@/design/tokens';
import { Icon } from '@/components/Icon';
import { useCopy } from '@/i18n/useCopy';

interface Props {
  /** Append a digit or a '.', or 'del' to remove the last character. */
  onKey: (k: string) => void;
  /** A decimal point is legal (weights, yes; reps, no). */
  decimal?: boolean;
}

const ROWS: string[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', 'del'],
];

export function NumberPad({ onKey, decimal }: Props) {
  const { t } = useCopy();
  return (
    <View style={styles.pad}>
      {ROWS.map((row, r) => (
        <View key={r} style={styles.row}>
          {row.map((k) => {
            const dead = k === '.' && !decimal;
            return (
              <Pressable
                key={k}
                accessibilityRole={dead ? 'none' : 'button'}
                /* ⛔ SPOKEN IN HER LANGUAGE (design review 2026-09-01): VoiceOver read the one
                   error-recovery key on a Hebrew keypad as the English word "delete". */
                accessibilityLabel={k === 'del' ? t('common.delete') : k}
                disabled={dead}
                onPress={() => onKey(k)}
                style={({ pressed }) => [styles.key, pressed && !dead && styles.keyPressed]}
              >
                {/* ⛔ A DEAD KEY IS DRAWN DEAD, NOT ERASED (founder 2026-09-01, treating the
                    review's cosmetic). The grid's stability law stands — `0` never moves — but a
                    BLANK cell in a keypad reads as a rendering hole. The glyph stays, at the
                    disabled ink, saying the one true thing: this key exists and does not apply. */}
                {dead ? (
                  <Text style={[styles.glyph, styles.glyphDead]}>{k}</Text>
                ) : k === 'del' ? (
                  /* ⛔ A BACKSPACE, NOT A CHEVRON (design review 2026-09-01): ‹ is the product's
                     "back/next" glyph, and on a keypad it read as navigation. ⌫ is unmistakable,
                     and it mirrors under RTL because it erases toward the start. */
                  <Icon name="backspace" size={22} color={stage.ink1} strokeWidth={2} />
                ) : (
                  <Text style={styles.glyph}>{k}</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { alignSelf: 'stretch', gap: 6 },
  /*
   * ⛔ A KEYPAD IS NOT PROSE (founder 2026-09-08, mid-workout: "המקלדת מימין לשמאל"). Under
   * `forceRTL` a plain `row` lays 1-2-3 out as 3-2-1 — every phone keypad on earth runs 1-2-3
   * left to right in every language, and a mirrored one is a keypad she has to LOOK at. The same
   * LTR-island lesson as the wheel: RN flips `row`, so the row is un-flipped by hand.
   */
  row: { flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row', gap: 6 },
  /*
   * ⚠️ `flex: 1` PER KEY, NOT A FIXED WIDTH. The stage is 338 points on a 390 phone and 300 on the
   * narrowest one the product supports; a fixed key would leave a ragged edge on one of them, and a
   * ragged keypad reads as a broken one.
   */
  key: {
    flex: 1,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: 'rgba(241,238,229,0.05)',
  },
  keyPressed: { backgroundColor: 'rgba(241,238,229,0.14)' },
  /* Mono, tabular — the same face the figures it is filling are set in, so a key and its result
     are visibly the same numeral. */
  glyph: {
    fontFamily: font.monoMedium,
    fontVariant: ['tabular-nums'],
    fontSize: 30,
    lineHeight: 36,
    color: stage.ink0,
    textAlign: 'center',
  },
  glyphDead: { color: color.textDisabled },
});
