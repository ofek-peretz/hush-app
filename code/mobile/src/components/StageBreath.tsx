/**
 * THE STAGE BREATHES — the live set's pulse (founder, device QA 2026-08-23).
 *
 * *"אני רוצה שהוא ירגיש חי, שירגיש שהמסך הזה דוחף אותך לבצע את הסט."*
 *
 * A radial cream glow behind the load, breathing on a slow cycle — at the edge of perception, the
 * way a instrument's standby light says "on" without saying anything else. It is the ONE ambient
 * motion in the product, and it lives on the one screen the founder asked to feel alive.
 *
 * ── WHY THIS DOES NOT BREAK THE MOTION LAW ──────────────────────────────────────────────────────
 * "Motion confirms, never performs" governs motion that narrates — flashes, pulses that CLAIM
 * something happened. This claims nothing: it is a state light for "a set is live", constant,
 * subordinate (opacity 5–9%), and it marks a boundary that exists — the difference between a
 * waiting screen and a working one. The founder ordered the screen alive by name; this is the
 * quietest thing that is.
 *
 * ⚠️ REDUCED MOTION: the glow holds at its midpoint, still lit, not breathing. The state light
 * stays; only the animation yields (the same split every Arrive makes).
 * ⚠️ NATIVE DRIVER on opacity, so a busy JS thread mid-workout cannot make the breath stutter —
 * a pulse that hitches reads as the app struggling, the exact opposite of its job.
 */

//

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import { useReducedMotion } from '@/platform/reducedMotion';

interface Props {
  /** Diameter in points. Positioned absolutely behind the parent's centre. */
  size?: number;
}

const LOW = 0.05;
const HIGH = 0.09;
const CYCLE_MS = 3600;

export function StageBreath({ size = 340 }: Props) {
  const reduced = useReducedMotion();
  const breath = useRef(new Animated.Value(LOW)).current;

  useEffect(() => {
    if (reduced) {
      breath.setValue((LOW + HIGH) / 2);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: HIGH, duration: CYCLE_MS / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breath, { toValue: LOW, duration: CYCLE_MS / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breath, reduced]);

  return (
    <Animated.View pointerEvents="none" style={[styles.glow, { width: size, height: size, marginStart: -size / 2, marginTop: -size / 2, opacity: breath }]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id="breath" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#f1eee5" stopOpacity="1" />
            <Stop offset="62%" stopColor="#f1eee5" stopOpacity="0.35" />
            <Stop offset="100%" stopColor="#f1eee5" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx="50" cy="50" r="50" fill="url(#breath)" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  /* Centred on the parent's centre: the parent positions it at 50%/50% and the negative margins
     pull it back by its own radius. The parent must be `position: relative` (RN default). */
  glow: { position: 'absolute', start: '50%', top: '50%' },
});
