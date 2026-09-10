/**
 * Badge — 1:1 from the design `components/core/Badge.jsx`.
 * A small, quiet status marker. A badge always carries state — never decoration.
 * `legend` switches to the uppercase voice.
 *
 * ⚠️ THE TONE LIST IN THIS HEADER WAS THREE YEARS OUT OF DATE AND ONE OF ITS COLOURS DID NOT EXIST.
 * It read "signal (ochre), up (sage), down (clay)". There is no ochre in this palette — `signal`
 * resolved to `color.accentText`, which is lit moss, the SAME PIXEL as `up.stage` (#a9c49f) over the
 * same ground. `ProfileSheet` draws an active membership `up` and a trial `signal`, so a paying
 * member's badge and a trial badge were the same object with a different word in it. And `down` went
 * from clay to blue on 2026-07-28 (a fall is not a failure), which this header never heard about.
 *
 * The tones as they now actually are:
 *   neutral · outline  — secondary cream, the quiet state
 *   signal             — PRIMARY CREAM. "Look at this", said with light rather than hue, which is
 *                        this product's whole emphasis rule. It is the one tone that is louder than
 *                        neutral without claiming a direction.
 *   up                 — lit moss, a load that rose
 *   down               — lit blue, a load that eased
 *   solid              — white on ink
 */

// 

import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { color, font, textScale, paper, ink, signal, up, down, tracking, trackingPx } from '@/design/tokens';
import { legendVoice } from '@/design/monoVoice';

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
  /*
   * ⛔ `signal` IS CREAM, NOT MOSS — a trial is not a raise.
   *
   * It was `color.accentText` = `signal[0]` = `#a9c49f`, and `up` below is `up.stage` = `#a9c49f`.
   * The same value twice, so the TRIAL pill and the ACTIVE pill on ProfileSheet were identical to
   * the eye and told apart only by reading the word inside them — which is exactly the job a status
   * chip exists to do without being read.
   *
   * The tone is kept rather than deleted (its callers live in screens this change does not own) and
   * given the neutral it had already become in meaning: full cream, the brightest tier on the stage.
   * Emphasis here is distance from the ground, not hue — so "notable" is said with light, and moss
   * stays what it is everywhere else in the app: a load that went UP.
   */
  signal: color.textPrimary,
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
          /* ⛔ THE TRACKING FOLLOWS THE STRING (2026-08-27). A `legend` badge upper-cases its
             children and opened them by .16em unconditionally — so a Hebrew badge read as separated
             letters, which is the fault `Legend` has a docblock about and `legendVoice` exists to
             make impossible. Same one question for the face and the spacing. */
          legend ? { letterSpacing: legendVoice(children, textScale['2xs'], tracking.legend).letterSpacing } : null,
        ]}
      >
        {legend ? children.toUpperCase() : children}
      </Text>
    </View>
  );
}

/**
 * ⛔ THE CHIP SHEARED ITS OWN CAPS, AND THE BOX WAS THE PART NOBODY MOVED.
 *
 * `height: 22` is the geometry from when `textScale['2xs']` was 11px. That token is **17** now, and
 * 17pt Assistant needs roughly 23px of line box — so the ACTIVE / TRIAL / EXPIRED pill on Profile
 * and on the Progress report was drawing 17pt type into a 22px box and cutting the tops off its own
 * capitals. A fixed height is a promise about type made in a place that cannot see the type.
 *
 * ⚠️ `noGlyphIsClipped` COULD NOT SEE IT EITHER. That law compares `lineHeight` to `fontSize` inside
 * ONE style object; this clip was a parent's fixed `height` around a child's `fontSize`, two objects
 * apart. The law now carries a named assertion for this file — see `__tests__/laws/noGlyphIsClipped`.
 *
 * So: `minHeight` instead of `height` (the box follows the type, never the other way round), the
 * padding that makes 23 + 6 = 29, and a stated `lineHeight` so the line box is a decision rather
 * than a guess about a font file.
 */
const LINE = 23; // the line box 17pt Assistant actually occupies

const styles = StyleSheet.create({
  base: {
    minHeight: LINE + 6,
    paddingVertical: 3,
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
  /* ⚠️ THE 0.2 OF TRACKING IS GONE (2026-08-26). A badge holds a translated word, and a fifth of
     a point buys nothing in Latin while putting this slot in the class that draws `מ ס ו מ ן`. */
  text: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], lineHeight: LINE, textAlign: 'left' },
  legendText: { fontFamily: font.sansMedium, fontSize: textScale['2xs'], lineHeight: LINE, textTransform: 'uppercase', textAlign: 'left' },
});
