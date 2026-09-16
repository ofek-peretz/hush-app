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
 * ── ⛔ AND IT LANDS, IT DOES NOT SNAP BACK (founder, 2026-09-16) ─────────────────────────────────
 *
 * *"אין הרגשה שהם מתחלפים בצורה חלקה בינהם אלא רק שאני מניח תרגיל על תרגיל אחר פתאום זה קופץ
 * ומתחלף. צריך שיהיה הרגשה שההחלפה 'מרחפת'."*
 *
 * He is describing a real seam, and this file's own docblock used to describe it as a feature: the
 * drop reset every translation to zero, which put the list back in its OLD order, and the true order
 * arrived only after the host had written to disk and re-read it — two renders and a remount later.
 * Between them: one frame of the week as it was, then a jump.
 *
 * Three changes, and together they are the "hover":
 *   1 · **THE LIFTED ROW FLIES TO ITS SEAT.** On release it springs from the finger to the exact
 *       offset of the seat it chose — it is not dropped, it is landed — while the rows that made way
 *       stay where they are.
 *   2 · **THE LIST TELLS THE TRUTH AT THE INSTANT IT LANDS.** `shown` is the host's list with the
 *       move already applied, so the order is right on the frame the flight ends; every translation
 *       is cleared in the same commit, and because the row is already sitting in that seat the
 *       clearing is invisible. Nothing moves twice, nothing moves back.
 *   3 · **THE HOST'S ANSWER IS ONLY A HANDOVER.** The real move still happens where it always did —
 *       the programme on disk, the live plan — and when it comes back the optimistic order is
 *       dropped, because by then it is the host's order too. A commit that never lands is released
 *       after `SETTLE_GRACE_MS`, so the screen can go stale but can never lie for ever.
 */

//

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
/** How long the optimistic order may outlive the host's answer before it is given up (see above). */
const SETTLE_GRACE_MS = 2000;

/** The host's list with one row moved — the same algebra `moveLift` runs on the week itself. */
function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const out = list.slice();
  const [row] = out.splice(from, 1);
  out.splice(to, 0, row!);
  return out;
}

export function ReorderRows<T extends ReorderItem>({ items, onMove, onDragging, renderItem, gap = 0, gripColor, gripLabel, style }: Props<T>) {
  /*
   * ⛔ THE ORDER SHE JUST MADE, HELD UNTIL THE HOST HAS IT (see the header, point 2). `null` the rest
   * of the time — this is a handover, never a second source of truth about her week.
   */
  const [landed, setLanded] = useState<readonly T[] | null>(null);
  /* The host's own list is the authority; `landed` only stands in front of it between the landing
     and the host's answer, and the effect below hands back the moment that answer arrives. */
  const shown = landed && landed.length === items.length ? landed : items;
  const itemsKey = items.map((it) => it.key).join('|');
  const lastItemsKey = useRef(itemsKey);
  useEffect(() => {
    /* The host re-rendered with a DIFFERENT list — the move landed (or something else moved her
       week). Either way the optimistic copy has nothing left to say. */
    if (itemsKey !== lastItemsKey.current) {
      lastItemsKey.current = itemsKey;
      setLanded(null);
    }
  }, [itemsKey]);
  useEffect(() => {
    if (!landed) return;
    const t = setTimeout(() => setLanded(null), SETTLE_GRACE_MS);
    return () => clearTimeout(t);
  }, [landed]);

  const heights = useSharedValue<number[]>(items.map(() => 0));
  const active = useSharedValue(-1);
  const target = useSharedValue(-1);
  const dragY = useSharedValue(0);
  /* Set for the one commit that clears a landing: the rows are already where they belong, so the
     reset must be instant — an animated zero here would walk the whole list back and forth. */
  const snap = useSharedValue(0);
  const movable = shown.map((it) => it.movable);
  const movableRef = useRef(movable);
  movableRef.current = movable;
  /* Reduced Motion: the rows still make way, but they step rather than spring (`nothingMovesForeverWithoutAsking`). */
  const reduced = useReducedMotion();

  // The list may grow or shrink under us (a swap re-reads the week); keep the height table sized.
  useEffect(() => {
    if (heights.value.length !== shown.length) heights.value = shown.map((_, i) => heights.value[i] ?? 0);
  }, [shown, heights]);

  /**
   * The finger has lifted and the row has flown to its seat. The list becomes true HERE — in the
   * same commit that clears every translation — and the host is told after, because its answer is a
   * disk write and a re-read, which is exactly the wait this hand-over exists to cover.
   */
  const land = useCallback(
    (from: number, to: number) => {
      if (from === to || from < 0 || to < 0) return;
      setLanded(moved(shown, from, to));
      heights.value = moved(heights.value, from, to);
      onMove(from, to);
    },
    [shown, heights, onMove],
  );

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
      {shown.map((item, i) => (
        <Row
          key={item.key}
          index={i}
          count={shown.length}
          movable={movable}
          gap={gap}
          heights={heights}
          active={active}
          target={target}
          dragY={dragY}
          snap={snap}
          onLayout={setHeight}
          onMove={land}
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
  snap,
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
  snap: SharedValue<number>;
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
  /**
   * The landing is complete: the row is sitting in its seat, held there by a translation. This is
   * the one commit where the LIST changes and every translation is dropped — together, so the two
   * cancel out and nothing on screen moves. `snap` makes the drop instant rather than animated.
   */
  const settle = useCallback(
    (from: number, to: number) => {
      snap.value = 1;
      active.value = -1;
      target.value = -1;
      dragY.value = 0;
      setLifted(false);
      onDragging?.(false);
      onMove(from, to);
      /* One frame later the rows are drawn in their new seats at rest, and the ordinary animated
         zero can come back for the next drag. */
      requestAnimationFrame(() => {
        snap.value = 0;
      });
    },
    [active, dragY, onDragging, onMove, snap, target],
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
      if (from < 0) return;
      /*
       * ⛔ IT FLIES TO THE SEAT IT CHOSE, IT DOES NOT FALL BACK. The landing offset is the exact
       * distance between the row's own seat and the one it is taking — the same arithmetic the rows
       * it crossed have already used to make way — so at the end of this spring the row is sitting
       * where the list is about to say it sits. `settle` then swaps the two facts in one commit.
       */
      const h = heights.value;
      let landing = 0;
      if (to > from) for (let i = from + 1; i <= to; i++) landing += h[i] + gap;
      else if (to < from) for (let i = to; i < from; i++) landing -= h[i] + gap;
      if (reduced) {
        dragY.value = landing;
        runOnJS(settle)(from, to);
        return;
      }
      dragY.value = withSpring(landing, { damping: 26, stiffness: 240, overshootClamping: true }, (done) => {
        if (done) runOnJS(settle)(from, to);
      });
    });

  const animated = useAnimatedStyle(() => {
    const a = active.value;
    const t = target.value;
    if (a < 0) {
      /* `snap` is the frame a landing is handed over on: the row is already in the right seat, so
         the translation must vanish rather than travel (see `settle`). */
      return { transform: [{ translateY: withTiming(0, { duration: snap.value ? 0 : motion.dur[1] }) }], zIndex: 0 };
    }
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
