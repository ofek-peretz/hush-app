/**
 * Wheel picker (spec §1.4, §1.5, §1.13). Standard iOS deceleration, live value
 * update, NO added haptics (spec §8.3 — no haptics on system wheel pickers).
 */
import React, { useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { color, type as typo, s } from '@/design/tokens';

const ITEM_HEIGHT = s(44); // 44pt rows — also meets the min tap target law

interface Props {
  values: number[];
  selected: number;
  onChange: (value: number) => void;
  format?: (v: number) => string;
}

export function Wheel({ values, selected, onChange, format }: Props) {
  const ref = useRef<ScrollView>(null);
  const initialIndex = Math.max(0, values.indexOf(selected));

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    const clamped = Math.min(Math.max(idx, 0), values.length - 1);
    const v = values[clamped];
    if (v !== selected) onChange(v);
  };

  return (
    <View style={styles.frame}>
      <View style={styles.selection} pointerEvents="none" />
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        contentOffset={{ x: 0, y: initialIndex * ITEM_HEIGHT }}
        contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * 2 }}
        onMomentumScrollEnd={onMomentumEnd}
        // Also commit on a slow drag with no fling — otherwise the first gentle
        // drag (no momentum) never fires onMomentumScrollEnd and the wheel "sticks".
        onScrollEndDrag={onMomentumEnd}
      >
        {values.map((v) => (
          <View key={v} style={styles.row}>
            <Text style={[styles.label, v === selected && styles.labelSelected]}>
              {format ? format(v) : String(v)}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { height: ITEM_HEIGHT * 5, justifyContent: 'center' },
  selection: {
    position: 'absolute',
    left: s(8),
    right: s(8),
    height: ITEM_HEIGHT - s(8),
    top: ITEM_HEIGHT * 2 + s(4),
    borderRadius: s(12),
    backgroundColor: color.fillSubtle, // rounded-pill highlight (prototype)
  },
  row: { height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: s(typo.titleM.size), color: color.textTertiary },
  labelSelected: { color: color.textPrimary },
});
