/**
 * RestRing — 1:1 from the design `components/data/RestRing.jsx`.
 * The countdown between sets: a mechanical, LINEAR sweep — never eased, never
 * bouncing. Reads like an instrument winding down. Controlled: pass `remaining`
 * and `total` (seconds); the ring and the mono readout follow. `onStage` inverts.
 *
 * The web design gets its smoothness from `transition: stroke-dashoffset 1s
 * linear`. RN SVG has no CSS transition, so without animation the arc snaps once
 * per second (the "jumpy timer" defect). Here the dash offset is animated with
 * Reanimated over 1s LINEAR between each integer second — and a +15s bump fills
 * the same way (a quick, honest linear fill, not a teleport). A fresh period
 * (remaining ≥ total) snaps to full with no sweep.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedProps, withTiming, Easing } from 'react-native-reanimated';
import { color, font, textScale, signal, stage as stageC } from '@/design/tokens';
import { Legend } from './Legend';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  remaining?: number;
  total?: number;
  size?: number;
  stroke?: number;
  label?: string;
  onStage?: boolean;
  /** Final-seconds state (the 7 s Approach window): the readout turns signal ochre so the
   *  closing countdown reads at a glance — the visual twin of the haptic beats. */
  closing?: boolean;
}

function fmt(sec: number): string {
  const v = Math.max(0, Math.round(sec));
  const m = Math.floor(v / 60);
  const r = v % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function RestRing({ remaining = 60, total = 90, size = 160, stroke = 6, label = 'Rest', onStage, closing }: Props) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const target = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const timeSize = size >= 140 ? textScale['2xl'] : size >= 96 ? textScale.lg : textScale.base;
  const trackColor = onStage ? stageC[2] : color.fillSubtleStrong;

  // Animated fraction of the ring that remains (1 = full, 0 = empty).
  const frac = useSharedValue(target);
  const prevRemaining = useRef(remaining);
  useEffect(() => {
    const delta = remaining - prevRemaining.current;
    prevRemaining.current = remaining;
    if (remaining >= total) {
      // A fresh, full period — snap to full (no sweep up from the previous ring).
      frac.value = target;
    } else if (delta <= -2) {
      // A multi-second DROP in one update = a re-sync after the phone was locked /
      // backgrounded (JS timers suspend). Snap to the true position so reopening the
      // app shows the ring already where it belongs — no visible fast catch-up sweep.
      frac.value = target;
    } else {
      // Normal per-second countdown AND the +15s top-up both fill/drain linearly over
      // a second — the mechanical, "winding" instrument feel from the design.
      frac.value = withTiming(target, { duration: 1000, easing: Easing.linear });
    }
  }, [remaining, total, target, frac]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circ * (1 - frac.value),
  }));

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.svg}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={signal[0]}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circ}
          animatedProps={animatedProps}
        />
      </Svg>
      <View style={styles.readout}>
        <Text style={[styles.time, { fontSize: timeSize }, onStage && { color: stageC.ink0 }, closing && styles.timeClosing]}>{fmt(remaining)}</Text>
        {label ? <Legend tone={onStage ? 'onStage' : 'muted'}>{label}</Legend> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  svg: { transform: [{ rotate: '-90deg' }] },
  readout: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 2 },
  time: {
    fontFamily: font.monoSemibold,
    fontVariant: ['tabular-nums'],
    color: color.textPrimary,
    letterSpacing: -0.5,
  },
  // Final-seconds (Approach window) — the readout inks in signal ochre, both themes.
  timeClosing: { color: signal[0] },
});
