/**
 * Switch — the design's pill toggle (one of the only pill shapes Hush allows).
 *
 * ════ ON, THE KNOB IS A HOLE IN THE MARK ════ (v7, measured)
 *
 * The handoff draws every ON switch the same way: a solid MOSS track with no border
 * and a knob that is not a bright chip riding on the accent but a gap punched through
 * it. Two sizes exist, and they are not interchangeable: the settings rows (§4.2) use
 * 46 × 28 / knob 22, and the one card that IS the control (1.3 · Connect health) uses
 * 52 × 32 / knob 26.
 *
 * OFF is the one state the handoff never draws — it is a neutral translucent well
 * with a paper knob, which is the only version of it that stays legible on the stage.
 *
 * ════ ⛔ THE HOLE WAS DRAWN AS A FILM, AND A FILM ON A LIGHT TRACK IS NOTHING ════
 * (measured 2026-09-18, on the coach track's consent switches)
 *
 * `knobOn` was `rgba(241,238,229,0.05)` — five per cent of near-white, composited over
 * `signal[0]` (#a9c49f). That resolves to #aac5a1: **1.01:1 against its own track.** So
 * every ON switch in the product drew as one solid moss capsule with no knob in it at
 * all, and the state of the control was carried entirely by its HUE. On the consent
 * screen — the one screen in the app whose whole job is telling her exactly what leaves
 * her phone — the two most consequential controls were unreadable as on or off.
 *
 * A hole shows what is BEHIND the mark, and what is behind it is the stage. `color.bg`
 * is that, by name (`ladderPositionIsNotAValue`): #000 on #a9c49f is 15.3:1, and the
 * knob's POSITION is now what says which way the switch is thrown — which is how the
 * control was always meant to be read.
 *
 * ⚠️ AND THE TRAVEL IS MIRRORED BY HAND. `transform` is the one style RN's RTL never
 * flips (`the-ltr-island-lesson`), so a knob translated `+travel` slid toward the START
 * edge in Hebrew — ON and OFF drawn in the same place a Hebrew reader reads OFF. The
 * `bidi.rtl` latch reverses it, the same mechanism `FigureCells` uses.
 */

// 

import React, { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { rtl } from '@/i18n/bidi';
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
  /* Physical pixels, signed by the reading direction — see the mirror note in the header. */
  const travel = (g.w - g.knob - PAD * 2) * (rtl ? -1 : 1);
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
      /* 46 × 28 is the drawing; 46 × 48 is the target. A control this consequential may not ask
         for a 28-point finger (the hit-area floor, and the switch was the last thing under it). */
      hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
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
  // ON: the gap punched through the mark — the stage itself, seen through it (15.3:1).
  knobOn: { backgroundColor: color.bg },
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
