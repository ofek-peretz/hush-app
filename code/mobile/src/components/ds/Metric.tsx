/**
 * Metric — 1:1 from the design `components/data/Metric.jsx`.
 * A measured value with a quiet legend. The number is mono + tabular; the unit
 * is subordinate (0.42em of the value). Value first, meaning beneath, nothing
 * else — how every figure in Hush is presented.
 *
 * ════ ⚠️ NOTHING RENDERS THIS, AND IT IS KEPT ANYWAY — IT IS THE SHAPE, NOT DEAD CODE ════
 *
 * A sweep on 2026-08-18 found no `<Metric` anywhere in `src/`. Three siblings in the same state
 * (`ListRow`, `ProgressMeter`, `VolumeArea`) were deleted; this one was not, because value-over-
 * legend is the single most repeated arrangement in the product and **seven screens have each
 * written their own private copy of it.** Those copies have already drifted — different unit ratios,
 * different label tones, different gaps — which is exactly the cost this component was built to
 * prevent and is why deleting it would ratify the drift instead of ending it.
 *
 * So it stands as the canonical shape: a screen printing a figure under a legend should adopt this
 * rather than grow an eighth version. Delete it only when the seven have been folded in — at which
 * point it will not be dead, it will be everywhere.
 */

// 

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
            /*
              ✦ `figure`, NOT `display` (2026-08-27). `tracking.display` is the SERIF HEADLINE rung
              — it was written for Frank Ruhl Libre and it is -0.01em. This text is
              `font.monoSemibold` at 20 / 30 / 48 / 64, and a monospace glyph holds a full em cell
              whatever it is: at 48pt a decimal point arrived with half an em of air on each side, so
              the set stage's neighbouring load read `3 2 . 5` beside a `34` she is looking at
              between every rep. See the note at `tracking.figure`.
             */
            { fontSize: vSize, letterSpacing: trackingPx(vSize, tracking.figure) },
            onStage && { color: stageC.ink0 },
          ]}
        >
          {value}
        </Text>
        {/* ⛔ THE UNIT OBEYS THE FLOOR TOO. `0.42em` of a `sm` value is 8.4pt — half the floor —
            and it is a computed local, so `typeHasAFloor` cannot see it any more than it could see
            `MilestoneEmblem`'s caption. The ratio still governs the big sizes, where it is the
            design; below 17 it stops. */}
        {unit ? <Text style={[styles.unit, { fontSize: Math.max(17, Math.round(vSize * 0.42)) }]}>{unit}</Text> : null}
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
    textAlign: 'left',
  },
  unit: {
    fontFamily: font.sansMedium,
    color: color.textMuted,
    marginStart: 4,
    marginBottom: 3,
    textAlign: 'left',
  },
});
