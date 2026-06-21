/**
 * Metric — 1:1 from the design `components/data/Metric.jsx`.
 * A measured value with a quiet legend. The number is mono + tabular; the unit
 * is subordinate (0.42em of the value). Value first, meaning beneath, nothing
 * else — how every figure in Hush is presented.
 */
import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { color, font, textScale, tracking, trackingPx, stage as stageC } from '@/design/tokens';
import { Legend } from './Legend';

type Size = 'sm' | 'md' | 'lg' | 'xl';

const VALUE_SIZE: Record<Size, number> = {
  sm: textScale.lg, // 20
  md: textScale['2xl'], // 30
  lg: textScale['4xl'], // 48
  xl: textScale['5xl'], // 64
};

interface Props {
  value: string | number;
  unit?: string;
  label?: string;
  size?: Size;
  center?: boolean;
  onStage?: boolean;
  labelTop?: boolean;
  style?: ViewStyle | ViewStyle[];
}

export function Metric({ value, unit, label, size = 'md', center, onStage, labelTop, style }: Props) {
  const vSize = VALUE_SIZE[size];
  const labelEl = label ? (
    <Legend tone={onStage ? 'onStage' : 'muted'} align={center ? 'center' : 'left'}>
      {label}
    </Legend>
  ) : null;
  return (
    <View style={[styles.wrap, center && styles.center, style]}>
      {labelTop && labelEl}
      <View style={styles.valueRow}>
        <Text
          style={[
            styles.value,
            { fontSize: vSize, letterSpacing: trackingPx(vSize, tracking.display) },
            onStage && { color: stageC.ink0 },
          ]}
        >
          {value}
        </Text>
        {unit ? <Text style={[styles.unit, { fontSize: vSize * 0.42 }]}>{unit}</Text> : null}
      </View>
      {!labelTop && labelEl}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'column', gap: 4 },
  center: { alignItems: 'center' },
  valueRow: { flexDirection: 'row', alignItems: 'flex-end' },
  value: {
    fontFamily: font.monoSemibold,
    fontVariant: ['tabular-nums'],
    color: color.textPrimary,
    lineHeight: undefined,
  },
  unit: {
    fontFamily: font.monoMedium,
    color: color.textMuted,
    marginLeft: 4,
    marginBottom: 3,
  },
});
