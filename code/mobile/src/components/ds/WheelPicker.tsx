/**
 * WheelPicker — a horizontal, swipe-to-value wheel. Replaces the +/- Stepper everywhere a number is
 * chosen (age, height, weight, sessions/week, the in-workout Edit Result), so reaching a distant
 * value is one swipe, not forty taps. Snaps to a centered detent; the selected value is inked, its
 * neighbours fade. A light selection tick fires on each detent. Mono + tabular so digits never jump.
 *
 * The unit sits in its own bordered cell to the side, so the scrolling digits never run under it.
 * The control is an accessible "adjustable" element: VoiceOver reads the label + value and the
 * increment/decrement rotor steps it (parity with the Stepper it replaced).
 *
 * Props mirror the Stepper (value/onChange/min/max/step/unit/format/size).
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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { color, radius, control, font, textScale, stage } from '@/design/tokens';
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

/** Rendered cells each side of the window anchor. 56 × 60px ≈ 8 screen-widths of
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

export function WheelPicker({ value, onChange, step = 1, min, max, unit = '', size = 'md', format, label, onStage = false, style }: Props) {
  const itemW = ITEM_W[size];
  const h = size === 'lg' ? control.hLg : control.h;
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

  return (
    <View
      style={[styles.wrap, onStage && styles.wrapStage, { height: h }, style]}
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
            onMomentumScrollEnd={onSettle}
            onScrollEndDrag={onSettle}
            importantForAccessibility="no-hide-descendants"
          >
            {/* Exact-width spacers keep content size identical to a full track. */}
            <View style={{ width: win.start * itemW }} />
            {values.slice(win.start, win.end).map((item, k) => {
              const index = win.start + k;
              const active = index === activeIndex;
              return (
                <View key={item} style={[styles.item, { width: itemW }]}>
                  <Text
                    style={[
                      styles.num,
                      active ? (onStage ? styles.numActiveStage : styles.numActive) : onStage ? styles.numRestStage : styles.numRest,
                      size === 'lg' && styles.numLg,
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
        {/* Center detent marker — a calm pair of hairline ticks, framing the active value. */}
        <View pointerEvents="none" style={[styles.marker, { width: itemW }]}>
          <View style={styles.tick} />
          <View style={styles.tick} />
        </View>
      </View>
      {unit ? (
        <View style={[styles.unitBox, onStage && styles.unitBoxStage]}>
          <Text style={[styles.unit, onStage && styles.unitStage]}>{unit}</Text>
        </View>
      ) : null}
    </View>
  );
}

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
  item: { alignItems: 'center', justifyContent: 'center' },
  num: {
    fontFamily: font.monoMedium,
    fontVariant: ['tabular-nums'],
    fontSize: textScale.md,
    includeFontPadding: false,
  },
  numLg: { fontSize: textScale.xl },
  numActive: { color: color.textPrimary },
  numRest: { color: color.textTertiary },
  numActiveStage: { color: stage.ink0 },
  numRestStage: { color: stage.ink2 },
  marker: { position: 'absolute', alignSelf: 'center', top: 0, bottom: 0, justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  tick: { width: 22, height: 2, borderRadius: 1, backgroundColor: color.accent },
  // The unit sits in its own bordered cell, separate from the scrolling digits.
  unitBox: { paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center', borderStartWidth: 1, borderStartColor: color.border, backgroundColor: color.surface },
  unit: { fontFamily: font.mono, fontSize: textScale.xs, color: color.textMuted },
  // Inverted "stage" treatment — graphite surface + ink, ochre detent ticks (unchanged).
  wrapStage: { borderColor: stage[2], backgroundColor: stage[1] },
  unitBoxStage: { borderStartColor: stage[2], backgroundColor: stage[1] },
  unitStage: { color: stage.ink2 },
});
