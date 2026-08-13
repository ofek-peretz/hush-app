/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * THE RUN, AS ONE INSTRUMENT — the founder's own design (2026-08-12).
 *
 * ⛔ *"יש לנו מסך שלם בקרדיו. אני באמת לא מבין למה אתה בונה אותו ככה. אני מציע משהו אחר כי אני
 * רואה שזה לא עובד. למה שלא נשים טבעת ענקית במרכז המסך שבתוכה יופיע המספר של המטרים שהמתאמן רץ —
 * זה יהיה במטרים בלבד — וככל שהמטרים גדלים הטבעת מתחילה לסגור את הסיבוב שלה בצבע הירוק."*
 *
 * Three passes at spreading the old layout each failed on the same state: the first minute, where
 * a horizontal band, a `0.00 km` readout and a GPS line are three small things hanging from the
 * top of an 844-point screen. **The band was the problem, not its spacing.** A 334-point rule that
 * fills left to right is a footnote's shape whatever you do with the space around it.
 *
 * ── WHY METRES, AND WHY THAT IS THE WHOLE IDEA ──────────────────────────────────────────────────
 * `0.00 km` cannot move for the first ten seconds of a run — two decimals of a kilometre is a
 * number that sits still while she is running. **Metres move on every stride**, so the figure and
 * the ring say the same true thing at the same rate: *you are going somewhere, right now.*
 *
 * ⚠️ AND THE RING RESETS EVERY KILOMETRE, which is what makes it an instrument rather than a
 * progress bar. A bar that fills once over 10 km is 4% full for the first four minutes; a ring that
 * closes every thousand metres is always visibly moving and always about the next landmark.
 *
 * ⚠️ ON A PRESCRIBED RUN IT SPANS THE WHOLE TARGET INSTEAD, and does not reset — there the
 * landmark IS the distance the coach wrote, and resetting at each kilometre would hide it.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { Legend } from '@/components/ds';
import { font, signal, stage as stageC } from '@/design/tokens';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function DistanceRing({
  metres,
  spanM,
  label,
  unit,
  size = 268,
  stroke = 12,
}: {
  /** Metres travelled INSIDE the current span — resets each kilometre on an open run. */
  metres: number;
  /** 1000 on an open run; the coach's target on a prescribed one. */
  spanM: number;
  /** "KM 3" — which landmark the ring is closing on. */
  label: string;
  /** The metre unit, translated — a WORD, so it never rides the mono face. */
  unit: string;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, spanM > 0 ? metres / spanM : 0));

  const sweep = useSharedValue(frac);
  const pulse = useSharedValue(0);
  const prev = useRef(frac);
  useEffect(() => {
    const dropped = frac < prev.current - 0.5; // the ring just closed and started again
    prev.current = frac;
    if (dropped) {
      /*
       * ⛔ THE KILOMETRE LANDS AND THE RING ANSWERS IT (founder: *"וכאשר מגיעים לקילומטר תופיע
       * אנימציה של השלמת קילומטר"*). It completes the sweep, holds for a beat, then snaps back to
       * the new kilometre's opening — so the closing is SEEN rather than skipped by a reset.
       *
       * ⚠️ The split's TIME is the beat's own (`KmMoment`, 3.4b) and is not duplicated here; this
       * is the instrument acknowledging the landmark, not a second announcement of it.
       */
      sweep.value = withSequence(
        withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 0 }),
        withTiming(frac, { duration: 240, easing: Easing.out(Easing.cubic) }),
      );
      pulse.value = withSequence(withTiming(1, { duration: 220 }), withTiming(0, { duration: 520 }));
      return;
    }
    sweep.value = withTiming(frac, { duration: 900, easing: Easing.linear });
  }, [frac, sweep, pulse]);

  const arc = useAnimatedProps(() => ({ strokeDashoffset: circ * (1 - sweep.value) }));
  const halo = useAnimatedStyle(() => ({ opacity: 0.25 * pulse.value, transform: [{ scale: 1 + 0.06 * pulse.value }] }));

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Animated.View style={[styles.halo, { width: size, height: size, borderRadius: size / 2 }, halo]} />
      <Svg width={size} height={size}>
        {/* The unclosed part — a groove, never an object. */}
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(241,238,229,0.10)" strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={signal[0]}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circ}
          animatedProps={arc}
          /* Twelve o'clock, clockwise — the only orientation a ring is ever read in. */
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>

      <View style={styles.core} pointerEvents="none">
        <Legend size={19} track={0.22} align="center" style={styles.label}>{label}</Legend>
        <View style={styles.row}>
          <Text style={styles.metres}>{Math.floor(metres)}</Text>
          {/* SANS — "מ׳" has no glyph in the mono face (`monoCarriesNoWords`). */}
          <Text style={styles.unit}>{unit}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', backgroundColor: signal[0] },
  core: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 4 },
  label: { color: stageC.ink1 },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  metres: {
    fontFamily: font.monoSemibold,
    fontVariant: ['tabular-nums'],
    fontSize: 86,
    lineHeight: 94,
    letterSpacing: -3,
    color: stageC.ink0,
    includeFontPadding: false,
    textAlign: 'center',
  },
  unit: { fontFamily: font.sans, fontSize: 26, color: stageC.ink1, textAlign: 'left' },
});
