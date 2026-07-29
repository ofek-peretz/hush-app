/**
 * MilestoneEmblem — the mark, v7 (2.6 / 2.6b / 2.6c).
 *
 * ════ IT IS A SEAL, NOT A MEDAL ════
 *
 * This used to be an engraved medallion: 48 foil ticks around a double ring, a motif struck in the
 * middle, the figure beneath. It read as a game trophy — the one thing the product is not. v7 draws
 * it as a SEAL: a dashed outer ring, a plain inner ring, the figure lit inside it, and a small moss
 * check stamped at the crown where a seal's mark goes. Nothing is gold, nothing is foil, and the
 * only accent on the whole object is that check and the mark's own glyph.
 *
 * The dashed ring is the point of the drawing: a seal is made of the thing it certifies, and what
 * certifies a milestone here is a countable number of sessions. So the ring is a measure, drawn as
 * a measure, rather than a laurel.
 *
 * `pulse` adds one slow moss ring breathing outward behind it — the celebration beat only, where
 * the mark should feel like it is giving off heat rather than sitting in a list.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { MilestoneGlyph, type MilestoneGlyphName } from '@/components/MilestoneGlyph';
import { Icon } from '@/components/Icon';
import { stage, signal, font } from '@/design/tokens';

export interface MilestoneEmblemProps {
  size: number;
  tone?: 'foil' | 'locked';
  onStage?: boolean; // dark stage vs paper
  value: string; // the figure inside the seal, e.g. "40", "10", "12"
  caption?: string; // the line under the figure, e.g. "KG" / "WORKOUTS"
  glyph?: MilestoneGlyphName; // the mark's meaning, struck in moss above the figure
  /** Celebration only: one slow moss ring breathing outward behind the seal. */
  pulse?: boolean;
}

export function MilestoneEmblem({ size, tone = 'foil', onStage = false, value, caption, glyph, pulse = false }: MilestoneEmblemProps) {
  // A LOCKED mark (the gallery's silhouette of what is next) is the same object with the light
  // taken out of it: the rings recede and the figure stops glowing.
  const locked = tone === 'locked';
  const ring = locked ? 'rgba(241,238,229,0.16)' : 'rgba(241,238,229,0.4)';
  const innerRing = locked ? 'rgba(241,238,229,0.10)' : 'rgba(241,238,229,0.18)';
  const figure = locked ? stage.ink2 : '#f6f3ea';
  const accent = locked ? stage.ink2 : signal[0];

  // The handoff's proportions, held at any size: the inner ring is 82% of the seal, the figure a
  // third of it, and the caption a fifth of the figure.
  const inner = Math.round(size * 0.824);
  const valueSize = Math.round(size * (value.length > 2 ? 0.26 : 0.315));
  const captionSize = Math.max(9, Math.round(size * (caption && caption.length > 12 ? 0.049 : 0.06)));
  const badge = Math.round(size * 0.093);

  // The breath: outward and away, 4s, never a flash.
  const halo = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!pulse) return;
    const loop = Animated.loop(
      Animated.timing(halo, { toValue: 1, duration: 4000, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, halo]);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {pulse ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pulseRing,
            {
              borderRadius: (size + 28) / 2,
              opacity: halo.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.5, 0, 0] }),
              transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1.9] }) }],
            },
          ]}
        />
      ) : null}

      {/* The seal itself: a dashed measure around a plain rule. */}
      <View style={[styles.outer, { width: size, height: size, borderRadius: size / 2, borderColor: ring }]}>
        <View style={[styles.inner, { width: inner, height: inner, borderRadius: inner / 2, borderColor: innerRing }]}>
          {glyph ? (
            <View style={styles.glyph}>
              <MilestoneGlyph name={glyph} size={Math.round(size * 0.139)} color={accent} />
            </View>
          ) : null}
          {value ? (
            <Text
              numberOfLines={1}
              style={[
                styles.value,
                {
                  fontSize: valueSize,
                  lineHeight: valueSize,
                  letterSpacing: -valueSize * 0.03,
                  color: figure,
                  textShadowColor: locked ? 'transparent' : 'rgba(246,243,234,0.14)',
                },
              ]}
            >
              {value}
            </Text>
          ) : null}
          {caption ? (
            <Text numberOfLines={1} style={[styles.caption, { fontSize: captionSize, letterSpacing: captionSize * 0.22 }]}>
              {caption}
            </Text>
          ) : null}
        </View>

        {/* The stamp at the crown — the one place this object is allowed an accent. */}
        <View
          style={[
            styles.badge,
            { width: badge, height: badge, borderRadius: badge / 2, top: -badge / 2 + 1, marginStart: -badge / 2, borderColor: accent },
          ]}
        >
          <Icon name="check" size={Math.round(badge * 0.55)} color={accent} strokeWidth={3} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pulseRing: { ...StyleSheet.absoluteFillObject, margin: -14, borderWidth: 1.5, borderColor: 'rgba(169,196,159,0.35)' },
  outer: { borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  inner: { borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  glyph: { marginBottom: 6 },
  value: {
    fontFamily: font.monoMedium,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    textShadowRadius: 40,
    textShadowOffset: { width: 0, height: 0 },
  },
  caption: { fontFamily: font.monoMedium, textTransform: 'uppercase', color: stage.ink1, textAlign: 'center' },
  badge: {
    position: 'absolute',
    start: '50%',
    backgroundColor: stage[0],
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
