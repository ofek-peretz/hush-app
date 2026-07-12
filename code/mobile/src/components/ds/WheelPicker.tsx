/**
 * WheelPicker — a horizontal, swipe-to-value wheel. Replaces the +/- Stepper everywhere a number is
 * chosen (age, height, weight, sessions/week, the in-workout Edit Result), so reaching a distant
 * value is one swipe, not forty taps.
 *
 * ── THE RULE (founder 2026-07-12) ────────────────────────────────────────────────────────────
 * It is not a list of numbers floating in a box. It is a MEASURING RULE — a machined scale
 * sliding under a fixed index mark, the way a caliper or a good analogue dial reads:
 *
 *   • Ticks. Every detent carries an engraved tick beneath its numeral: a LONG tick for a whole
 *     unit, a SHORT one for a fraction (16.5 kg). The eye judges distance off the ticks in a
 *     fraction of a second, without reading a single digit.
 *   • The anchor. The centre is not "the number that happens to be middle" — it is an ochre index
 *     line that overshoots the scale top and bottom, saying unambiguously: THIS is the value.
 *   • Fisheye. The centred numeral is the largest and fully inked; its neighbours shrink and fade
 *     (60% → 20%) toward the edges. Focus is atomic; the rest of the axis becomes background
 *     texture instead of competing noise.
 *   • Hit target. The whole control — legend, scale and the air beneath it — takes the swipe. A
 *     sweating hand in a gym should not have to land inside a 44pt-tall box to start scrolling.
 *
 * The unit sits in its own bordered cell to the side, so the scrolling digits never run under it.
 * The control is an accessible "adjustable" element: VoiceOver reads the label + value and the
 * increment/decrement rotor steps it (parity with the Stepper it replaced).
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
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { color, radius, font, textScale, stage, signal } from '@/design/tokens';
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
  /** Render on the inverted workout stage — graphite surface + ink, so it never reads as a pasted
   *  light component (the in-workout Edit Result). */
  onStage?: boolean;
  style?: ViewStyle | ViewStyle[];
}

const ITEM_W = { md: 60, lg: 72 } as const;
/**
 * The scale is taller than a plain control: numerals live above, the engraved ticks below.
 * It is also the touch target — a hand in a gym should not have to land inside a 44pt box.
 *
 * But it is NOT free. Body data (onboarding) stacks four of these plus a footer on a screen
 * that must never scroll, so every point here is spent four times over on the smallest phone
 * we support. 56 buys the ruler its numeral row, a legible tick band, and a target 27% larger
 * than the 44pt box it replaced — without eating the step's height budget.
 */
export const WHEEL_HEIGHT = { md: 56, lg: 66 } as const;

/* The scale's geometry, in one place — the anchor line is POSITIONED from it rather than
 * eyeballed, so the index mark always crosses the ticks it is indexing. */
export const NUM_SLOT_H = 26; // the numeral's fixed row (a scaled numeral must not move the ticks)
export const TICK_H = 9; // a whole-unit tick
export const ITEM_PAD_B = 6; // air under the ticks
export const ITEM_H = NUM_SLOT_H + TICK_H + ITEM_PAD_B;
const OVERSHOOT = 4; // how far the anchor runs past the tick band, top and bottom

/** The ochre index line's height and its offset from the control's bottom edge, derived from
 *  the scale above. Pure + exported so the "the anchor crosses the ticks" invariant is tested,
 *  not assumed. */
export function anchorGeometry(controlH: number): { height: number; bottom: number } {
  const contentTop = (controlH - ITEM_H) / 2; // the row is vertically centred in the control
  const tickBottom = contentTop + ITEM_H - ITEM_PAD_B;
  return { height: TICK_H + OVERSHOOT * 2, bottom: controlH - (tickBottom + OVERSHOOT) };
}

/** Rendered cells each side of the window anchor. 56 × 60px ≈ 8 screen-widths of
 *  populated track per side — beyond what one fling covers before the next window
 *  update lands (the anchor re-centers on every scroll tick past the guard). */
const WINDOW = 56;
/** Re-anchor when the active detent drifts this far from the window anchor. */
const WINDOW_GUARD = 24;
/** Minimum spacing between detent ticks — the fling can cross detents far faster than a
 *  haptic should fire (see onScroll). */
const HAPTIC_MIN_MS = 45;
/** How many detents from the centre still render a numeral. Past this the scale is ticks only —
 *  texture, not text (the "atomic focus" rule). */
const FADE_SPAN = 3;

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

/**
 * The fisheye: a detent's scale + opacity as a function of its distance from the centre.
 * The centre is full size and fully inked; each step out shrinks and fades, and past
 * FADE_SPAN the numeral is gone entirely (its tick remains). Pure + exported for coverage —
 * this curve IS the "atomic focus" behaviour, so it is worth pinning.
 */
export function wheelFocus(distance: number): { scale: number; opacity: number } {
  const d = Math.abs(distance);
  if (d === 0) return { scale: 1, opacity: 1 };
  if (d > FADE_SPAN) return { scale: 0.7, opacity: 0 };
  // 1 → 0.60, 2 → 0.36, 3 → 0.20 (a decaying fade, not a linear ramp)
  const opacity = [1, 0.6, 0.36, 0.2][d];
  const scale = 1 - d * 0.1; // 0.9 · 0.8 · 0.7
  return { scale, opacity };
}

/** Is this detent a whole unit (long tick) or a fraction (short tick)? */
function isWholeUnit(v: number): boolean {
  return Math.abs(v - Math.round(v)) < 1e-6;
}

/**
 * THE ENGRAVING (founder 2026-07-12: "the rules work perfectly, but they look plain").
 *
 * A real measuring rule does not draw every graduation the same. It has a HIERARCHY, and that
 * hierarchy is what lets a machinist read a caliper without reading a single digit:
 *   • major  — every fifth whole unit: full height, inked. These are the landmarks the eye counts.
 *   • whole  — a whole unit: two thirds height, quiet.
 *   • half   — a fraction (16.5 kg): a third, quieter still.
 * Pure + exported so the scale's grammar is a tested fact, not a styling accident.
 */
export type TickKind = 'major' | 'whole' | 'half';

export function tickKind(v: number, step: number): TickKind {
  if (step < 1 && !isWholeUnit(v)) return 'half';
  return Math.abs(v) % 5 < 1e-6 ? 'major' : 'whole';
}

export function WheelPicker({ value, onChange, step = 1, min, max, unit = '', size = 'md', format, label, onStage = false, style }: Props) {
  const itemW = ITEM_W[size];
  const h = WHEEL_HEIGHT[size];
  const values = useMemo(() => buildValues(min, max, step), [min, max, step]);
  const listRef = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const lastIndexRef = useRef<number>(-1);
  const lastHapticRef = useRef(0);
  /** A finger is on the rule right now — the instrument lights up (see `wrapLive`). */
  const [live, setLive] = useState(false);

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
      setLive(false);
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
  const numRest = onStage ? stage.ink0 : color.textPrimary;
  const anchorGeo = anchorGeometry(h);
  /** What the scale is standing on RIGHT NOW — the edge fades have to dissolve into it. */
  const surfaceNow = onStage ? stage[1] : live ? color.accentWash : color.surface;

  return (
    <View
      style={[
        styles.wrap,
        onStage && styles.wrapStage,
        // THE INSTRUMENT LIGHTS UP under the finger (founder 2026-07-12): the ochre that
        // marks the value also rings the rule while it is being read. It is the same signal
        // saying the same thing — "this is live" — and it is the whole difference between a
        // control that feels machined and one that feels like a box with numbers in it.
        live && (onStage ? styles.wrapLiveStage : styles.wrapLive),
        { height: h },
        style,
      ]}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: valueText }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAccessibilityAction}
    >
      <View style={styles.scrollArea} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
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
            contentContainerStyle={{ paddingHorizontal: sidePad }}
            // Re-assert the centered value once the track is measured — the imperative
            // scroll needs real content dimensions to land a far target.
            onContentSizeChange={positionToValue}
            onScroll={onScroll}
            scrollEventThrottle={16}
            onScrollBeginDrag={() => setLive(true)}
            onMomentumScrollEnd={onSettle}
            onScrollEndDrag={onSettle}
            importantForAccessibility="no-hide-descendants"
          >
            {/* Exact-width spacers keep content size identical to a full track. */}
            <View style={{ width: win.start * itemW }} />
            {values.slice(win.start, win.end).map((item, k) => {
              const index = win.start + k;
              const dist = index - activeIndex;
              const { scale, opacity } = wheelFocus(dist);
              const kind = tickKind(item, step);
              const active = dist === 0;
              return (
                <View key={item} style={[styles.item, { width: itemW }]}>
                  {/* the numeral — fisheye scaled + faded; gone entirely past the span */}
                  <View style={styles.numSlot}>
                    {opacity > 0 ? (
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.num,
                          size === 'lg' && styles.numLg,
                          {
                            color: active ? (onStage ? stage.ink0 : color.textPrimary) : numRest,
                            opacity,
                            transform: [{ scale }],
                          },
                          active && styles.numActive,
                        ]}
                      >
                        {format ? format(item) : String(item)}
                      </Text>
                    ) : null}
                  </View>
                  {/* the engraved scale — major / whole / half (see tickKind) */}
                  <View
                    style={[
                      styles.scaleTick,
                      kind === 'major' ? styles.tickMajor : kind === 'whole' ? styles.tickWhole : styles.tickHalf,
                      onStage && styles.scaleTickStage,
                      active && styles.scaleTickHidden, // the anchor draws this detent itself
                    ]}
                  />
                </View>
              );
            })}
            <View style={{ width: (values.length - win.end) * itemW }} />
          </ScrollView>
        ) : null}
        {/* The rule's BASELINE — the hairline every graduation stands on. Without it the ticks
            are a row of floating dashes; with it they are a scale. */}
        <View pointerEvents="none" style={[styles.baseline, onStage && styles.baselineStage, { bottom: anchorGeo.bottom + OVERSHOOT }]} />
        {/* The scale runs off both ends rather than stopping at a wall: the numerals dissolve
            into the surface, so the rule reads as a window onto a longer track. */}
        <EdgeFade side="start" color={surfaceNow} />
        <EdgeFade side="end" color={surfaceNow} />
        {/* THE ANCHOR — an ochre index line THROUGH the scale, overshooting the tick band top
            and bottom. Not a pair of decorative ticks: the one unambiguous statement of
            "this is the value". Its geometry is derived from the scale (anchorGeometry), so it
            can never drift off the ticks it indexes. */}
        <View pointerEvents="none" style={styles.anchor}>
          <View style={[styles.anchorLine, { height: anchorGeo.height, marginBottom: anchorGeo.bottom }]} />
        </View>
      </View>
      {unit ? (
        // The unit cell shares the rule's surface — including while it is lit, or it would sit as
        // a cream tab welded onto an ochre instrument.
        <View style={[styles.unitBox, onStage && styles.unitBoxStage, live && !onStage && styles.unitBoxLive]}>
          <Text style={[styles.unit, onStage && styles.unitStage]}>{unit}</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * A soft dissolve at one end of the scale — the surface colour fading to nothing over 34px.
 *
 * `color` is the colour of the surface the scale is ACTUALLY on right now, which changes: the
 * rule tints ochre under the finger. A fade hardcoded to the resting surface would paint a cream
 * smudge over the tint at the exact moment the athlete is looking at it (i.e. mid-scroll).
 *
 * The gradient id is per-INSTANCE (`useId`). Three of these mount side by side on Body data, and
 * a shared `url(#…)` reference is precisely the kind of thing that resolves to the wrong brush.
 */
function EdgeFade({ side, color: c }: { side: 'start' | 'end'; color: string }) {
  const id = `wheelFade-${side}-${useId()}`;
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

const FADE_W = 34;

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'stretch',
    // LTR island — the numeric wheel never mirrors (see header). A no-op in the LTR
    // build; under forceRTL it keeps digits ascending L→R and the offset math intact.
    direction: 'ltr',
    borderWidth: 1,
    borderColor: color.borderControl,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    overflow: 'hidden',
  },
  // The digits live here and are clipped to this box, so they never slide under the unit cell.
  scrollArea: { flex: 1, justifyContent: 'center', overflow: 'hidden' },
  // The scroller itself is pinned LTR too, so its native layoutDirection (and with it
  // the contentOffset coordinate space) never mirrors under forceRTL.
  scroller: { direction: 'ltr' },
  item: { height: ITEM_H, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: ITEM_PAD_B },
  // Fixed-height slot so a scaled numeral never shifts the ticks beneath it.
  numSlot: { height: NUM_SLOT_H, alignItems: 'center', justifyContent: 'center' },
  num: {
    fontFamily: font.monoMedium,
    fontVariant: ['tabular-nums'],
    fontSize: textScale.md,
    includeFontPadding: false,
    textAlign: 'left',
  },
  numLg: { fontSize: textScale.lg },
  // The centred value carries the weight — it is a reading, not a list item.
  numActive: { fontFamily: font.monoSemibold, textAlign: 'left' },

  // the engraved scale — three graduations, the way a real rule is cut
  scaleTick: { width: 1, borderRadius: 0.5, backgroundColor: color.borderControl },
  tickMajor: { height: TICK_H, width: 1.5, backgroundColor: color.textTertiary },
  tickWhole: { height: TICK_H * 0.62 },
  tickHalf: { height: TICK_H * 0.34, opacity: 0.6 },
  scaleTickStage: { backgroundColor: stage[2] },
  scaleTickHidden: { opacity: 0 },

  // the hairline the graduations stand on
  baseline: { position: 'absolute', start: 0, end: 0, height: StyleSheet.hairlineWidth, backgroundColor: color.borderControl },
  baselineStage: { backgroundColor: stage[2] },

  // the ends dissolve into the surface
  fade: { position: 'absolute', top: 0, bottom: 0, width: FADE_W },
  fadeStart: { start: 0 },
  fadeEnd: { end: 0 },

  // the ochre index line (height + offset come from anchorGeometry)
  anchor: { position: 'absolute', alignSelf: 'center', top: 0, bottom: 0, justifyContent: 'flex-end', alignItems: 'center' },
  anchorLine: { width: 2, borderRadius: 1, backgroundColor: signal[0] },

  // The unit sits in its own bordered cell, separate from the scrolling digits.
  unitBox: { paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center', borderStartWidth: 1, borderStartColor: color.border, backgroundColor: color.surface },
  unit: { fontFamily: font.mono, fontSize: textScale.xs, color: color.textMuted, textAlign: 'left' },
  // Under the finger: the ochre closes the loop between the index line and the rule itself.
  wrapLive: { borderColor: signal[0], backgroundColor: color.accentWash },
  wrapLiveStage: { borderColor: signal[0] },

  // Inverted "stage" treatment — graphite surface + ink, ochre anchor (unchanged).
  wrapStage: { borderColor: stage[2], backgroundColor: stage[1] },
  unitBoxLive: { backgroundColor: color.accentWash, borderStartColor: signal[0] },
  unitBoxStage: { borderStartColor: stage[2], backgroundColor: stage[1] },
  unitStage: { color: stage.ink2 },
});
