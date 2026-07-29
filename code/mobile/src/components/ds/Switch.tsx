/**
 * Switch — the design's pill toggle (one of the only pill shapes Hush allows).
 *
 * ════ ON, THE KNOB IS A HOLE IN THE MARK ════ (v7, measured)
 *
 * The handoff draws every ON switch the same way: a solid MOSS track with no border
 * and a knob of `rgba(241,238,229,.05)` — the knob is not a bright chip riding on the
 * accent, it is a gap punched through it. Two sizes exist, and they are not
 * interchangeable: the settings rows (§4.2) use 46 × 28 / knob 22, and the one card
 * that IS the control (1.3 · Connect health) uses 52 × 32 / knob 26.
 *
 * OFF is the one state the handoff never draws — it is a neutral translucent well
 * with a paper knob, which is the only version of it that stays legible on the stage.
 */
import React, { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { color, paper, motion } from '@/design/tokens';

const PAD = 3;
const GEOM = {
  md: { w: 46, h: 28, knob: 22 },
  lg: { w: 52, h: 32, knob: 26 },
} as const;

interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
  accessibilityLabel: string;
  disabled?: boolean;
  size?: 'md' | 'lg';
}

export function Switch({ checked, onChange, accessibilityLabel, disabled, size = 'md' }: Props) {
  const g = GEOM[size];
  const travel = g.w - g.knob - PAD * 2;
  const x = useSharedValue(checked ? travel : 0);
  useEffect(() => {
    x.value = withTiming(checked ? travel : 0, {
      duration: motion.dur[2],
      easing: Easing.bezier(...motion.easeStandard),
    });
  }, [checked, travel, x]);

  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={[
        styles.track,
        { width: g.w, height: g.h, borderRadius: g.h / 2 },
        checked ? styles.trackOn : styles.trackOff,
        disabled && styles.disabled,
      ]}
    >
      <Animated.View
        style={[
          styles.knob,
          { width: g.knob, height: g.knob, borderRadius: g.knob / 2 },
          checked ? styles.knobOn : styles.knobOff,
          knobStyle,
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { padding: PAD, justifyContent: 'center' },
  trackOff: { backgroundColor: color.fillSubtleStrong },
  trackOn: { backgroundColor: color.accent },
  disabled: { opacity: 0.4 },
  knob: {},
  // ON: the gap punched through the mark.
  knobOn: { backgroundColor: 'rgba(241,238,229,0.05)' },
  // OFF: paper, so the control still reads on the stage.
  knobOff: {
    backgroundColor: paper.lift,
    shadowColor: 'rgb(26,21,18)',
    shadowOpacity: 0.18,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
});
