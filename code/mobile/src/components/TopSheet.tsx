/**
 * TopSheet — a sheet that slides DOWN from the top edge (the founder's replacement
 * for the hamburger: "the menu opens from the top and slides down"). Mirror of
 * BottomSheet, anchored to the top: rounded BOTTOM corners, a grabber at the
 * bottom of the panel, drag UP (or tap the scrim) to dismiss. Monochrome.
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

const DISMISS_DISTANCE = 80; // drag this far up (or flick) to dismiss
const DISMISS_VELOCITY = 800;

interface Props {
  onClose: () => void;
  children: React.ReactNode;
  background?: string;
  gutter?: number;
  scrimOpacity?: number;
  style?: ViewStyle;
}

export function TopSheet({
  onClose,
  children,
  background = color.surface,
  gutter = space.gutter,
  scrimOpacity = 0.55,
  style,
}: Props) {
  const ty = useSharedValue(0);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      // Follow the finger upward; damp any downward overscroll.
      ty.value = e.translationY < 0 ? e.translationY : e.translationY * 0.2;
    })
    .onEnd((e) => {
      if (ty.value < -DISMISS_DISTANCE || e.velocityY < -DISMISS_VELOCITY) {
        ty.value = withTiming(-800, { duration: 180 }, () => runOnJS(onClose)());
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
      <SafeAreaView edges={['top']} style={styles.anchor} pointerEvents="box-none">
        <Animated.View
          style={[styles.sheet, { backgroundColor: background, paddingHorizontal: gutter }, sheetStyle, style]}
        >
          {children}
          {/* Drag handle sits at the BOTTOM of a top-anchored sheet. */}
          <GestureDetector gesture={pan}>
            <View style={styles.handleZone} accessibilityLabel="Drag up to dismiss">
              <View style={styles.grabber} />
            </View>
          </GestureDetector>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-start' },
  scrim: StyleSheet.absoluteFillObject,
  anchor: { justifyContent: 'flex-start' },
  sheet: {
    borderBottomLeftRadius: radius.sheet,
    borderBottomRightRadius: radius.sheet,
    paddingTop: 8,
  },
  handleZone: { paddingTop: 10, paddingBottom: 12, alignItems: 'center' },
  grabber: { width: 36, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
});
