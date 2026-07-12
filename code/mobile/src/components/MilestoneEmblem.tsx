/**
 * MilestoneEmblem — the engraved medallion (founder 2026-07-10). Not a game
 * medal: a stamp. An ochre-foil bezel of 48 engraved ticks around a double ring,
 * with the mark's MOTIF struck in the middle of it and the value set beneath in the
 * mono instrument face.
 *
 * Founder 2026-07-12: the motif is the point. A badge that only carries a figure makes
 * a 60 kg bench and a 60 kg squat the same object, and engraves "250" where the copy
 * promises the Statue of Liberty. Every mark now brings its own glyph
 * (components/MilestoneGlyph) — the lift, the object moved, the ledger, the raise.
 *
 * Tones:
 *   'foil'   — earned. Ochre engraving; on the stage it reads as foil on graphite,
 *              on paper as ochre ink.
 *   'locked' — the gallery silhouette of the NEXT mark: same geometry, muted ink.
 *
 * `pulse` lights a slow ochre halo behind the bezel — reserved for the celebration
 * beat, where the mark should feel like it is giving off heat, not sitting in a list.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { MilestoneGlyph, type MilestoneGlyphName } from '@/components/MilestoneGlyph';
import { signal, stage, ink, font } from '@/design/tokens';

export interface MilestoneEmblemProps {
  size: number;
  tone?: 'foil' | 'locked';
  onStage?: boolean; // dark stage vs paper
  value: string; // the figure beneath the motif, e.g. "100", "250 t", "×2"
  caption?: string; // tiny line under the figure, e.g. "KG" / "WORKOUTS"
  glyph?: MilestoneGlyphName; // the mark's meaning, struck in the middle
  /** Celebration only: a slow ochre halo breathing behind the bezel. */
  pulse?: boolean;
}

const TICKS = 48;

export function MilestoneEmblem({ size, tone = 'foil', onStage = false, value, caption, glyph, pulse = false }: MilestoneEmblemProps) {
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

  // With a motif present the figure is a caption to it, not the hero — so it steps down.
  // A mark with NO figure (the first raise: an event, not a number) gives the motif the
  // whole medallion.
  const valueSize = Math.round(size * (glyph ? 0.155 : value.length > 4 ? 0.16 : value.length > 2 ? 0.2 : 0.26));
  const glyphSize = Math.round(size * (value ? 0.36 : 0.5));

  // The halo: a slow breath, never a flash. Two full cycles a second would read as an
  // alert; ~2.4s in / 2.4s out reads as something warm.
  const halo = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!pulse) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(halo, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(halo, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, halo]);

  return (
    <View style={{ width: size, height: size }}>
      {pulse ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.halo,
            {
              borderRadius: size / 2,
              backgroundColor: signal[0],
              opacity: halo.interpolate({ inputRange: [0, 1], outputRange: [0.05, 0.16] }),
              transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.12] }) }],
            },
          ]}
        />
      ) : null}
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Circle cx={c} cy={c} r={rOuter} stroke={engrave} strokeWidth={1.75} fill="none" />
        {ticks.map((p, i) => (
          <Line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={engrave} strokeWidth={1} opacity={0.55} />
        ))}
        <Circle cx={c} cy={c} r={rInner} stroke={engrave} strokeWidth={0.75} opacity={0.4} fill="none" />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        {glyph ? (
          <View style={{ marginBottom: Math.round(size * 0.02) }}>
            <MilestoneGlyph name={glyph} size={glyphSize} color={engrave} />
          </View>
        ) : null}
        {value ? (
          <Text
            style={{
              fontFamily: font.monoSemibold,
              fontVariant: ['tabular-nums'],
              fontSize: valueSize,
              color: text,
              textAlign: 'left',
            }}
            numberOfLines={1}
          >
            {value}
          </Text>
        ) : null}
        {caption ? (
          <Text
            style={{
              fontFamily: font.sansMedium,
              fontSize: Math.max(8, Math.round(size * 0.062)),
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              color: engrave,
              marginTop: 1,
              textAlign: 'left',
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
  halo: { ...StyleSheet.absoluteFillObject },
});
