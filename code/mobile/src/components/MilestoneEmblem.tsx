/**
 * MilestoneEmblem — the engraved medallion (founder 2026-07-10). Not a game
 * medal: a stamp. An ochre-foil bezel of 48 engraved ticks around a double ring,
 * with the mark's value set in the center in the mono instrument face.
 *
 * Tones:
 *   'foil'   — earned. Ochre engraving; on the stage it reads as foil on graphite,
 *              on paper as ochre ink.
 *   'locked' — the gallery silhouette of the NEXT mark: same geometry, muted ink.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { signal, stage, ink, font } from '@/design/tokens';

export interface MilestoneEmblemProps {
  size: number;
  tone?: 'foil' | 'locked';
  onStage?: boolean; // dark stage vs paper
  value: string; // the center figure, e.g. "100", "250 t", "×2"
  caption?: string; // tiny line under the figure, e.g. "KG" / "WORKOUTS"
}

const TICKS = 48;

export function MilestoneEmblem({ size, tone = 'foil', onStage = false, value, caption }: MilestoneEmblemProps) {
  const engrave = tone === 'foil' ? (onStage ? signal[0] : signal.ink) : onStage ? stage.ink2 : ink[3];
  const text = tone === 'foil' ? (onStage ? stage.ink0 : ink[0]) : onStage ? stage.ink2 : ink[3];

  // Geometry in a 100-unit frame.
  const c = 50;
  const rOuter = 48;
  const tickOut = 44;
  const tickIn = 41;
  const rInner = 36;
  const ticks = Array.from({ length: TICKS }, (_, i) => {
    const a = (i / TICKS) * 2 * Math.PI;
    return {
      x1: c + tickOut * Math.cos(a),
      y1: c + tickOut * Math.sin(a),
      x2: c + tickIn * Math.cos(a),
      y2: c + tickIn * Math.sin(a),
    };
  });

  const valueSize = Math.round(size * (value.length > 4 ? 0.16 : value.length > 2 ? 0.2 : 0.26));

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Circle cx={c} cy={c} r={rOuter} stroke={engrave} strokeWidth={1.75} fill="none" />
        {ticks.map((p, i) => (
          <Line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={engrave} strokeWidth={1} opacity={0.55} />
        ))}
        <Circle cx={c} cy={c} r={rInner} stroke={engrave} strokeWidth={0.75} opacity={0.4} fill="none" />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text
          style={{
            fontFamily: font.monoSemibold,
            fontVariant: ['tabular-nums'],
            fontSize: valueSize,
            color: text,
          }}
          numberOfLines={1}
        >
          {value}
        </Text>
        {caption ? (
          <Text
            style={{
              fontFamily: font.sansMedium,
              fontSize: Math.max(8, Math.round(size * 0.065)),
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              color: engrave,
              marginTop: 2,
            }}
            numberOfLines={1}
          >
            {caption}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
});
