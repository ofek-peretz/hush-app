/**
 * ProgressMeter — 1:1 from the design `components/data/ProgressMeter.jsx`.
 * A quiet horizontal gauge for completion/progress. On the dark stage the fill is
 * the LIT thing — cream by default (emphasis is distance from the ground);
 * tone="signal" is moss for an active measure, tone="up" for progress. Optional
 * `mark` draws a reference tick (e.g. the initial peak vs the best peak since).
 */
import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { color, font, textScale, up } from '@/design/tokens';
import { Legend } from './Legend';

type Tone = 'ink' | 'signal' | 'up' | 'muted';

interface Props {
  value?: number;
  max?: number;
  label?: string;
  valueLabel?: string;
  tone?: Tone;
  size?: 'md' | 'lg';
  mark?: number;
  style?: ViewStyle | ViewStyle[];
}

const FILL: Record<Tone, string> = { ink: color.textPrimary, signal: color.accent, up: up.stage, muted: color.textMuted };

export function ProgressMeter({ value = 0, max = 100, label, valueLabel, tone = 'ink', size = 'md', mark, style }: Props) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <View style={[styles.wrap, style]}>
      {(label || valueLabel) && (
        <View style={styles.head}>
          {label ? <Legend>{label}</Legend> : <View />}
          {valueLabel ? <Text style={styles.value}>{valueLabel}</Text> : null}
        </View>
      )}
      <View style={[styles.track, size === 'lg' && styles.trackLg]}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: FILL[tone] }]} />
        {mark != null ? (
          <View style={[styles.mark, { start: `${Math.max(0, Math.min(100, (mark / max) * 100))}%` }]} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'column', gap: 8, width: '100%' },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  value: { fontFamily: font.mono, fontVariant: ['tabular-nums'], fontSize: textScale.sm, color: color.textPrimary, textAlign: 'left' },
  track: { position: 'relative', height: 6, backgroundColor: color.fillSubtleStrong, borderRadius: 999, overflow: 'hidden' },
  trackLg: { height: 10 },
  fill: { position: 'absolute', top: 0, bottom: 0, start: 0, borderRadius: 999 },
  mark: { position: 'absolute', top: -3, bottom: -3, width: 1.5, backgroundColor: color.textPrimary, opacity: 0.5 },
});
