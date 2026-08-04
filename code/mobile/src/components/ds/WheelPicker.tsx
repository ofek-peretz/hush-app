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
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
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
  size?: 'md' | 'lg';
  format?: (v: number) => string;
  /** Accessibility label (e.g. "Age", "Actual weight") — the visible field legend, for VoiceOver. */
  label?: string;
  /** Render on the inverted workout stage (the in-workout Edit Result). Kept for the fade colour;
   *  the whole app is on the dark stage now, so the geometry is identical either way. */
  onStage?: boolean;
  /** How the track's ends read — see the render for why the edit dial differs from a ruler. */
  ends?: 'fade' | 'chevron';
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
const ITEM_W = { md: 96, lg: 96 } as const;

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
export const WHEEL_HEIGHT = { md: 112, lg: 112 } as const;

/** The numeral sizes by distance from centre. Past ±2 the numeral is gone — five read at a time,
 *  the rest is the tick texture. One ladder, both sizes (see WHEEL_HEIGHT). */
const NUM_SIZE = { md: [48, 24, 18], lg: [48, 24, 18] } as const;
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
} as const;
// (The TONE ladder stays per-context — how far the neighbours recede is about the room the wheel is
// turned in, not about its size. Under a bar only the struck number matters; in onboarding the
// whole axis is being browsed.)
/** How many detents each side of centre still render a numeral (five total). */
const SHOW_SPAN = 2;
/** The measured width of the active numeral's own box — six glyphs of mono at the active size, so
 *  nothing the engine can prescribe is ever ellipsised. See `styles.numCell`. */
const NUM_CELL_W = 176;

/** The engraved tick strip beneath the numerals — a fixed, even graduation. */
const TICK_STRIP_W = 230;
const TICK_STRIP_H = 16;
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

/** Build the value track min..max inclusive (rounded to kill float drift). */
function buildValues(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  const n = Math.round((max - min) / step);
  for (let i = 0; i <= n; i++) out.push(Math.round((min + i * step) * 1000) / 1000);
  return out;
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

export function WheelPicker({ value, onChange, step = 1, min, max, unit = '', size = 'md', format, label, onStage = false, ends = 'fade', style }: Props) {
  const itemW = ITEM_W[size];
  const h = WHEEL_HEIGHT[size];
  const numSize = NUM_SIZE[size];
  const numTone = NUM_TONE[size];
  const values = useMemo(() => buildValues(min, max, step), [min, max, step]);
  const listRef = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const lastIndexRef = useRef<number>(-1);
  const lastHapticRef = useRef(0);

  const clampIndex = useCallback(
    (i: number) => Math.min(values.length - 1, Math.max(0, i)),
    [values.length],
  );
  const indexOfValue = useCallback(
    (v: number) => clampIndex(Math.round((v - min) / step)),
    [clampIndex, min, step],
  );
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
                if (dist > SHOW_SPAN) return <View key={item} style={{ width: itemW }} />;
                const active = dist === 0;
                return (
                  <View key={item} style={[styles.item, { width: itemW }]}>
                    {/* THE NUMERAL IS NEVER ELLIPSISED (founder, build 36 — C.2).
                        The cell is `itemW` because that is the detent pitch; the numeral inside it
                        is not. Constrained to the cell, a `numberOfLines={1}` Text truncated the
                        moment the value grew past three glyphs — the founder photographed the
                        onboarding ruler reading "82…" where the value was 82.5. `numCell` is wider
                        than the cell and centred on it by negative margins, so the glyphs get their
                        natural width while the geometry, the snapping and the offset maths keep
                        working in `itemW` exactly as before. */}
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.num,
                        styles.numCell,
                        {
                          fontSize: numSize[dist],
                          fontFamily: active ? font.monoSemibold : font.mono, // rtl-ok — `styles.num` centres it; this only swaps the face
                          // Three distances, three tones — see NUM_TONE for why the ladder differs
                          // between an onboarding ruler and the in-workout edit dial.
                          color: active ? color.textPrimary : numTone[dist === 1 ? 0 : 1],
                        },
                      ]}
                    >
                      {format ? format(item) : String(item)}
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
          <TickStrip />
        </View>

        {/* THE ENDS SAY WHAT THEY ARE. On a ruler they dissolve into the stage — a window onto a
            longer track. On the edit dial (2.2b) they carry a chevron each way instead: mid-workout
            the athlete has not browsed this axis before and needs telling that it moves at all. */}
        {ends === 'fade' ? (
          <>
            <EdgeFade side="start" color={surfaceNow} />
            <EdgeFade side="end" color={surfaceNow} />
          </>
        ) : (
          <>
            <View pointerEvents="none" style={[styles.endChevron, styles.endChevronStart]}>
              <Icon name="chevronLeft" size={16} color={color.textMuted} strokeWidth={2} noMirror />
            </View>
            <View pointerEvents="none" style={[styles.endChevron, styles.endChevronEnd]}>
              <Icon name="chevronRight" size={16} color={color.textMuted} strokeWidth={2} noMirror />
            </View>
          </>
        )}
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
function TickStrip() {
  const half = TICK_STRIP_W / 2;
  const ticks: number[] = [];
  for (let x = 0; x <= TICK_STRIP_W + 0.01; x += TICK_GAP) ticks.push(Math.round(x * 10) / 10);
  return (
    <View pointerEvents="none" style={styles.tickStrip}>
      <Svg width={TICK_STRIP_W} height={TICK_STRIP_H}>
        {ticks.map((x) => (
          <Line key={x} x1={x} y1={7} x2={x} y2={TICK_STRIP_H} stroke="rgba(241,238,229,0.28)" strokeWidth={1} />
        ))}
        <Line x1={half} y1={0} x2={half} y2={TICK_STRIP_H} stroke={color.accent} strokeWidth={1.5} strokeLinecap="round" />
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
  scrollContent: { alignItems: 'flex-end', paddingBottom: TICK_INSET + TICK_STRIP_H + 8 },
  item: { alignItems: 'center', justifyContent: 'flex-end' },
  /**
   * The box the numeral is actually measured in — wider than its cell, centred on it by symmetric
   * negative margins (C.2). Sized for SIX glyphs at the active size so nothing the engine can
   * prescribe truncates; the widest real value is five ("137.5"). The overhang lands in the dimmed
   * neighbour's cell, not on its glyphs: at distance 1 the numeral is 24px, so its own text starts
   * further out than this box reaches.
   */
  numCell: { width: NUM_CELL_W, marginHorizontal: -(NUM_CELL_W - ITEM_W.md) / 2 },
  num: {
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
    textAlign: 'center',
    lineHeight: undefined,
  },

  // The fixed engraved graduation, centred under the numerals.
  tickStrip: { width: TICK_STRIP_W, height: TICK_STRIP_H, alignItems: 'center', justifyContent: 'center' },
  // The edit dial's end marks — 8 in from each edge, vertically centred, never in the way.
  endChevron: { position: 'absolute', top: '50%', marginTop: -8 },
  endChevronStart: { left: 8 },
  endChevronEnd: { right: 8 },

  // the ends dissolve into the stage
  fade: { position: 'absolute', top: 0, bottom: 0, width: FADE_W },
  fadeStart: { start: 0 },
  fadeEnd: { end: 0 },

  // Retained only for the tests / any caller that passes a `unit`; production carries the
  // unit in the field legend and omits it, so this cell never renders there.
  unitBox: { paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center', borderStartWidth: 1, borderStartColor: color.border },
  unit: { fontFamily: font.mono, fontSize: textScale.xs, color: color.textMuted, textAlign: 'left' },
});
