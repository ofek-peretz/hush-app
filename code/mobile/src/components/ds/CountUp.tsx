/**
 * ════ ✦ THE NUMBER ARRIVES BY COUNTING (design audit, 2026-09-29) ════
 *
 * *"The big number (the tonnes, or the record) rises from 0 in a second, with a haptic at the end —
 * that is what turns a summary into a feeling."* The finish poster opened fully drawn: the biggest
 * figure in the product appeared the way a receipt prints. This counts it up, once, on the app's one
 * curve (`motion.easeStandard`), inside the victory window the audit set (600–900 ms — `dur.land`).
 *
 * ⚠️ THREE THINGS IT MUST NOT DO:
 *
 *   · **Move the layout.** A figure growing from "0.0" to "142.5" would slide a centred hero sideways
 *     every frame. The count is padded to the final string's length with FIGURE SPACES (U+2007, the
 *     width of one digit in a tabular face), so the box is its final size from the first frame.
 *   · **Lie while it counts.** VoiceOver is given the final value (`accessibilityLabel`), never a
 *     number on its way there.
 *   · **Run where motion is not wanted.** Reduce Motion draws the final value, still.
 *
 * ⚠️ IT STARTS ON LAYOUT, NOT ON MOUNT. The count begins the first time the figure is laid out on
 * screen — so a renderer with no layout (the test renderer, a snapshot) reads the true value, and on
 * glass the single frame before the count sits under the hero's own `Arrive` fade, at opacity 0.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Easing, Text, type TextProps } from 'react-native';
import { motion } from '@/design/tokens';
import { useReducedMotion } from '@/platform/reducedMotion';
import { opticalFigure } from './Figure';

const FIGURE_SPACE = ' ';
const EASE = Easing.bezier(...motion.easeStandard);

type Props = Omit<TextProps, 'children'> & {
  /** The final figure, as it will be printed — "62.5", "4.2", "340". Anything not a plain number is drawn as is. */
  value: string | number;
  /** Total time of the count. Default `motion.dur.land` (900 ms). */
  durationMs?: number;
  /** Fired once, when the count lands — where a caller hangs its haptic. */
  onLanded?: () => void;
};

export function CountUp({ value, durationMs = motion.dur.land, onLanded, onLayout, ...rest }: Props) {
  const final = String(value);
  const m = /^(\d+)(?:\.(\d+))?$/.exec(final);
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(final);
  const started = useRef(false);
  const raf = useRef<number | null>(null);
  const landed = useRef(onLanded);
  landed.current = onLanded;

  useEffect(() => () => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
  }, []);
  // A new value (a record read late, a unit switched) is shown as itself — never re-counted mid-screen.
  useEffect(() => {
    if (!raf.current) setShown(final);
  }, [final]);

  const start = useCallback(() => {
    if (started.current || !m || reduced) return;
    started.current = true;
    const target = Number(final);
    const decimals = m[2]?.length ?? 0;
    const t0 = Date.now();
    const step = () => {
      const k = Math.min(1, (Date.now() - t0) / durationMs);
      const now = (target * EASE(k)).toFixed(decimals);
      setShown(k >= 1 ? final : now.padStart(final.length, FIGURE_SPACE));
      if (k < 1) {
        raf.current = requestAnimationFrame(step);
      } else {
        raf.current = null;
        landed.current?.();
      }
    };
    setShown((0).toFixed(decimals).padStart(final.length, FIGURE_SPACE));
    raf.current = requestAnimationFrame(step);
  }, [final, m, reduced, durationMs]);

  return (
    <Text
      {...rest}
      accessibilityLabel={rest.accessibilityLabel ?? final}
      onLayout={(e) => {
        onLayout?.(e);
        start();
      }}
    >
      {opticalFigure(shown)}
    </Text>
  );
}
