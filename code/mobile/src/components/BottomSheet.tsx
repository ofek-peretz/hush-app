/**
 * BottomSheet (spec §2.6.8) — presentation container: a dimmed scrim over the app
 * and a bottom-anchored sheet with top radius 24 and a centered grabber.
 *
 * Designed to be the root of a transparent-modal route so the parent screen shows
 * through the scrim. An optional `behind` layer renders the faint glimpse some sheets
 * want (Swap §4.21, Edit Result §4.13).
 *
 * DISMISS (founder 2026-07-12): swipe down from ANYWHERE on the sheet, not only from the
 * grabber. On a Pro Max the grabber is a stretch for a thumb — asking someone to reach the
 * top of a sheet to close it is asking them to re-grip the phone. The pan therefore lives on
 * the whole sheet, with two guards that keep it from stealing an inner ScrollView's gestures:
 *
 *   • `activeOffsetY([-18, 18])` — the pan only wakes up on a real vertical drag, so a tap,
 *     a horizontal wheel swipe, and a short scroll all pass straight through.
 *   • `scrollAtTop` — a sheet whose content scrolls reports its offset here. The sheet only
 *     follows the finger when that content is already at the top; mid-list, the drag is the
 *     list's. This is the rule every good iOS sheet uses, and it is why scrolling a long swap
 *     list back to the top and continuing to pull closes the sheet exactly as expected.
 *
 * Tapping the scrim still dismisses.
 */
import React, { useRef } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  type ViewStyle,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  type SharedValue,
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
  /**
   * For sheets whose content SCROLLS: the handle from `useSheetScroll()`. It carries the
   * list's ref (so the two gestures run side by side instead of one blocking the other) and
   * its live "am I at the top" flag (so the sheet only pulls down when the list has nothing
   * left to scroll). Omit it for sheets with no scrolling content.
   */
  scroll?: SheetScroll;
  style?: ViewStyle;
}

export interface SheetScroll {
  atTop: SharedValue<boolean>;
  /** Handed to the pan as a simultaneous gesture, and to the ScrollView as its ref. */
  ref: React.RefObject<ScrollView | null>;
  scrollProps: {
    ref: React.RefObject<ScrollView | null>;
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
    scrollEventThrottle: number;
  };
}

/** A sheet with no scrolling content is, definitionally, always at the top. */
const ALWAYS_AT_TOP = { value: true } as SharedValue<boolean>;

/**
 * Wire a sheet's inner ScrollView to its drag-to-dismiss.
 *
 * Spread `scrollProps` onto the ScrollView (it MUST be the gesture-handler ScrollView, so
 * RNGH can coordinate the two gestures) and hand the whole handle to the BottomSheet. The
 * sheet then pulls down only when the list is already at the top — the standard iOS
 * behaviour, and the reason scrolling a long list still works while the whole sheet is a
 * drag target.
 */
export function useSheetScroll(): SheetScroll {
  const atTop = useSharedValue(true);
  const ref = useRef<ScrollView | null>(null);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    // A small tolerance: iOS rubber-banding reports tiny non-zero offsets at rest.
    atTop.value = e.nativeEvent.contentOffset.y <= 1;
  };
  return { atTop, ref, scrollProps: { ref, onScroll, scrollEventThrottle: 16 } };
}

export function BottomSheet({
  onClose,
  children,
  background = color.surface,
  heightFraction,
  gutter = space.gutter,
  scrimOpacity = 0.55,
  behind,
  scroll,
  style,
}: Props) {
  const ty = useSharedValue(0);
  const insets = useSafeAreaInsets();
  // Sheets with no scrolling content are always "at the top" — they can be pulled from
  // anywhere, always.
  const atTop = scroll?.atTop ?? ALWAYS_AT_TOP;

  let pan = Gesture.Pan()
    // Only a deliberate vertical drag claims the gesture — a tap, a press, and the horizontal
    // wheels inside Edit Result are never intercepted.
    .activeOffsetY([-18, 18])
    .onUpdate((e) => {
      // Mid-list, a downward drag belongs to the list, not the sheet.
      if (!atTop.value && e.translationY > 0) return;
      // Follow the finger downward; damp any upward overscroll so it can't fly up.
      ty.value = e.translationY > 0 ? e.translationY : e.translationY * 0.2;
    })
    .onEnd((e) => {
      if (ty.value > DISMISS_DISTANCE || (e.velocityY > DISMISS_VELOCITY && ty.value > 0)) {
        ty.value = withTiming(800, { duration: 180 }, () => runOnJS(onClose)());
      } else {
        ty.value = withSpring(0, { damping: 20, stiffness: 220 });
      }
    });

  // A scrolling sheet declares its list SIMULTANEOUS with the pan. Without this the pan
  // wins the moment it activates and the list stops scrolling entirely — the `atTop` guard
  // above is what then decides which of the two actually moves.
  // The cast is the RNGH API's shape (it accepts a ref to any gesture-handler component;
  // its type only names ComponentType), not a soundness hole.
  if (scroll) pan = pan.simultaneousWithExternalGesture(scroll.ref as React.RefObject<React.ComponentType>);

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
      {/* Plain anchor (NOT a bottom-edge SafeAreaView, which padded the inset
          BELOW the sheet and left a scrim gap under it). The sheet sits flush to
          the screen bottom; the home-indicator inset is absorbed as INNER bottom
          padding so content still clears it. */}
      <View style={styles.anchor} pointerEvents="box-none">
        {/* The WHOLE sheet is the drag target — the grabber is now a hint, not the handle. */}
        <GestureDetector gesture={pan}>
          <Animated.View
            accessibilityLabel="Swipe down to dismiss"
            style={[
              styles.sheet,
              { backgroundColor: background, paddingHorizontal: gutter, paddingBottom: 28 + insets.bottom },
              heightFraction != null ? { height: `${heightFraction * 100}%` } : null,
              sheetStyle,
              style,
            ]}
          >
            <View style={styles.handleZone}>
              <View style={styles.grabber} />
            </View>
            {children}
          </Animated.View>
        </GestureDetector>
      </View>
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
    // paddingBottom is applied inline (28 + safe-area inset) so the sheet reaches
    // the screen edge with no scrim gap beneath it.
  },
  // Top drag handle area (replaces the old fixed paddingTop) — taller so it's easy
  // to grab; the grabber sits centered within it.
  handleZone: { paddingTop: 10, paddingBottom: 12, alignItems: 'center' },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 3,
    // Token, not the legacy dark-spec hex — a calm control-line gray on the paper sheet.
    backgroundColor: color.borderControl,
  },
});
