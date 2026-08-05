/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * A ROW SHE CAN PICK UP — the drag half of the week board.
 *
 * ⛔ FOUNDER, 2026-08-05: *"the athlete can change it herself by dragging from one day to another
 * and swapping."*
 *
 * ── ⚠️ WHY IT MEASURES INSTEAD OF COUNTING ──────────────────────────────────────────────────────
 * The obvious implementation divides the drag distance by a row height. **The rows are not the same
 * height.** The open row carries a name, a shape line and a change pill and stands three times a
 * closed row; a rest day is a letter and a hairline and stands shorter than either. Dividing by any
 * one of those numbers puts the session on the wrong day for most of the week, and it would do it
 * SILENTLY — she would drop it on Wednesday and find it on Thursday.
 *
 * So every row reports where it actually is (`onLayout`), and the drop lands on whichever row's
 * band contains the dragged row's centre. That is arithmetic on measured facts rather than on an
 * assumption about a layout that changes whenever the open row does.
 *
 * ── WHY A LONG PRESS ────────────────────────────────────────────────────────────────────────────
 * The row is already a control — it opens the pre-workout card — and the column lives inside a
 * ScrollView. A pan that activated immediately would fight both. `activateAfterLongPress` gives the
 * tap and the scroll priority and asks for a deliberate 220 ms before it takes over, which is also
 * the gesture every list in iOS uses to mean "this is yours to move".
 *
 * ⚠️ REDUCED MOTION DOES NOT DISABLE IT. The lift is a spring and a shadow, not information — with
 * motion reduced the row still moves under her finger, because a drag that does not follow the
 * finger is not a drag. Only the flourish goes.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import React from 'react';
import { StyleSheet, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS, Easing } from 'react-native-reanimated';

import * as haptics from '@/platform/haptics';

export interface DraggableWeekRowProps {
  /** Absent = this row cannot be picked up (a rest day has nothing to move). */
  id?: string;
  /** Frozen while a session is resumable — the week is not hers to rearrange mid-workout. */
  disabled?: boolean;
  /** Where this row sits inside the column, reported as it lays out. */
  onMeasure: (y: number, height: number) => void;
  /** Picked up — the parent dims the rest of the column and shows where it can land. */
  onPickUp?: () => void;
  /** Dropped, with the row's own centre in column coordinates. The parent decides the target. */
  onDrop?: (id: string, centreY: number) => void;
  /** The gesture is over, however it ended — the parent puts the column back to rest. */
  onSettle?: () => void;
  children: React.ReactNode;
}

export function DraggableWeekRow({ id, disabled, onMeasure, onPickUp, onDrop, onSettle, children }: DraggableWeekRowProps) {
  const dy = useSharedValue(0);
  const lifted = useSharedValue(0);
  const box = React.useRef({ y: 0, height: 0 });

  const measure = (e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    box.current = { y, height };
    onMeasure(y, height);
  };

  const release = React.useCallback(
    (translation: number) => {
      if (!id) return;
      onDrop?.(id, box.current.y + box.current.height / 2 + translation);
    },
    [id, onDrop],
  );

  const settle = React.useCallback(() => {
    onSettle?.();
  }, [onSettle]);

  const pickUp = React.useCallback(() => {
    haptics.tick();
    onPickUp?.();
  }, [onPickUp]);

  const pan = React.useMemo(
    () =>
      Gesture.Pan()
        .enabled(!!id && !disabled)
        .activateAfterLongPress(220)
        .onStart(() => {
          lifted.value = withTiming(1, { duration: 140, easing: Easing.out(Easing.quad) });
          runOnJS(pickUp)();
        })
        .onUpdate((e) => {
          dy.value = e.translationY;
        })
        .onEnd((e) => {
          runOnJS(release)(e.translationY);
        })
        /*
         * ⛔ `onFinalize`, NOT `onEnd` — found in the audit, 2026-08-05.
         *
         * `onEnd` runs when a gesture completes. It does NOT run when one is CANCELLED, and a pan
         * inside a ScrollView is cancelled routinely: a finger that leaves the screen, a call
         * arriving, the scroll winning the race. Every one of those would have left `lifted` at 1
         * and the parent's `dragging` flag set — so the row would stay raised and **every empty day
         * would keep showing a moss drop slot, for ever, until she left the screen.**
         *
         * `onFinalize` runs on both paths. The reset belongs here and the WRITE stays in `onEnd`,
         * because a cancelled drag must move nothing.
         *
         * ⚠️ AND IT SPRINGS BACK TO ZERO ALWAYS. The parent re-renders the row into its new place;
         * leaving it translated and letting the re-render arrive would double the movement for one
         * frame — the row would appear to jump past the day she chose.
         */
        .onFinalize(() => {
          dy.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) });
          lifted.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.quad) });
          runOnJS(settle)();
        }),
    [id, disabled, dy, lifted, pickUp, release, settle],
  );

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: dy.value }, { scale: 1 + lifted.value * 0.02 }],
    // A lifted row must draw OVER its neighbours or it slides behind the next day's rule.
    zIndex: lifted.value > 0 ? 10 : 0,
    shadowOpacity: lifted.value * 0.5,
    shadowRadius: lifted.value * 14,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View onLayout={measure} style={[styles.row, style]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  // The shadow is declared here and its OPACITY animated, because an animated shadow colour
  // cannot run on the UI thread. Black, so it reads on the absolute-black ground as depth.
  row: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 } },
});
