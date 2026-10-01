/**
 * ════ ✦ THE ATHLETE WALKS ONTO THE STAGE (design audit 2026-09-29; the founder's free hand, 2026-09-30) ════
 *
 * *"A transition that continues from the previous screen: the figure from Today's card FLIES to the
 * stage when you press Begin."* Today shows her the day performed by one athlete; Begin cut to a
 * black stage where the same athlete appeared again, from nowhere, at a different size. Two pictures
 * of one person. This makes it one continuous shot: the athlete lifts off Today's card and lands on
 * the stage, in the pose the stage opens on.
 *
 * ── HOW, AND WHY THIS WAY ──────────────────────────────────────────────────────────────────────────
 *
 * The stage is a plain stack push (a 220 ms fade, `Root`), not a native modal, so a layer mounted
 * ABOVE the navigator draws over both screens during the change. That layer (`FigureFlightHost`) draws
 * ONE still of the first lift — the stage tone, the stage's fitted frame, the start of the rep — and
 * moves it from the rectangle the figure occupied on Today to the rectangle it occupies on the stage,
 * both measured on glass (`measureInWindow`), on the app's one curve. The stage holds its own figure
 * back while the flight is in the air (`useFlightHold`) and takes over the instant it lands.
 *
 * ⚠️ WHAT IT WILL NOT DO:
 *   · Run under Reduce Motion — the stage simply appears, as before.
 *   · Wait for anything. A stage that never reports where its figure is (an item with no rig, a slow
 *     first frame) is given 900 ms, and then the traveller fades where it is. The workout never
 *     waits on a flourish.
 *   · Catch a finger — the layer is `pointerEvents="none"` from end to end.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '@/platform/reducedMotion';
import Svg, { G } from 'react-native-svg';
import { exerciseMotion } from '@/motion/registry';
import { buildFrame, stageFrame } from '@/motion/frame';
import { renderPrimitive } from '@/motion/render/MotionFigure';
import type { FigureSex } from '@/motion/types';
import { motion } from '@/design/tokens';

type Rect = { x: number; y: number; width: number; height: number };
type Flight = { id: number; exerciseId: string; figure: FigureSex; from: Rect; to: Rect | null };

let source: View | null = null;
let current: Flight | null = null;
let nextId = 1;
let reduced = false;
const listeners = new Set<(f: Flight | null) => void>();
const emit = () => listeners.forEach((l) => l(current));


const measure = (v: View): Promise<Rect | null> =>
  new Promise((resolve) => {
    try {
      v.measureInWindow((x, y, width, height) => resolve(width > 0 && height > 0 ? { x, y, width, height } : null));
    } catch {
      resolve(null);
    }
  });

/** The drawing's own rectangle inside a box that draws the fitted stage frame (`preserveAspectRatio` meet). */
function contentOf(box: Rect, aspect: number): Rect {
  const w = Math.min(box.width, box.height * aspect);
  const h = w / aspect;
  return { x: box.x + (box.width - w) / 2, y: box.y + (box.height - h) / 2, width: w, height: h };
}

/** Today's hero registers the view it draws the athlete in. */
export function registerFlightSource(v: View | null): void {
  source = v;
}

/** Begin was pressed: lift the athlete off Today's card. Resolves at once; the stage opens in parallel. */
export async function launchFigureFlight(exerciseId: string | null | undefined, figure: FigureSex): Promise<void> {
  if (reduced || !exerciseId || !exerciseMotion(exerciseId) || !source || listeners.size === 0) return;
  const from = await measure(source);
  if (!from) return;
  current = { id: nextId++, exerciseId, figure, from, to: null };
  emit();
}

/** The stage reports where its athlete stands. */
export function landFigureFlight(exerciseId: string | null | undefined, to: Rect): void {
  if (!current || current.to || current.exerciseId !== exerciseId) return;
  current = { ...current, to };
  emit();
}

/** True while a flight bound for this lift is in the air — the stage keeps its own figure back until it lands. */
export function useFlightHold(exerciseId: string | null | undefined): boolean {
  const [f, setF] = useState<Flight | null>(current);
  useEffect(() => {
    const l = (x: Flight | null) => setF(x);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return !!f && f.exerciseId === exerciseId;
}

/** The stage's side: measure the athlete's box when it is laid out, and report it. */
export function measureFlightTarget(v: View | null, exerciseId: string | null | undefined): void {
  if (!v || !current || current.to) return;
  void measure(v).then((r) => r && landFigureFlight(exerciseId, r));
}

const FLY_MS = 460;
const WAIT_MS = 900;

/** Mounted once, above the navigator. */
export function FigureFlightHost() {
  const [flight, setFlight] = useState<Flight | null>(null);
  /* The app's own Reduce Motion reading, kept where `launchFigureFlight` can see it — the host is
     mounted for the app's whole life, so the flag is always current. Under it nothing flies. */
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    reduced = reduceMotion;
  }, [reduceMotion]);
  const t = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const l = (f: Flight | null) => setFlight(f);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const end = (id: number) => {
    Animated.timing(fade, { toValue: 0, duration: motion.dur[2], useNativeDriver: true }).start(() => {
      if (current?.id === id) {
        current = null;
        emit();
      }
    });
  };

  // Lift-off: appear over Today's figure; give the stage its window to report.
  useEffect(() => {
    if (!flight || flight.to) return;
    t.setValue(0);
    fade.setValue(1);
    const id = flight.id;
    const timer = setTimeout(() => current?.id === id && !current.to && end(id), WAIT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight?.id]);

  // The stage answered: fly, then hand over.
  useEffect(() => {
    if (!flight?.to) return;
    const id = flight.id;
    Animated.timing(t, { toValue: 1, duration: FLY_MS, easing: Easing.bezier(...motion.easeStandard), useNativeDriver: true }).start(() => {
      // The stage's own figure appears under the traveller the instant it lands; a short fade hides the seam.
      end(id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight?.to]);

  if (!flight) return null;
  const rig = exerciseMotion(flight.exerciseId);
  if (!rig) return null;
  const box = stageFrame(rig);
  const aspect = box.w / box.h;
  const a = contentOf(flight.from, aspect);
  const b = flight.to ? contentOf(flight.to, aspect) : a;
  // Drawn at the DESTINATION size and scaled down to the source — a still sharpens as it lands.
  const s0 = a.width / b.width;
  const cx0 = a.x + a.width / 2;
  const cy0 = a.y + a.height / 2;
  const cx1 = b.x + b.width / 2;
  const cy1 = b.y + b.height / 2;
  const prims = buildFrame(rig, 0, flight.figure);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View
        style={{
          position: 'absolute',
          top: cy1 - b.height / 2,
          // rtl-ok: a WINDOW coordinate — `measureInWindow` counts from the physical left in both directions
          left: cx1 - b.width / 2,
          width: b.width,
          height: b.height,
          opacity: fade,
          transform: [
            { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [cx0 - cx1, 0] }) },
            { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [cy0 - cy1, 0] }) },
            { scale: t.interpolate({ inputRange: [0, 1], outputRange: [s0, 1] }) },
          ],
        }}
      >
        <Svg width="100%" height="100%" viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}>
          <G>{prims.map((p, i) => renderPrimitive(p, i, 'stage'))}</G>
        </Svg>
      </Animated.View>
    </View>
  );
}
