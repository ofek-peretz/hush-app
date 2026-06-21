/**
 * Switch — the design's pill toggle (one of the only pill shapes Hush allows).
 * On reads INK (a settled state), off reads a neutral well. The knob is paper;
 * it slides a short, decisive distance — confirms, never bounces (motion law).
 */
import React, { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { color, paper, ink, motion } from '@/design/tokens';

const W = 46;
const H = 28;
const KNOB = 22;
const PAD = 3;
const BORDER = 1;
const TRAVEL = W - 2 * BORDER - KNOB - PAD * 2; // 16

interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
  accessibilityLabel: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, accessibilityLabel, disabled }: Props) {
  const x = useSharedValue(checked ? TRAVEL : 0);
  useEffect(() => {
    x.value = withTiming(checked ? TRAVEL : 0, {
      duration: motion.dur[2],
      easing: Easing.bezier(...motion.easeStandard),
    });
  }, [checked, x]);

  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={[styles.track, checked ? styles.trackOn : styles.trackOff, disabled && styles.disabled]}
    >
      <Animated.View style={[styles.knob, knobStyle]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: W, height: H, borderRadius: H / 2, padding: PAD, justifyContent: 'center' },
  trackOff: { backgroundColor: color.fillSubtleStrong, borderWidth: 1, borderColor: color.borderControl },
  trackOn: { backgroundColor: ink[0], borderWidth: 1, borderColor: ink[0] },
  disabled: { opacity: 0.4 },
  knob: {
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: paper[0],
    shadowColor: 'rgb(26,21,18)',
    shadowOpacity: 0.18,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
});
