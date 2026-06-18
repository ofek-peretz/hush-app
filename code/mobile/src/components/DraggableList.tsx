/**
 * DraggableList — a long-press-to-lift, drag-to-reorder vertical list
 * (react-native-gesture-handler + reanimated). Built for the Workout Edit screen
 * (spec §4.20 "Drag to reorder") where the athlete owns exercise order.
 *
 * Design notes:
 *  - Rows are fixed-height and absolutely positioned by a shared `positions` map,
 *    so reordering is a pure animation on the UI thread (no JS re-render mid-drag).
 *  - A row lifts only after a long press, so a quick tap still reaches the controls
 *    inside it (e.g. the swap icon) and the parent ScrollView keeps scrolling.
 *  - On drop, `onReorder(from, to)` is called once; the parent persists the new
 *    order and feeds back reordered `data`, which resets positions to identity.
 */
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';

const SPRING = { damping: 20, stiffness: 220 } as const;

function clamp(v: number, min: number, max: number): number {
  'worklet';
  return Math.max(min, Math.min(v, max));
}

/** Proper "move" (not swap): shift every item between `from` and `to` by one. */
function objectMove(
  object: Record<string, number>,
  from: number,
  to: number,
): Record<string, number> {
  'worklet';
  const next: Record<string, number> = Object.assign({}, object);
  for (const id in object) {
    if (object[id] === from) {
      next[id] = to;
    } else if (from < to) {
      if (object[id] > from && object[id] <= to) next[id] = object[id] - 1;
    } else {
      if (object[id] >= to && object[id] < from) next[id] = object[id] + 1;
    }
  }
  return next;
}

interface Props<T> {
  data: T[];
  keyExtractor: (item: T, index: number) => string;
  rowHeight: number;
  onReorder: (from: number, to: number) => void;
  renderItem: (item: T, index: number) => React.ReactNode;
  /** ms a press must be held before a row lifts (default 220). */
  longPressMs?: number;
}

export function DraggableList<T>({
  data,
  keyExtractor,
  rowHeight,
  onReorder,
  renderItem,
  longPressMs = 220,
}: Props<T>) {
  const count = data.length;
  const keys = data.map((d, i) => keyExtractor(d, i));
  const signature = keys.join('|');

  // key -> current slot index (UI-thread source of truth during a drag).
  const positions = useSharedValue<Record<string, number>>(
    Object.fromEntries(keys.map((k, i) => [k, i])),
  );
  const activeKey = useSharedValue<string | null>(null);

  // Whenever the data (order/identity) changes, reset to identity positions so the
  // animated layout matches the new order with no jump.
  useEffect(() => {
    positions.value = Object.fromEntries(keys.map((k, i) => [k, i]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, rowHeight]);

  return (
    <View style={{ height: count * rowHeight }}>
      {data.map((item, index) => {
        const key = keys[index];
        return (
          <Row
            key={key}
            itemKey={key}
            count={count}
            rowHeight={rowHeight}
            positions={positions}
            activeKey={activeKey}
            longPressMs={longPressMs}
            onReorder={onReorder}
          >
            {renderItem(item, index)}
          </Row>
        );
      })}
    </View>
  );
}

interface RowProps {
  itemKey: string;
  count: number;
  rowHeight: number;
  positions: SharedValue<Record<string, number>>;
  activeKey: SharedValue<string | null>;
  longPressMs: number;
  onReorder: (from: number, to: number) => void;
  children: React.ReactNode;
}

function Row({ itemKey, count, rowHeight, positions, activeKey, longPressMs, onReorder, children }: RowProps) {
  const top = useSharedValue((positions.value[itemKey] ?? 0) * rowHeight);
  const dragging = useSharedValue(false);
  const startIndex = useSharedValue(0);

  // Follow the shared positions map unless THIS row is the one being dragged.
  useAnimatedReaction(
    () => positions.value[itemKey] ?? 0,
    (slot) => {
      if (!dragging.value) {
        top.value = withSpring(slot * rowHeight, SPRING);
      }
    },
  );

  const pan = Gesture.Pan()
    .activateAfterLongPress(longPressMs)
    .onStart(() => {
      dragging.value = true;
      activeKey.value = itemKey;
      startIndex.value = positions.value[itemKey] ?? 0;
    })
    .onUpdate((e) => {
      const newTop = startIndex.value * rowHeight + e.translationY;
      top.value = newTop;
      const curIndex = positions.value[itemKey] ?? 0;
      const newIndex = clamp(Math.round(newTop / rowHeight), 0, count - 1);
      if (newIndex !== curIndex) {
        positions.value = objectMove(positions.value, curIndex, newIndex);
      }
    })
    .onEnd(() => {
      const finalIndex = positions.value[itemKey] ?? 0;
      top.value = withSpring(finalIndex * rowHeight, SPRING);
      if (finalIndex !== startIndex.value) {
        runOnJS(onReorder)(startIndex.value, finalIndex);
      }
    })
    .onFinalize(() => {
      dragging.value = false;
      activeKey.value = null;
    });

  const style = useAnimatedStyle(() => {
    const isActive = activeKey.value === itemKey;
    return {
      position: 'absolute',
      left: 0,
      right: 0,
      top: top.value,
      zIndex: isActive ? 10 : 0,
      transform: [{ scale: withTiming(isActive ? 1.02 : 1, { duration: 120 }) }],
      opacity: withTiming(isActive ? 0.96 : 1, { duration: 120 }),
      shadowColor: '#000',
      shadowOpacity: isActive ? 0.35 : 0,
      shadowRadius: isActive ? 12 : 0,
      shadowOffset: { width: 0, height: isActive ? 6 : 0 },
    };
  });

  return (
    <Animated.View style={[styles.row, style]}>
      <GestureDetector gesture={pan}>
        <View style={styles.fill}>{children}</View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { width: '100%' },
  fill: { width: '100%' },
});
