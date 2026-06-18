/**
 * Rest timer (spec §1.14/§1.15, §8.2/§8.3). The timer is the hero during rest.
 * Display 72px Semibold TABULAR (any horizontal digit shift is a defect).
 * At 00:00: Light Impact haptic + 120ms pulse, then the flow advances.
 *
 * Reduced Motion: pulse suppressed, haptic STILL fires (UX §8.2).
 *
 * TIME SOURCE (must match the Live Activity / Watch): the countdown is anchored to
 * an ABSOLUTE end instant on the wall clock, NOT a per-second decrement. iOS
 * suspends JS timers while the app is backgrounded/locked, so a decrementing
 * counter would freeze and resume mid-count — desyncing from the lock-screen Live
 * Activity, which counts on `restEndsAt`. Here we recompute remaining from
 * `endAt - Date.now()` each tick AND on every return to foreground, so the elapsed
 * wall-clock time is always reflected. An explicit Pause (running=false) freezes the
 * value and re-anchors the end on resume (spec §7.2 — the timer does not run while paused).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, StyleSheet, Animated, AccessibilityInfo, AppState } from 'react-native';
import { a11y, color, type as typo } from '@/design/tokens';
import { motion } from '@/design/motion';
import { timerComplete } from '@/platform/haptics';

interface Props {
  seconds: number;
  running: boolean;
  onElapsed: () => void;
}

export function RestTimer({ seconds, running, onElapsed }: Props) {
  const [remaining, setRemaining] = useState(seconds);
  const remainingRef = useRef(seconds); // last known remaining (held while paused)
  const endAtRef = useRef<number | null>(null); // absolute end (ms epoch) while running
  const scale = useRef(new Animated.Value(1)).current;
  const firedRef = useRef(false);

  /** Recompute remaining from the absolute end on the wall clock. */
  const sync = useCallback(() => {
    if (endAtRef.current == null) return;
    const r = Math.max(0, Math.round((endAtRef.current - Date.now()) / 1000));
    remainingRef.current = r;
    setRemaining(r);
  }, []);

  // A new rest period (duration changed): reset and re-anchor if running.
  useEffect(() => {
    remainingRef.current = seconds;
    setRemaining(seconds);
    firedRef.current = false;
    endAtRef.current = running ? Date.now() + seconds * 1000 : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds]);

  // Pause/resume: on resume, re-anchor the end from the frozen remaining; on pause,
  // drop the anchor so the displayed value freezes where it stands (§7.2).
  useEffect(() => {
    if (running) {
      endAtRef.current = Date.now() + remainingRef.current * 1000;
      sync();
    } else {
      endAtRef.current = null;
    }
  }, [running, sync]);

  // The lock-screen fix: JS timers are suspended while backgrounded, so on return to
  // foreground recompute from the wall clock to reflect the real elapsed rest.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && running) sync();
    });
    return () => subscription.remove();
  }, [running, sync]);

  useEffect(() => {
    if (!running) return;
    if (remaining <= 0) {
      if (firedRef.current) return;
      firedRef.current = true;
      timerComplete(); // Light Impact — fires even under Reduce Motion
      AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
        if (!reduced) {
          Animated.sequence([
            Animated.timing(scale, { toValue: motion.successPulse.mid, duration: motion.successPulse.durationMs / 2, useNativeDriver: true }),
            Animated.timing(scale, { toValue: motion.successPulse.to, duration: motion.successPulse.durationMs / 2, useNativeDriver: true }),
          ]).start(() => onElapsed());
        } else {
          onElapsed();
        }
      });
      return;
    }
    // Recompute from the wall clock each tick (not r - 1), so a late/long tick or a
    // backgrounded interval can never drift from the absolute end.
    const id = setTimeout(sync, 1000);
    return () => clearTimeout(id);
  }, [running, remaining, onElapsed, scale, sync]);

  return (
    <Animated.Text
      style={[styles.timer, { transform: [{ scale }] }]}
      allowFontScaling
      maxFontSizeMultiplier={a11y.displayMaxScale}
      accessibilityLabel={`${mmss(remaining)} remaining`}
    >
      {mmss(remaining)}
    </Animated.Text>
  );
}

function mmss(total: number): string {
  const t = Math.max(0, total);
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  timer: {
    fontSize: typo.display.size,
    lineHeight: typo.display.lineHeight,
    fontWeight: typo.display.weight,
    color: color.textPrimary,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
});
