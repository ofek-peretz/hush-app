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
// @ts-nocheck

// 

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
  /** Final-seconds state (the 7 s Approach window): the readout lifts to the strongest value its
   *  world has, so the closing countdown reads at a glance — the visual twin of the haptic beats. */
  closing?: boolean;
  /**
   * The colour of the running arc, when this rest follows a load the engine MOVED (founder
   * 2026-07-29: the ring is blue behind an eased load, on the phone and on the wrist alike). Absent
   * = the ordinary rest, and the arc keeps the accent it has always had.
   */
  arc?: string;
}

function fmt(sec: number): string {
  const v = Math.max(0, Math.round(sec));
  const m = Math.floor(v / 60);
  const r = v % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function RestRing({ remaining = 60, total = 90, size = 160, stroke = 6, label = 'Rest', onStage, closing, arc }: Props) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const target = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  // v7 2.4 draws the big rest ring's readout at 58px. Below that the ring is a small inline
  // instrument (the watch mirror, a compact card) and steps down with its own size.
  const timeSize = size >= 220 ? 58 : size >= 140 ? textScale['2xl'] : size >= 96 ? textScale.lg : textScale.base;
  // The unspent arc is a cream veil, not the raised stage tone — a groove, not an object.
  const trackColor = onStage ? 'rgba(241,238,229,0.12)' : color.fillSubtleStrong;

  // Animated fraction of the ring that remains (1 = full, 0 = empty).
  const frac = useSharedValue(target);
  const prevRemaining = useRef(remaining);
  const prevTotal = useRef(total);
  useEffect(() => {
    const delta = remaining - prevRemaining.current;
    const freshPeriod = total !== prevTotal.current;
    prevRemaining.current = remaining;
    prevTotal.current = total;
    if (freshPeriod) {
      // A NEW rest — snap to its starting position rather than sweeping up from the last one.
      //
      // This used to test `remaining >= total`, which is true of a fresh period but ALSO true of a
      // +15 pressed near the top of a rest — so the one press the athlete most wants to see land
      // was the one that teleported instead of filling. The question is "is this a different
      // period?", and only `total` can answer it.
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
          // THE RING IS MOSS (v7 2.4). It is the one live, running mark on the stage — a decision
          // in progress — and the accent is what the product spends on exactly that. When the rest
          // follows a load the engine moved, the arc takes THAT decision's direction instead: the
          // athlete is looking at the ring, so the ring is where the news is.
          stroke={arc ?? (onStage ? signal[0] : color.textPrimary)}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circ}
          animatedProps={animatedProps}
        />
      </Svg>
      <View style={styles.readout}>
        <Text style={[styles.time, { fontSize: timeSize }, onStage && { color: stageC.ink0 }, closing && (onStage ? styles.timeClosingStage : styles.timeClosing)]}>{fmt(remaining)}</Text>
        {label ? (
          <Legend
            /* ⛔ 16 → 17 (the type floor). It hid from `typeHasAFloor` inside a TERNARY — the law
               matched `size={<number>}` and this is `size={cond ? a : b}`. The law reads every
               literal in the expression now. */
            size={size >= 220 ? 17 : textScale['2xs']}
            track={size >= 220 ? 0.34 : undefined}
            tone={onStage ? 'onStage' : 'muted'}
            style={size >= 220 ? styles.bigLabel : undefined}
          >
            {label}
          </Legend>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  svg: { transform: [{ rotate: '-90deg' }] },
  readout: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 6 },
  // The wide-tracked label sits optically centred: `.34em` of trailing space has to be paid back.
  bigLabel: { color: stageC.ink1, marginStart: 5 },
  time: {
    fontFamily: font.monoMedium,
    fontVariant: ['tabular-nums'],
    color: color.textPrimary,
    letterSpacing: -1.16,
    textAlign: 'left',
  },
  // Final seconds (the Approach window). Urgency used to be the ochre; under READOUT the closing
  // moment is simply the most present thing on its surface, so it lifts. The countdown itself is
  // carried by haptics — this only has to catch the eye.
  // The ring only ever renders on the stage (SessionFlow passes `onStage` unconditionally), so
  // `timeClosingStage` is the live one. The paper variant is kept correct rather than deleted, and
  // it has to go the OTHER way: on paper the base readout is already `textPrimary`, so there is
  // nothing above it to lift to — closing recedes instead.
  timeClosing: { color: color.textSecondary },
  timeClosingStage: { color: stageC.lift },
});
