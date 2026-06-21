/**
 * RestRing — 1:1 from the design `components/data/RestRing.jsx`.
 * The countdown between sets: a mechanical, LINEAR sweep — never eased, never
 * bouncing. Reads like an instrument winding down. Controlled: pass `remaining`
 * and `total` (seconds); the ring and the mono readout follow. `onStage` inverts.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { color, font, textScale, signal, stage as stageC } from '@/design/tokens';
import { Legend } from './Legend';

interface Props {
  remaining?: number;
  total?: number;
  size?: number;
  stroke?: number;
  label?: string;
  onStage?: boolean;
}

function fmt(sec: number): string {
  const v = Math.max(0, Math.round(sec));
  const m = Math.floor(v / 60);
  const r = v % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function RestRing({ remaining = 60, total = 90, size = 160, stroke = 6, label = 'Rest', onStage }: Props) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const frac = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const timeSize = size >= 140 ? textScale['2xl'] : size >= 96 ? textScale.lg : textScale.base;
  const trackColor = onStage ? stageC[2] : color.fillSubtleStrong;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.svg}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={signal[0]}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - frac)}
        />
      </Svg>
      <View style={styles.readout}>
        <Text style={[styles.time, { fontSize: timeSize }, onStage && { color: stageC.ink0 }]}>{fmt(remaining)}</Text>
        {label ? <Legend tone={onStage ? 'onStage' : 'muted'}>{label}</Legend> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  svg: { transform: [{ rotate: '-90deg' }] },
  readout: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 2 },
  time: {
    fontFamily: font.monoSemibold,
    fontVariant: ['tabular-nums'],
    color: color.textPrimary,
    letterSpacing: -0.5,
  },
});
