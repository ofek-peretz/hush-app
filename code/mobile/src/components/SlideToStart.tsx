/**
 * SlideToStart (spec §2.6.9, §4.7) — the Home training-day start control.
 * A pill (height 58, radius 29) with a white knob (48) that the athlete drags
 * right; crossing ~60% of the travel starts the workout, releasing earlier springs
 * back. Idle affordances: a shimmer sweep (2.6s loop) and a periodic knob nudge.
 * Reduced Motion disables both and keeps the control fully functional.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  runOnJS,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { Icon } from '@/components/Icon';
import { useReducedMotion } from '@/platform/reducedMotion';
import { color, s } from '@/design/tokens';

const HEIGHT = s(58);
const KNOB = s(48);
const INSET = s(5);
const THRESHOLD = 0.6; // fraction of travel that commits the start

export function SlideToStart({ label, onStart }: { label: string; onStart: () => void }) {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const travel = Math.max(0, width - KNOB - INSET * 2);

  const x = useSharedValue(0);
  const dragging = useSharedValue(false);
  const shimmer = useSharedValue(0);
  const nudge = useSharedValue(0);

  // Idle affordances (skipped under Reduced Motion).
  React.useEffect(() => {
    if (reduced || travel <= 0) return;
    shimmer.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.linear }), -1, false);
    nudge.value = withRepeat(
      withSequence(
        withDelay(2184, withTiming(1, { duration: 120, easing: Easing.out(Easing.quad) })), // ~84% of 2.6s
        withTiming(0, { duration: 180, easing: Easing.in(Easing.quad) }),
        withDelay(116, withTiming(0, { duration: 0 })),
      ),
      -1,
      false,
    );
    return () => {
      shimmer.value = 0;
      nudge.value = 0;
    };
  }, [reduced, travel, shimmer, nudge]);

  const pan = Gesture.Pan()
    .onBegin(() => {
      dragging.value = true;
    })
    .onUpdate((e) => {
      const next = Math.min(travel, Math.max(0, e.translationX));
      x.value = next;
    })
    .onEnd(() => {
      if (travel > 0 && x.value >= travel * THRESHOLD) {
        x.value = withTiming(travel, { duration: 140 }, () => {
          runOnJS(onStart)();
        });
      } else {
        x.value = withSpring(0, { damping: 18, stiffness: 220 });
      }
    })
    .onFinalize(() => {
      dragging.value = false;
    });

  // The drag is no longer REQUIRED (founder: keep the design, drop the slider gate):
  // a plain tap commits the start, the knob glides to the end and fires. Dragging
  // still works for anyone who reaches for it. Tap loses to a real pan via Race.
  const tap = Gesture.Tap().onEnd(() => {
    if (travel > 0) {
      x.value = withTiming(travel, { duration: 160 }, () => {
        runOnJS(onStart)();
      });
    } else {
      runOnJS(onStart)();
    }
  });
  const gesture = Gesture.Race(pan, tap);

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value + (dragging.value ? 0 : nudge.value * 5) }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    // Fade the label out as the knob advances.
    opacity: travel > 0 ? interpolate(x.value, [0, travel * 0.8], [1, 0]) : 1,
  }));

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(shimmer.value, [0, 1], [-width, width]) }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={styles.pill}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Tap to start your workout"
      >
        {!reduced ? (
          <Animated.View pointerEvents="none" style={[styles.shimmer, shimmerStyle]} />
        ) : null}
        <Animated.Text style={[styles.label, labelStyle]} pointerEvents="none">
          {label}
        </Animated.Text>
        <Animated.View style={[styles.knob, knobStyle]} pointerEvents="none">
          <View style={styles.chevrons}>
            <Icon name="chevronRight" size={18} color={color.bg} strokeWidth={2.4} />
            <View style={styles.chevron2}>
              <Icon name="chevronRight" size={18} color={color.bg} strokeWidth={2.4} />
            </View>
          </View>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'stretch',
    height: HEIGHT,
    borderRadius: HEIGHT / 2,
    backgroundColor: '#121212',
    borderWidth: 0.5,
    borderColor: '#2A2A2A',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 80,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  label: {
    textAlign: 'center',
    color: color.textSecondary,
    fontSize: s(15),
    fontWeight: '500',
    marginLeft: KNOB / 2, // offset right to clear the knob (§4.7)
  },
  knob: {
    position: 'absolute',
    left: INSET,
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevrons: { flexDirection: 'row', alignItems: 'center' },
  chevron2: { marginLeft: -10, opacity: 0.45 },
});
