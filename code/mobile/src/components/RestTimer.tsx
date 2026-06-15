/**
 * Rest timer (spec §1.14/§1.15, §8.2/§8.3). The timer is the hero during rest.
 * Display 72px Semibold TABULAR (any horizontal digit shift is a defect).
 * At 00:00: Light Impact haptic + 120ms pulse, then the flow advances.
 *
 * Reduced Motion: pulse suppressed, haptic STILL fires (UX §8.2).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Text, StyleSheet, Animated, AccessibilityInfo } from 'react-native';
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
  const scale = useRef(new Animated.Value(1)).current;
  const firedRef = useRef(false);

  useEffect(() => {
    setRemaining(seconds);
    firedRef.current = false;
  }, [seconds]);

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
    const id = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(id);
  }, [running, remaining, onElapsed, scale]);

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
