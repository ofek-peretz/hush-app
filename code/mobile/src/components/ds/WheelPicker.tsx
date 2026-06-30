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
 * RTL: the wheel is a NUMERIC LTR ISLAND. A measurement wheel is a number line —
 * values ascend left-to-right in every locale (numerals are LTR; this matches rulers,
 * steppers, sliders, and keypads even in Hebrew UIs), and pinning the control LTR also
 * sidesteps React Native's inverted horizontal-scroll behavior under forceRTL, which
 * would otherwise break the contentOffset/snap math on this precision control. The form
 * row AROUND the wheel still mirrors (label side, where the field sits) via its parent.
 * NOTE: the scroll/snap behavior under forceRTL must be verified on a Hebrew device.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
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

/** Build the value track min..max inclusive (rounded to kill float drift). */
function buildValues(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  const n = Math.round((max - min) / step);
  for (let i = 0; i <= n; i++) out.push(Math.round((min + i * step) * 1000) / 1000);
  return out;
}

export function WheelPicker({ value, onChange, step = 1, min, max, unit = '', size = 'md', format, label, onStage = false, style }: Props) {
  const itemW = ITEM_W[size];
  const h = size === 'lg' ? control.hLg : control.h;
  const values = useMemo(() => buildValues(min, max, step), [min, max, step]);
  const listRef = useRef<FlatList<number>>(null);
  const [width, setWidth] = useState(0);
  const lastIndexRef = useRef<number>(-1);

  const clampIndex = useCallback(
    (i: number) => Math.min(values.length - 1, Math.max(0, i)),
    [values.length],
  );
  const indexOfValue = useCallback(
    (v: number) => clampIndex(Math.round((v - min) / step)),
    [clampIndex, min, step],
  );
  const [activeIndex, setActiveIndex] = useState(() => indexOfValue(value));

  // Center on the controlled value (mount + external change), once the width is known.
  useEffect(() => {
    if (width === 0) return;
    const target = indexOfValue(value);
    if (target !== lastIndexRef.current) {
      lastIndexRef.current = target;
      setActiveIndex(target);
      listRef.current?.scrollToOffset({ offset: target * itemW, animated: false });
    }
  }, [value, width, indexOfValue, itemW]);

  const sidePad = width > 0 ? Math.max(0, (width - itemW) / 2) : 0;

  // Track the centered detent as the wheel moves — fire a tick + report on change.
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = clampIndex(Math.round(e.nativeEvent.contentOffset.x / itemW));
      if (idx !== activeIndex) {
        setActiveIndex(idx);
        selectionHaptic();
      }
    },
    [activeIndex, clampIndex, itemW],
  );

  // Commit the settled detent.
  const onSettle = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = clampIndex(Math.round(e.nativeEvent.contentOffset.x / itemW));
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
      onChange(v);
      listRef.current?.scrollToOffset({ offset: idx * itemW, animated: true });
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
          <FlatList
            ref={listRef}
            data={values}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(v) => String(v)}
            getItemLayout={(_d, index) => ({ length: itemW, offset: itemW * index, index })}
            initialScrollIndex={activeIndex}
            snapToInterval={itemW}
            decelerationRate="fast"
            disableIntervalMomentum
            contentContainerStyle={{ paddingHorizontal: sidePad }}
            onScroll={onScroll}
            scrollEventThrottle={16}
            onMomentumScrollEnd={onSettle}
            onScrollEndDrag={onSettle}
            importantForAccessibility="no-hide-descendants"
            renderItem={({ item, index }) => {
              const active = index === activeIndex;
              return (
                <View style={[styles.item, { width: itemW }]}>
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
            }}
          />
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
