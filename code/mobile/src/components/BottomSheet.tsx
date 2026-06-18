/**
 * BottomSheet (spec §2.6.8) — presentation container: a dimmed scrim over the app
 * and a bottom-anchored sheet with top radius 24 and a centered grabber
 * (36×5pt, #3A3A3C, radius 3, ~10pt from top).
 *
 * Designed to be the root of a transparent-modal route so the parent screen shows
 * through the scrim. Dismiss by tapping the scrim OR dragging the grabber/handle
 * down (native iOS feel). An optional `behind` layer renders the faint glimpse some
 * sheets want (Swap §4.21, Edit Result §4.13).
 *
 * The drag gesture lives on the top handle zone (not the whole sheet) so it never
 * fights an inner ScrollView/wheel (Edit Result, Swap).
 */
import React from 'react';
import { View, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { color, radius, space } from '@/design/tokens';

const DISMISS_DISTANCE = 90; // drag this far down (or flick) to dismiss
const DISMISS_VELOCITY = 800;

interface Props {
  onClose: () => void;
  children: React.ReactNode;
  /** Sheet background — `surface` (default), `surface2`, etc. */
  background?: string;
  /** Fractional height of the sheet (0–1). Omit to size to content. */
  heightFraction?: number;
  /** Horizontal padding inside the sheet (spec: 16 or 18). */
  gutter?: number;
  /** Scrim opacity over the parent (default 0.55). */
  scrimOpacity?: number;
  /** Optional faint-glimpse layer rendered between scrim and sheet. */
  behind?: React.ReactNode;
  style?: ViewStyle;
}

export function BottomSheet({
  onClose,
  children,
  background = color.surface,
  heightFraction,
  gutter = space.gutter,
  scrimOpacity = 0.55,
  behind,
  style,
}: Props) {
  const ty = useSharedValue(0);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      // Follow the finger downward; damp any upward overscroll so it can't fly up.
      ty.value = e.translationY > 0 ? e.translationY : e.translationY * 0.2;
    })
    .onEnd((e) => {
      if (ty.value > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
        ty.value = withTiming(800, { duration: 180 }, () => runOnJS(onClose)());
      } else {
        ty.value = withSpring(0, { damping: 20, stiffness: 220 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }));

  return (
    <View style={styles.fill}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        style={[styles.scrim, { backgroundColor: `rgba(0,0,0,${scrimOpacity})` }]}
        onPress={onClose}
      />
      {behind}
      <SafeAreaView edges={['bottom']} style={styles.anchor} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: background, paddingHorizontal: gutter },
            heightFraction != null ? { height: `${heightFraction * 100}%` } : null,
            sheetStyle,
            style,
          ]}
        >
          {/* The handle zone is the drag target — generous hit area, won't conflict
              with scrollable content below it. */}
          <GestureDetector gesture={pan}>
            <View style={styles.handleZone} accessibilityLabel="Drag down to dismiss">
              <View style={styles.grabber} />
            </View>
          </GestureDetector>
          {children}
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
  scrim: StyleSheet.absoluteFillObject,
  // flex:1 gives the anchor a definite height so a sheet's `heightFraction`
  // (percentage height) resolves — without it the sheet collapses to its content
  // and appears to only partly rise. box-none still lets taps above it hit the scrim.
  anchor: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingBottom: 28,
  },
  // Top drag handle area (replaces the old fixed paddingTop) — taller so it's easy
  // to grab; the grabber sits centered within it.
  handleZone: { paddingTop: 10, paddingBottom: 12, alignItems: 'center' },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#3A3A3C',
  },
});
