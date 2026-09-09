/**
 * ════ ROWS SHE CAN DRAG INTO A NEW ORDER (founder, 2026-09-07) ════
 *
 * *"אני רוצה שתעשה במסך הזה שאפשר לגרור ולשנות את סדר התרגילים … וגם במהלך האימון יש פקד שמציג את
 * התרגילים — אני רוצה שיהיה אפשרות להחליף את סדר התרגילים שם."*
 *
 * Two screens asked for the same gesture on the same day — the pre-workout card and the session
 * map — so the gesture lives once, here, and each screen says what a row IS and which rows may
 * move. Nothing in this file knows about lifts.
 *
 * ── HOW IT MOVES ─────────────────────────────────────────────────────────────────────────────────
 * A row is picked up by its GRIP after a short hold (`activateAfterLongPress`), never by a bare
 * touch: both hosts sit in something that already scrolls, and a pan that activates on the first
 * point of travel would steal every scroll that happened to start on a handle. The hold is what
 * makes the two gestures unambiguous. While a row is in the air the host is told (`onDragging`) so
 * it can freeze its own scroll, and the lifted row rides the finger while the rows it crosses slide
 * out of its way by exactly its own height — measured off `onLayout`, because names wrap and rows
 * are not one height.
 *
 * ⛔ A LOCKED ROW IS A SEAT NOTHING MAY TAKE. The session map locks what she has done; a dragged
 * row that reaches a locked seat is held at the last movable seat before it, so "done cannot be
 * moved" is true in both directions — a done row never moves, and nothing moves INTO its place.
 *
 * ⚠️ THE DROP REPORTS INDICES IN THE HOST'S OWN LIST (`from`, `to`), and the host does the real
 * move — in the programme on disk, or in the live plan. This component only animates the promise;
 * the host's re-render with the new order is what makes it true, and every translation is reset the
 * moment the finger lifts so the two cannot disagree for longer than a frame.
 */

//

import React, { useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, type ViewStyle, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS, type SharedValue } from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import { motion } from '@/design/tokens';
import { useReducedMotion } from '@/platform/reducedMotion';

export interface ReorderItem {
  key: string;
  /** May this row be picked up, and may another row land in its seat? */
  movable: boolean;
}

interface Props<T extends ReorderItem> {
  items: readonly T[];
  /** The finger lifted over a new seat: move `from` to `to` (indices in `items`). */
  onMove: (from: number, to: number) => void;
  /** A row is in the air / has landed — the host freezes and thaws its scroll on this. */
  onDragging?: (dragging: boolean) => void;
  /** Draw one row. `grip` is the handle to place inside it (null on a locked row). */
  renderItem: (item: T, index: number, grip: React.ReactNode, lifted: boolean) => React.ReactNode;
  /** Vertical space between rows, so the slide-aside is measured against the real gap. */
  gap?: number;
  gripColor: string;
  /** The grip's spoken name — copy is the host's, in her language. */
  gripLabel: string;
  style?: ViewStyle;
}

const HOLD_MS = 160;

export function ReorderRows<T extends ReorderItem>({ items, onMove, onDragging, renderItem, gap = 0, gripColor, gripLabel, style }: Props<T>) {
  const heights = useSharedValue<number[]>(items.map(() => 0));
  const active = useSharedValue(-1);
  const target = useSharedValue(-1);
  const dragY = useSharedValue(0);
  const movable = items.map((it) => it.movable);
  const movableRef = useRef(movable);
  movableRef.current = movable;
  /* Reduced Motion: the rows still make way, but they step rather than spring (`nothingMovesForeverWithoutAsking`). */
  const reduced = useReducedMotion();

  // The list may grow or shrink under us (a swap re-reads the week); keep the height table sized.
  useEffect(() => {
    if (heights.value.length !== items.length) heights.value = items.map((_, i) => heights.value[i] ?? 0);
  }, [items, heights]);

  const setHeight = useCallback(
    (i: number, h: number) => {
      const next = heights.value.slice();
      if (next[i] === h) return;
      next[i] = h;
      heights.value = next;
    },
    [heights],
  );

  return (
    <View style={style}>
      {items.map((item, i) => (
        <Row
          key={item.key}
          index={i}
          count={items.length}
          movable={movable}
          gap={gap}
          heights={heights}
          active={active}
          target={target}
          dragY={dragY}
          onLayout={setHeight}
          onMove={onMove}
          onDragging={onDragging}
          reduced={reduced}
          gripColor={gripColor}
          gripLabel={gripLabel}
          render={(grip, lifted) => renderItem(item, i, grip, lifted)}
        />
      ))}
    </View>
  );
}

function Row({
  index,
  count,
  movable,
  gap,
  heights,
  active,
  target,
  dragY,
  onLayout,
  onMove,
  onDragging,
  reduced,
  gripColor,
  gripLabel,
  render,
}: {
  index: number;
  count: number;
  movable: boolean[];
  gap: number;
  heights: SharedValue<number[]>;
  active: SharedValue<number>;
  target: SharedValue<number>;
  dragY: SharedValue<number>;
  onLayout: (i: number, h: number) => void;
  onMove: (from: number, to: number) => void;
  onDragging?: (dragging: boolean) => void;
  reduced: boolean;
  gripColor: string;
  gripLabel: string;
  render: (grip: React.ReactNode, lifted: boolean) => React.ReactNode;
}) {
  const [lifted, setLifted] = React.useState(false);
  const isMovable = movable[index];

  const begin = useCallback(() => {
    setLifted(true);
    onDragging?.(true);
  }, [onDragging]);
  const settle = useCallback(
    (from: number, to: number) => {
      setLifted(false);
      onDragging?.(false);
      if (from !== to && from >= 0 && to >= 0) onMove(from, to);
    },
    [onDragging, onMove],
  );

  const pan = Gesture.Pan()
    .enabled(isMovable)
    .activateAfterLongPress(HOLD_MS)
    .onStart(() => {
      active.value = index;
      target.value = index;
      dragY.value = 0;
      runOnJS(begin)();
    })
    .onUpdate((e) => {
      dragY.value = e.translationY;
      const h = heights.value;
      const a = active.value;
      if (a < 0) return;
      // The lifted row's centre, against the centres of the rows it is crossing.
      let top = 0;
      for (let i = 0; i < a; i++) top += h[i] + gap;
      const centre = top + h[a] / 2 + e.translationY;
      let t = a;
      if (e.translationY > 0) {
        let edge = top + h[a] + gap;
        for (let i = a + 1; i < count; i++) {
          const mid = edge + h[i] / 2;
          if (centre > mid) t = i;
          else break;
          edge += h[i] + gap;
        }
        // Never past a locked seat: fall back to the last movable seat on the way.
        while (t > a && !movable[t]) t--;
      } else if (e.translationY < 0) {
        let edge = top;
        for (let i = a - 1; i >= 0; i--) {
          const mid = edge - gap - h[i] / 2;
          if (centre < mid) t = i;
          else break;
          edge -= h[i] + gap;
        }
        while (t < a && !movable[t]) t++;
      }
      target.value = t;
    })
    .onFinalize(() => {
      const from = active.value;
      const to = target.value;
      active.value = -1;
      target.value = -1;
      dragY.value = withTiming(0, { duration: motion.dur[1] });
      runOnJS(settle)(from, to);
    });

  const animated = useAnimatedStyle(() => {
    const a = active.value;
    const t = target.value;
    if (a < 0) return { transform: [{ translateY: withTiming(0, { duration: motion.dur[1] }) }], zIndex: 0 };
    if (a === index) return { transform: [{ translateY: dragY.value }, { scale: 1.02 }], zIndex: 10 };
    const step = heights.value[a] + gap;
    let shift = 0;
    if (a < index && index <= t) shift = -step;
    else if (t <= index && index < a) shift = step;
    return {
      transform: [{ translateY: reduced ? withTiming(shift, { duration: 0 }) : withSpring(shift, { damping: 22, stiffness: 260 }) }],
      zIndex: 0,
    };

  });

  const grip = isMovable ? (
    <GestureDetector gesture={pan}>
      <View accessible accessibilityRole="button" accessibilityLabel={gripLabel} hitSlop={10} style={styles.grip}>

        <Icon name="grip" size={18} color={gripColor} strokeWidth={1.8} />
      </View>
    </GestureDetector>
  ) : null;

  return (
    <Animated.View
      style={[animated, lifted && styles.lifted]}
      onLayout={(e: LayoutChangeEvent) => onLayout(index, e.nativeEvent.layout.height)}
    >
      {render(grip, lifted)}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  grip: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  lifted: { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
});
