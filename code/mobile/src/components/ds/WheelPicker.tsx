/**
 * WheelPicker — a horizontal, swipe-to-value wheel. Replaces the +/- Stepper everywhere a number is
 * chosen (bodyweight, sessions/week, the in-workout Edit Result), so reaching a distant value is one
 * swipe, not forty taps.
 *
 * ── THE v7 RULE (founder handoff 1.4 / 2.2b) ───────────────────────────────────────────────────
 * The ruler is now drawn as a TRUE ENGRAVED SCALE, "calmer, more instrument":
 *
 *   • The numerals SCROLL. Five read at a time — the centred value large and fully inked, its
 *     neighbours shrinking and dimming toward the edges (30 → 17 → 15). Focus is atomic; the rest
 *     of the axis becomes background texture rather than competing noise.
 *   • Beneath them, a CONTINUOUS tick strip — a fine, even graduation that does not move, the way
 *     the printed scale on a caliper does not move. The chosen value is struck by ONE moss tick at
 *     dead centre: the single unambiguous statement of "this is the value".
 *   • No box, no fill. The scale is framed only by a hairline top and bottom and sits directly on
 *     the stage; the ends dissolve into the ground so the rule reads as a window onto a longer
 *     track. Nothing glows — the instrument is quiet.
 *   • Hit target. The whole control takes the swipe — a sweating hand in a gym should not have to
 *     land inside a 44pt box to start scrolling.
 *
 * The unit is carried by the field's LEGEND ("WEIGHT · KG"), so no unit chip runs beside the
 * digits — every production screen omits it. The `unit` prop is retained only for the a11y value
 * ("82 kg") and renders a side cell when supplied. The control is an accessible "adjustable"
 * element: VoiceOver reads the label + value and the increment/decrement rotor steps it.
 *
 * RTL: the wheel is a NUMERIC LTR ISLAND — values ascend left-to-right in every locale
 * (numerals are LTR; this matches rulers, steppers, sliders, and keypads even in Hebrew
 * UIs). `direction:'ltr'` on the wrap AND on the scroller pins the native layout, so the
 * track, the offsets, and the read are cartesian in both locales. The form row AROUND
 * the wheel still mirrors (label side, where the field sits) via its parent.
 *
 * Why a ScrollView and not a FlatList: under `I18nManager.forceRTL(true)` RN's
 * VirtualizedList applies its own JS-side RTL conversions — `scrollToOffset` is flipped
 * through `cartesianOffset(offset + visibleLength)` (the exact `max+min-value` mirror
 * Build #18 hit: age 28→76, weight 82→203.5, reps 8→42), and the internal render-window
 * metrics use the same flipped coordinates. Against this LTR-island content the window
 * lands at the WRONG END, so any wheel larger than the initial render (weight: 431
 * detents, in-session load: 1001) showed a BLANK track (Build #22). A plain ScrollView
 * has none of that machinery: `scrollTo` passes cartesian x straight to native, the read
 * (`contentOffset.x`) is direct, and rendering is ours — a fixed window of cells around
 * the active detent between two exact-width spacers, so content size never changes and
 * far targets are always populated.
 */

// 

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  type AccessibilityActionEvent,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Line, Rect, Stop } from 'react-native-svg';
import { Icon } from '@/components/Icon';
import { color, font, textScale, stage } from '@/design/tokens';
import { selection as selectionHaptic } from '@/platform/haptics';

interface Props {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min: number;
  max: number;
  unit?: string;
  size?: 'md' | 'lg' | 'xl';
  format?: (v: number) => string;
  /** Accessibility label (e.g. "Age", "Actual weight") — the visible field legend, for VoiceOver. */
  label?: string;
  /** Render on the inverted workout stage (the in-workout Edit Result). Kept for the fade colour;
   *  the whole app is on the dark stage now, so the geometry is identical either way. */
  onStage?: boolean;
  /** How the track's ends read — see the render for why the edit dial differs from a ruler. */
  ends?: 'fade' | 'chevron';
  /**
   * A quiet moss point struck under ONE value on the track — the owner names its meaning (the
   * live stage marks "last time" with it, 2026-08-26). It rides the scrolling numerals, so it is
   * simply where that value is: under the centre when she stands on it, off in the margin when
   * she has moved, out of the window when it is far. Values off the detent grid round to the
   * nearest cell; values outside [min, max] draw nothing.
   */
  marker?: number;
  style?: ViewStyle | ViewStyle[];
}

/**
 * The detent pitch — and the width of the cell a numeral is centred in.
 *
 * 86 until build 36, where the founder photographed the onboarding ruler rendering "82…": at 42px
 * mono a four-glyph value ("82.5") measures ~100pt, and a `numberOfLines={1}` Text in an 86pt cell
 * ellipsises. 96 gives the enlarged numeral (below) room for five glyphs — "137.5" is the widest
 * load the engine prescribes — without its edge reaching the dimmed neighbour beside it.
 *
 * The cost, stated: about four numerals are legible at once on a 390pt control rather than the
 * header's "five at a time". The alternative was a smaller numeral, which is the opposite of what
 * the founder asked for twice (2026-07-28, and C.8).
 */
const ITEM_W = { md: 96, lg: 120, xl: 132 } as const;

/**
 * ════ ONE WHEEL, ONE SIZE, EVERYWHERE (founder 2026-07-28) ════
 *
 * *"Enlarge them, and let that size be uniform for every wheel in the app."*
 *
 * There were two: `md` for the onboarding rulers (76 tall, 30 pt numeral) and `lg` for the
 * in-workout edit dial (88 / 32). Two tables meant two answers to the same question — how big is a
 * wheel — and the answer drifted the moment either screen was touched. It also made the onboarding
 * ruler, the FIRST control the athlete ever turns, the smaller of the two.
 *
 * Now there is one measurement and both names resolve to it, so a call site cannot pick the wrong
 * one and there is nothing left to drift. The `size` prop survives only so existing call sites keep
 * compiling; it selects nothing. `everyWheelIsTheSameWheel` holds this shut.
 */
export const WHEEL_HEIGHT = { md: 112, lg: 146, xl: 164 } as const;

/** The numeral sizes by distance from centre. Past ±2 the numeral is gone — five read at a time,
 *  the rest is the tick texture. One ladder, both sizes (see WHEEL_HEIGHT). */
/* xl (2026-08-26): the live stage's own tier — the founder's gym rule, 'בזמן אימון הכל צריך
   להיות ברור מהרגע הראשון'. One step over the editor-era lg, still inside numCellW's arithmetic. */
const NUM_SIZE = { md: [48, 24, 18], lg: [64, 30, 22], xl: [78, 34, 24] } as const;

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ THE NUMERAL'S OWN BOX — AND WHY IT IS PER SIZE (founder, 2026-08-12)
 *
 *   *"למה מסך THE EDIT SET בסרגל שם זה עושה ככה את המספרים שלא שלמים? במסך בONBORDING זה מציג את
 *   המשקל נהדר במקרה הזה."*
 *
 * He photographed the edit dial reading **"37…"** where the value was 37.5, and the onboarding
 * ruler drawing the same shape of number correctly — which was the tell. This is build 36's "82…"
 * bug (C.2) arriving a second time through the door that fix left open.
 *
 * ⚠️ THE FIRST FIX PINNED A CONSTANT, NOT A RELATIONSHIP. `NUM_CELL_W` was a single 176, measured
 * against a 48-point numeral, and its centring margin was hardcoded to `ITEM_W.md`. So the cell was
 * only ever correct while every size was the same size — and the moment this control is asked to
 * grow (which is the other half of the same message) it truncates again, in exactly the same way.
 *
 * **It is derived now.** Six glyphs of IBM Plex Mono at the active size, which is the widest thing
 * the engine can prescribe ("137.5") with room to spare, plus the centring margin computed from the
 * size's OWN pitch. A cell that cannot be too small for its numeral by construction.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
/** IBM Plex Mono's advance, measured: 0.6 em. Six glyphs is the widest prescribable value + room. */
const GLYPH_EM = 0.6;

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ THE NUMERAL OUTGREW ITS OWN PITCH (found 2026-08-27, on `2.2d` — "the widest load")
 *
 * The note above ends *"the overhang lands over the dimmed neighbour's CELL, not its glyphs: at
 * distance 1 the numeral is less than half this size and centred too."* That is a RELATIONSHIP —
 * the centre's ink must stop before the neighbour's ink starts — and it was asserted rather than
 * enforced. It was true when it was written, at `md`, and it stopped being true twice since:
 *
 *     size  pitch   ink of "137.5" (half)   room before the neighbour's ink
 *     md      96          144  (72)                  74      ✓ by 2 points
 *     lg     120          192  (96)                  93      ⛔ over by 3
 *     xl     132          234 (117)                 101      ⛔ over by 16
 *
 * The numeral was enlarged twice on founder rulings (48 → 64 → 78, ×1.63) and the pitch followed at
 * ×1.38. On the live stage the result is measurable: `137.5` renders 55→336 on a 390-point frame
 * while its neighbours render −77→204 and 187→468. **Both neighbours are partly off the screen and
 * underneath the value.** This is the same shape as C.2 and its two recurrences — *"THE FIRST FIX
 * PINNED A CONSTANT, NOT A RELATIONSHIP"* — one level up: the constant this time was the SIZE.
 *
 * ── WHY SHRINKING, AND ONLY HERE ────────────────────────────────────────────────────────────────
 * Widening the pitch until five glyphs fit needs ~264 points, which puts one and a half numerals on
 * a phone and stops it being a wheel. Hiding the neighbours removes the only thing that says which
 * way the track runs. So the centre numeral yields — and ONLY for the values that cannot physically
 * fit: at `xl` a four-glyph value like "82.5" needs 94 of its 101 points and keeps the full 78.
 * `137.5` takes 67. Every founder ruling about size is about the numeral being BIG, and it stays
 * big; what it may not be is bigger than the room it has.
 *
 * ⚠️ AND IT IS DERIVED. The app already had this pattern — `ShareCard`'s figure scales by glyph
 * count — but as a hand-tuned ladder (`cells <= 4 ? 1 : cells <= 5.5 ? 0.78 : 0.66`). A ladder is a
 * constant wearing a function's clothes; it would have to be re-tuned the next time the numeral
 * grows. This computes the room and fills it.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
/**
 * Air between the value's last glyph and the neighbour's first.
 *
 * Without it the arithmetic fills the room exactly and the two numbers TOUCH — measured on `2.2d`,
 * `137.5` ended at 294 and `140` began at 294. Two numerals that meet read as one longer numeral,
 * which is the same lie truncation tells, arriving from the other side.
 *
 * ⚠️ SEVEN, AND THE NUMBER IS CHOSEN AGAINST THE FOUNDER'S RULINGS, NOT FOR COMFORT. Every ruling
 * about this control is that the numeral must be BIG (2026-07-28, C.8, *"בזמן אימון הכל צריך להיות
 * ברור מהרגע הראשון"*). Twelve points of air reads better and costs `82.5` — a FOUR-glyph value, the
 * common case — four points of size at `xl`. Seven is the most air that can be taken before the
 * common case pays for it: at every tier a three- or four-glyph value keeps the full mandated size,
 * and only the five-glyph values, which cannot fit at any price, yield.
 */
const INK_GAP = 7;

/** How far from the wheel's centre the nearest neighbour's INK begins, less the air between them. */
const inkRoom = (size: 'md' | 'lg' | 'xl'): number =>
  ITEM_W[size] - (3 * GLYPH_EM * NUM_SIZE[size][1]) / 2 - INK_GAP;

/** The centre numeral's size for a value of `glyphs` characters — its own size, or as much of it
 *  as fits before the neighbour's ink. */
const centreSize = (size: 'md' | 'lg' | 'xl', glyphs: number): number => {
  const base = NUM_SIZE[size][0];
  const halfInk = (glyphs * GLYPH_EM * base) / 2;
  const room = inkRoom(size);
  return halfInk <= room ? base : Math.floor((room * 2) / (glyphs * GLYPH_EM));
};

/*
 * ══════ ⚠️ THE OUTERMOST NEIGHBOUR IS CLIPPED, AND THAT IS THE SETTLED ANSWER (2026-08-27) ══════
 *
 * Recorded so it is not re-opened a fourth time. The window shows about 2.6 cells of an `xl` track,
 * so the dimmed neighbours are half outside BY CONSTRUCTION — that is the instrument. Measured on
 * `2.2h`: `32.5` inks 15→87 in a scroller clipping at 26, so about eleven points of the leading
 * digit is cut. Three cures were built and measured, and all three are worse:
 *
 *   · RESTORE `EdgeFade` UNDER THE CHEVRONS. It paints a gradient of an OPAQUE colour. The set
 *     stage's band is transparent over a breathing ground, so on stage it draws a visible slab with
 *     hard corners around the whole wheel. A scrim can only dissolve what it matches.
 *   · WIDEN THE APERTURE to the screen's edges. `styles.scale` clips at its own width and does not
 *     stretch with the scroller, so the two disagree and the numerals leave.
 *   · SHRINK THE NEIGHBOUR until its ink fits, the rule `centreSize` uses at the other edge. Built
 *     and measured: the analytic cell centre (`width / 2 - dist * itemW`) misses the laid-out box by
 *     about twelve points, so 34 → 30 STILL cut, and fitting honestly needs about 21 — a neighbour a
 *     quarter of the hero, illegible. Smaller and still cut is worse than bigger and still cut.
 *
 * ⚠️ AND IT READS. The cut lands on the left stem of the leading digit, on a numeral that is
 * already dimmed and is never the value she is acting on; the detent she is on is 78 points tall in
 * the middle of the window. A dial whose track runs past its window is what a dial looks like.
 */
/** The numeral's box, derived from the numeral ACTUALLY drawn — see `numCellW`'s note. A neighbour
 *  is drawn at a third of the centre's size and was being given the centre's box, which is why its
 *  overhang ran off the screen rather than over the cell beside it. */
const numCellW = (size: 'md' | 'lg' | 'xl', px: number): number => Math.ceil(px * GLYPH_EM * 6);
/**
 * The TONE ladder by distance, per size — and the two are deliberately different.
 *
 * On the onboarding rulers (md) the whole axis is browsable, so the far pair stays legible. On the
 * in-workout edit dial (lg) the far pair recedes almost into the ground: under a bar the only
 * number that matters is the one struck at centre, and the neighbours are there to say which way
 * the track runs, not to be read.
 */
const NUM_TONE = {
  md: ['#948c77', '#8b8474'],
  lg: ['#8b8474', '#57534a'],
  xl: ['#8b8474', '#57534a'],
} as const;
// (The TONE ladder stays per-context — how far the neighbours recede is about the room the wheel is
// turned in, not about its size. Under a bar only the struck number matters; in onboarding the
// whole axis is being browsed.)
/** How many detents each side of centre still render a numeral (five total). */
const SHOW_SPAN = 2;
/** The engraved tick strip beneath the numerals — an even graduation, scaled with the wheel. */
const TICK_STRIP = { md: { w: 230, h: 16 }, lg: { w: 300, h: 22 }, xl: { w: 316, h: 24 } } as const;
/** How far the graduation sits off the bottom hairline — the old flow layout's own breathing room
 *  (frame 112 − numerals 62 − gap 8 − strip 16, halved), kept exactly so nothing visibly moved when
 *  the strip left the flow and went behind the touch surface (C.3). */
const TICK_INSET = 13;
const TICK_GAP = 12.5; // px between fine graduations (v7)

/** Rendered cells each side of the window anchor. 56 × 64px ≈ 8 screen-widths of
 *  populated track per side — beyond what one fling covers before the next window
 *  update lands (the anchor re-centers on every scroll tick past the guard). */
const WINDOW = 56;
/** Re-anchor when the active detent drifts this far from the window anchor. */
const WINDOW_GUARD = 24;
/** Minimum spacing between detent ticks — the fling can cross detents far faster than a
 *  haptic should fire (see onScroll). */
const HAPTIC_MIN_MS = 45;

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Build the value track min..max inclusive (rounded to kill float drift).
 *
 * ════ ⛔ AND THE CONTROLLED VALUE IS ALWAYS ON IT (2026-08-26) ════
 *
 * The ladder used to be `min + n·step` and nothing else, and the wheel then drew **the nearest rung
 * to the value it was handed** — silently, because `indexOfValue` rounds. On the live set stage that
 * is not a rounding error, it is a different number:
 *
 *     prescribed 34    kg, barbell (floor 20, step 2.5)  → the dial read 35
 *     prescribed 31.5  kg, after Loop 2 eased her        → the dial read 32.5
 *     prescribed 12.5  kg, dumbbell (floor 0, step 1)    → the dial read 13
 *
 * …while `Complete Set` logs the PRESCRIPTION. So the largest figure on the most-used screen in the
 * product disagreed with the set that went into her history, and it disagreed upwards.
 *
 * ⚠️ THE TWO GRIDS WERE NEVER THE SAME GRID, and that is the root of it. This ladder is naive
 * arithmetic; the ENGINE prescribes off `grid.snapDown`, which uses **her own performed rungs**
 * inside the range she has actually lifted in (a machine stack, the plates her gym owns) and B-6's
 * increment only outside it. Any load she has really used that is not `floor + n·step` — which is
 * most machine stacks — could not be drawn by this control at all.
 *
 * ── WHY INSERTED RATHER THAN PHASE-SHIFTED ──────────────────────────────────────────────────────
 * Re-phasing the whole ladder onto the value (`value ± n·step`) also draws it truthfully, and it
 * takes every ROUND number away from her: at 31.5 the detents become 29 / 31.5 / 34 and 30 stops
 * existing. Inserting keeps every rung the wheel could reach before and adds the one it could not,
 * so nothing she could select yesterday is unreachable today. The cost is one irregular gap beside
 * the inserted value, on a strip whose ticks are continuous texture anyway.
 *
 * ⚠️ NOTHING CHANGES FOR A VALUE ALREADY ON THE LADDER — which is every intake ruler in the app.
 */
function buildValues(min: number, max: number, step: number, value?: number): number[] {
  const out: number[] = [];
  const n = Math.round((max - min) / step);
  for (let i = 0; i <= n; i++) out.push(round3(min + i * step));
  if (value == null || !Number.isFinite(value)) return out;
  const v = round3(value);
  /* Out of range is CLAMPED, not inserted: `min`/`max` are the room's own bounds (the empty bar,
     the top of the stack) and a control may not mint a load outside them to be honest about one. */
  if (v < min || v > max || out.includes(v)) return out;
  const at = out.findIndex((x) => x > v);
  out.splice(at < 0 ? out.length : at, 0, v);
  return out;
}

/**
 * The index of the detent nearest `v` on a track that is no longer arithmetic.
 *
 * ⚠️ IT REPLACED `Math.round((v - min) / step)`, WHICH IS NOW WRONG BY ONE for every value above an
 * inserted one — and the wrongness is invisible: the wheel would simply position on, and mark, the
 * neighbouring cell. Binary search because the track runs to ~1,100 cells (1,100 lb at 1 lb) and
 * this is called from a layout effect on every value change.
 */
function nearestIndex(values: number[], v: number): number {
  let lo = 0;
  let hi = values.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  // `lo` is the first value >= v; the answer is it or the one before it.
  if (lo > 0 && Math.abs(values[lo - 1] - v) <= Math.abs(values[lo] - v)) return lo - 1;
  return lo;
}

/**
 * The scroll offset (px) to request so that value-index `i` is centered. IDENTITY in
 * both locales: ScrollView.scrollTo carries no RTL conversion, and the track itself is
 * a `direction:'ltr'` island. Pure + exported so the positioning invariant stays under
 * unit coverage (the Build #18/#22 regressions lived exactly here).
 */
export function wheelOffset(i: number, itemW: number): number {
  return i * itemW;
}

/**
 * The centered value-index read back from a settled `contentOffset.x` — direct in both
 * locales, the exact inverse of `wheelOffset`. Caller clamps to the track bounds.
 */
export function wheelIndexFromOffset(x: number, itemW: number): number {
  return Math.round(x / itemW);
}

/**
 * The rendered window [start, end) around `anchor`, clamped to the track. Everything
 * outside is two exact-width spacers, so content width (hence every offset) is
 * identical to a fully-rendered track. Pure + exported for unit coverage.
 */
export function wheelWindow(anchor: number, count: number, win: number = WINDOW): { start: number; end: number } {
  return { start: Math.max(0, anchor - win), end: Math.min(count, anchor + win + 1) };
}

export function WheelPicker({ value, onChange, step = 1, min, max, unit = '', size = 'md', format, label, onStage = false, ends = 'fade', marker, style }: Props) {
  const itemW = ITEM_W[size];
  /* ⛔ The box and the overhang are now computed PER NUMERAL, from the size that numeral is
     actually drawn at — see the note over `centreSize`. They were computed once, from the CENTRE's
     size, and handed to every numeral including the ones a third of it. */
  const tick = TICK_STRIP[size];
  const h = WHEEL_HEIGHT[size];
  const numSize = NUM_SIZE[size];
  const numTone = NUM_TONE[size];
  /* `value` joins the deps because the track now guarantees it is ON the ladder — see buildValues. */
  const values = useMemo(() => buildValues(min, max, step, value), [min, max, step, value]);
  const listRef = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const lastIndexRef = useRef<number>(-1);
  const lastHapticRef = useRef(0);

  const clampIndex = useCallback(
    (i: number) => Math.min(values.length - 1, Math.max(0, i)),
    [values.length],
  );
  const indexOfValue = useCallback((v: number) => clampIndex(nearestIndex(values, v)), [clampIndex, values]);
  const [activeIndex, setActiveIndex] = useState(() => indexOfValue(value));
  const [anchor, setAnchor] = useState(() => indexOfValue(value));

  // Position the wheel on the controlled value — the single writer. The window is
  // re-anchored FIRST so the target cells exist when the scroll lands (content size is
  // constant, so the offset itself never depends on what is rendered).
  const positionToValue = useCallback(() => {
    if (width === 0) return;
    const target = indexOfValue(value);
    lastIndexRef.current = target;
    setActiveIndex(target);
    setAnchor(target);
    listRef.current?.scrollTo({ x: wheelOffset(target, itemW), animated: false });
  }, [width, indexOfValue, value, itemW]);

  useEffect(() => {
    if (width === 0) return;
    if (indexOfValue(value) === lastIndexRef.current) return;
    const raf = requestAnimationFrame(positionToValue);
    return () => cancelAnimationFrame(raf);
  }, [value, width, indexOfValue, positionToValue]);

  const sidePad = width > 0 ? Math.max(0, (width - itemW) / 2) : 0;

  // Track the centered detent as the wheel moves — fire a tick + report on change, and
  // slide the render window along when the detent nears its edge.
  //
  // The tick is THROTTLED (founder 2026-07-10, with the fling physics): a momentum fling now
  // sweeps tens of detents, and one selection haptic per detent would be a continuous buzz —
  // and tens of native calls per second. A tick at most every HAPTIC_MIN_MS keeps the texture
  // of a wheel passing under the finger while a fast spin just hums quietly.
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = clampIndex(wheelIndexFromOffset(e.nativeEvent.contentOffset.x, itemW));
      if (idx !== activeIndex) {
        setActiveIndex(idx);
        const now = Date.now();
        if (now - lastHapticRef.current >= HAPTIC_MIN_MS) {
          lastHapticRef.current = now;
          selectionHaptic();
        }
      }
      if (Math.abs(idx - anchor) > WINDOW_GUARD) setAnchor(idx);
    },
    [activeIndex, anchor, clampIndex, itemW],
  );

  // Commit the settled detent.
  const onSettle = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = clampIndex(wheelIndexFromOffset(e.nativeEvent.contentOffset.x, itemW));
      lastIndexRef.current = idx;
      const v = values[idx];
      if (v !== value) onChange(v);
    },
    [clampIndex, itemW, onChange, value, values],
  );

  // VoiceOver increment/decrement rotor → step one detent and re-center.
  const nudge = useCallback(
    (dir: 1 | -1) => {
      const idx = clampIndex(indexOfValue(value) + dir);
      const v = values[idx];
      if (v === value) return;
      lastIndexRef.current = idx;
      setActiveIndex(idx);
      setAnchor(idx);
      onChange(v);
      listRef.current?.scrollTo({ x: wheelOffset(idx, itemW), animated: true });
      selectionHaptic();
    },
    [clampIndex, indexOfValue, itemW, onChange, value, values],
  );
  const onAccessibilityAction = useCallback(
    (e: AccessibilityActionEvent) => {
      if (e.nativeEvent.actionName === 'increment') nudge(1);
      else if (e.nativeEvent.actionName === 'decrement') nudge(-1);
    },
    [nudge],
  );

  const valueText = `${format ? format(value) : String(value)}${unit ? ` ${unit}` : ''}`;
  const win = wheelWindow(anchor, values.length);
  /** The stage ground the scale stands on — the edge fades dissolve into it. */
  const surfaceNow = onStage ? stage[1] : stage[0];

  return (
    <View
      style={[styles.wrap, { height: h }, style]}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: valueText }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAccessibilityAction}
    >
      <View style={styles.scale} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {/* The numerals — a scrolling readout, five at a time. */}
        <View style={styles.numRow}>
          {width > 0 ? (
            <ScrollView
              ref={listRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              // Fling physics (founder 2026-07-10): a flick must GLIDE — reaching a value
              // 20+ detents away is one light swipe, not ten. `disableIntervalMomentum`
              // (which killed every fling at the very next detent) is deliberately absent,
              // and deceleration is "normal" so momentum carries across long tracks;
              // snapToInterval still lands the settle exactly on a detent.
              snapToInterval={itemW}
              decelerationRate="normal"
              style={styles.scroller}
              contentContainerStyle={[styles.scrollContent, { paddingHorizontal: sidePad }]}
              // Re-assert the centered value once the track is measured — the imperative
              // scroll needs real content dimensions to land a far target.
              onContentSizeChange={positionToValue}
              onScroll={onScroll}
              scrollEventThrottle={16}
              onMomentumScrollEnd={onSettle}
              onScrollEndDrag={onSettle}
              importantForAccessibility="no-hide-descendants"
            >
              {/* Exact-width spacers keep content size identical to a full track. */}
              <View style={{ width: win.start * itemW }} />
              {values.slice(win.start, win.end).map((item, k) => {
                const index = win.start + k;
                const dist = Math.abs(index - activeIndex);
                /* The owner's marked value (see `marker`): the dot lives INSIDE its value's cell,
                   so it scrolls with the track for free — no layout arithmetic to drift. Drawn in
                   the spacer branch too: a marked value just past the numeral window still shows
                   its point in the margin, which is the "it is over there" the mark exists for. */
                /* ⚠️ THROUGH `indexOfValue`, NOT ARITHMETIC. This read `Math.round((marker - min) / step)`,
                   which is off by one for every cell above an inserted value — so last time's dot
                   would sit on the wrong detent on exactly the sets where the load is interesting. */
                const marked = marker != null && marker >= min && marker <= max && index === indexOfValue(marker);
                if (dist > SHOW_SPAN)
                  return (
                    <View key={item} style={[styles.item, { width: itemW }]}>
                      {marked ? <View style={styles.markerDot} /> : null}
                    </View>
                  );
                const active = dist === 0;
                /*
                  ⛔ THE SIZE, THE BOX AND THE OVERHANG ARE ONE DECISION, MADE PER NUMERAL
                  (2026-08-27 — see the note over `centreSize`).

                  All three were computed once, from the CENTRE's size, and given to every numeral —
                  so a neighbour drawn at 34 carried the 78-point numeral's 281-point box and hung it
                  77 points off the edge of the phone. And the centre kept its full size even when
                  its own ink would reach the neighbour's.
                */
                const text = format ? format(item) : String(item);
                const px = active ? centreSize(size, text.length) : numSize[dist];
                const box = numCellW(size, px);
                const inset = Math.max(0, (box - itemW) / 2);
                return (
                  <View key={item} style={[styles.item, { width: itemW }]}>
                    {marked ? <View style={styles.markerDot} /> : null}
                    {/*
                      ⛔ FOURTH ATTEMPT, AND THE FIRST ONE THAT NAMES THE FAILURE (founder, 2026-08-21).

                      He photographed the edit dial reading a huge **5** with a clipped `41.` above
                      it, where the value was 41.5 and the header beside it said "planned 41.5".

                      The third attempt removed `numberOfLines={1}` and made this absolute, on the
                      reasoning that "one with no width cannot be truncated". Half true, and the
                      dangerous half: an absolutely-positioned Text with neither `left` nor `right`
                      is still laid out against its parent's width, so 41.5 at 64pt mono (~192pt)
                      inside a 120pt cell no longer ellipsised — **it WRAPPED**. `bottom: 0` then put
                      the last line on the baseline and pushed `41.` up out of the strip.

                      ⚠️ THAT IS WORSE THAN THE BUG IT REPLACED. "41…" tells her a number is cut off.
                      A lone `5` reads as the value, at the size of a fist, on the one control that
                      writes to her training history.

                      **A definite box, wider than its cell, centred by symmetric negative insets.**
                      Six glyphs at the ACTIVE size (`numCellW`) — the widest thing the engine can
                      prescribe is five ("137.5") — so the text has a real width to centre in, cannot
                      wrap, and cannot be squeezed by the row. `numberOfLines={1}` comes back as the
                      backstop it always should have been: with a box this wide nothing reaches it,
                      and if anything ever did, an ellipsis SAYS so where a wrap lies.
                    */}
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.num,
                        {
                          // The overhang lands over the dimmed neighbour's CELL, not its glyphs:
                          // at distance 1 the numeral is less than half this size and centred too.
                          left: -inset,
                          right: -inset,
                          // react-native-web gives Text a default `maxWidth: 100%`, which clamps
                          // the overhung box back to the cell and re-creates "37…" ON WEB ONLY —
                          // the third arrival of C.2, through a platform default this time
                          // (eye-pass 2026-08-26). Stating the box's own width closes it on both.
                          maxWidth: box,
                          fontSize: px,
                          fontFamily: active ? font.monoSemibold : font.mono, // rtl-ok — `styles.num` centres it; this only swaps the face
                          // Three distances, three tones — see NUM_TONE for why the ladder differs
                          // between an onboarding ruler and the in-workout edit dial.
                          color: active ? color.textPrimary : numTone[dist === 1 ? 0 : 1],
                        },
                      ]}
                    >
                      {text}
                    </Text>
                  </View>
                );
              })}
              <View style={{ width: (values.length - win.end) * itemW }} />
            </ScrollView>
          ) : null}
        </View>

        {/* The engraved tick strip — a fixed, even graduation, struck at centre by one moss tick.
            It is drawn BEHIND the scroller and takes no touches, so the ruler-looking part of the
            control now turns the wheel instead of swallowing the gesture (C.3). */}
        <View pointerEvents="none" style={styles.ticksLayer}>
          <TickStrip w={tick.w} h={tick.h} />
        </View>

        {/*
          ════════ ⛔ THE NUDGE WAS DRAWN THROUGH THE NUMERAL IT NUDGES (2026-08-27) ════════

          Measured on `2.2h`: the ghost `32.5` inks 17→100 and the start chevron sat at 34→50, on the
          same line. `2.2d` had it on both ends at once. **On the primary instrument of the product,
          the thing she reads mid-set**, the control was struck through the value.

          ⚠️ AND THE FIRST CURE WAS WORSE, which is worth recording so it is not tried again. The
          two ends treatments are written as alternatives (`fade` OR `chevron`), so choosing the
          control deletes the dissolve — and restoring the dissolve looked like the fix. It is not:
          `EdgeFade` paints a gradient of an OPAQUE colour, and the set stage's band is transparent
          over a breathing ground. On stage it drew a visible slab with hard corners around the
          whole wheel. A scrim can only dissolve what it matches.

          ⚠️ SO THEY ARE SEPARATED BY ROW, NOT BY LAYER. The chevron belongs to the TRACK, not to
          the numerals — it moves the track by one detent — so it sits on the graduation's own line,
          where the only ink is hairlines. It reads better there too: a mark at each end of the
          ruler says "this ruler runs further", which is the sentence it was always trying to say.
        */}
        {ends === 'chevron' ? (
          <>
            {/* A chevron that LOOKS tappable must BE tappable (eye-pass 2026-08-25): each end
                nudges one detent. The track runs low→high left→right in BOTH layout directions
                (the ruler is an instrument, not prose), so left is always the previous value.

                ⚠️ Mid-workout the athlete has not browsed this axis before and needs telling that
                it moves at all — which is why this wheel, alone, carries them. */}
            <Pressable hitSlop={14} onPress={() => nudge(-1)} style={[styles.endChevron, styles.endChevronStart]}>
              <Icon name="chevronLeft" size={16} color={color.textMuted} strokeWidth={2} noMirror />
            </Pressable>
            <Pressable hitSlop={14} onPress={() => nudge(1)} style={[styles.endChevron, styles.endChevronEnd]}>
              <Icon name="chevronRight" size={16} color={color.textMuted} strokeWidth={2} noMirror />
            </Pressable>
          </>
        ) : null}
      </View>

      {unit ? (
        <View style={styles.unitBox}>
          <Text style={styles.unit}>{unit}</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The engraved scale beneath the numerals — a continuous fine graduation that does NOT move
 * (a printed scale doesn't slide; the reading does), struck at dead centre by a single moss
 * tick: the one unambiguous "this is your number".
 */
function TickStrip({ w, h }: { w: number; h: number }) {
  const half = w / 2;
  const ticks: number[] = [];
  for (let x = 0; x <= w + 0.01; x += TICK_GAP) ticks.push(Math.round(x * 10) / 10);
  return (
    <View pointerEvents="none" style={[styles.tickStrip, { width: w, height: h }]}>
      <Svg width={w} height={h}>
        {ticks.map((x) => (
          <Line key={x} x1={x} y1={h * 0.44} x2={x} y2={h} stroke="rgba(241,238,229,0.28)" strokeWidth={1} />
        ))}
        <Line x1={half} y1={0} x2={half} y2={h} stroke={color.accent} strokeWidth={2} strokeLinecap="round" />
      </Svg>
    </View>
  );
}

/**
 * A soft dissolve at one end of the scale — the stage colour fading to nothing over 44px (v7).
 *
 * The gradient id is per-INSTANCE (`useId`). Several of these mount side by side, and a shared
 * `url(#…)` reference is precisely the kind of thing that resolves to the wrong brush.
 */
function EdgeFade({ side, color: c }: { side: 'start' | 'end'; color: string }) {
  // React's useId returns a value wrapped in COLONS (":r3:"). A colon is not legal in an SVG
  // fragment reference — `url(#:r3:)` is not a reference to anything — so it is stripped down to
  // the bare token before it is ever used as an id.
  const id = `wheelFade-${side}-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View pointerEvents="none" style={[styles.fade, side === 'start' ? styles.fadeStart : styles.fadeEnd]}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1={side === 'start' ? '0' : '1'} y1="0" x2={side === 'start' ? '1' : '0'} y2="0">
            <Stop offset="0" stopColor={c} stopOpacity={1} />
            <Stop offset="1" stopColor={c} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

const FADE_W = 44;

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'stretch',
    // LTR island — the numeric wheel never mirrors (see header). A no-op in the LTR
    // build; under forceRTL it keeps digits ascending L→R and the offset math intact.
    direction: 'ltr',
    // v7 1.4: NO box — the scale is framed by a hairline top and bottom, on the bare stage.
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderControl,
    overflow: 'hidden',
  },
  // The numerals + the tick strip stack, centred in the framed height with air between.
  scale: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, overflow: 'hidden' },
  /**
   * THE WHOLE CONTROL TAKES THE SWIPE (founder, build 36 — C.3).
   *
   * The header has always claimed it — "a sweating hand in a gym should not have to land inside a
   * 44pt box to start scrolling" — and it was not true: the ScrollView lived inside this row and the
   * row was a fixed 54 tall, so the engraved tick strip beneath it, which is the part that LOOKS like
   * a ruler, was dead to touch. The founder had to press the numeral itself to turn the wheel.
   *
   * The row now stretches over the framed height and the scroller fills it; the tick strip is drawn
   * UNDER it, out of the touch path. The numerals keep their own row height for layout, so nothing
   * about the readout moves — only the surface that answers a finger.
   */
  numRow: { alignSelf: 'stretch', flex: 1, justifyContent: 'center', overflow: 'hidden' },
  /** The graduation, held at the foot of the frame and OUT of the touch path (see `numRow`). */
  ticksLayer: { position: 'absolute', left: 0, right: 0, bottom: TICK_INSET, alignItems: 'center' },
  scroller: { direction: 'ltr' },
  // The numerals rest where the flow layout used to put them — clear of the graduation and the gap
  // that separated the two — now that the scroller owns the full frame height for touch (C.3).
  scrollContent: { alignItems: 'flex-end', paddingBottom: TICK_INSET + TICK_STRIP.lg.h + 8 },
  item: { alignItems: 'center', justifyContent: 'flex-end', overflow: 'visible' },
  /* The owner's marked value — a moss point riding above its numeral. Top, not foot: the numerals
     hang at the cells' bottom edge and `numRow` clips overflow, so the foot has no air to give. */
  markerDot: { position: 'absolute', top: 2, alignSelf: 'center', width: 6, height: 6, borderRadius: 3, backgroundColor: color.accent },
  /**
   * The box the numeral is actually measured in — wider than its cell, centred on it by symmetric
   * negative margins (C.2). Sized for SIX glyphs at the active size so nothing the engine can
   * prescribe truncates; the widest real value is five ("137.5"). The overhang lands in the dimmed
   * neighbour's cell, not on its glyphs: at distance 1 the numeral is 24px, so its own text starts
   * further out than this box reaches.
   */
  /* ⛔ DERIVED PER SIZE at the call site — see `numCellW`. It was a constant here, centred against
     `ITEM_W.md`, which is why it could only ever be right while every wheel was the same wheel. */
  num: {
    /* ⛔ OUT OF THE FLOW — see the note at the markup. Absolute, unconstrained, centred by the item
       it hangs in. This is what makes truncation impossible rather than merely unlikely. */
    position: 'absolute',
    bottom: 0,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
    textAlign: 'center',
    lineHeight: undefined,
    /*
     * ⛔ THE BOX MAY NOT BE SHRUNK TO ITS CELL — the other half of the "37…" fault.
     *
     * The numeral's own width is set wider than the detent pitch and pulled back into place with
     * negative margins. That is correct arithmetic and it is not enough: the numeral is a flex
     * child of a `width: itemW` item, and a flex child whose declared width exceeds its line is a
     * candidate for shrinking. Where it shrinks, `numberOfLines={1}` does the rest — the box lands
     * near the pitch and "37.5" comes out "37…", which is a box narrower than its own declaration
     * rather than a numeral wider than its box.
     *
     * ⚠️ AND IT IS WHY THE ARITHMETIC ALONE LOOKED FINE. 176 points holds "37.5" at 48 with room to
     * spare, which is exactly why the first reading of his screenshot did not find a cause: the
     * declared width was never the problem. **Measured on the founder's screenshot, the numeral's
     * box was about 90 points — the detent pitch, not the 176 it asks for.**
     */
    flexShrink: 0,
    flexGrow: 0,
  },

  // The fixed engraved graduation, centred under the numerals.
  tickStrip: { alignItems: 'center', justifyContent: 'center' },
  // The edit dial's end marks — 8 in from each edge, vertically centred, never in the way.
  /* On the graduation's line, not the numerals' — see the note at the markup. The strip sits
     `TICK_INSET` off the bottom and is `h` tall, so this centres on it for the `xl` dial that is
     the only one carrying chevrons; `left`/`right` are deliberate here rather than `start`/`end`,
     because the track runs low→high left→right in both layout directions and so must its ends. */
  endChevron: { position: 'absolute', bottom: TICK_INSET + TICK_STRIP.xl.h / 2 - 8 },
  endChevronStart: { left: 10 },
  endChevronEnd: { right: 10 },

  // the ends dissolve into the stage
  fade: { position: 'absolute', top: 0, bottom: 0, width: FADE_W },
  fadeStart: { start: 0 },
  fadeEnd: { end: 0 },

  // Retained only for the tests / any caller that passes a `unit`; production carries the
  // unit in the field legend and omits it, so this cell never renders there.
  unitBox: { paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center', borderStartWidth: 1, borderStartColor: color.border },
  unit: { fontFamily: font.mono, fontSize: textScale.xs, color: color.textMuted, textAlign: 'left' },
});
