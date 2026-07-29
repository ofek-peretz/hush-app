/**
 * GhostClimb — the graph that has not happened yet (v7 3.6b, "Progress — day one").
 *
 * A dashed cream trace rising off a single lit moss point: "YOU ARE HERE". It is not a forecast and
 * carries no numbers — Hush shows only what was measured, and on day one nothing has been. The line
 * is the SHAPE of a climb, drawn so the empty page still says what the page is for.
 *
 * The label rides in an RN Text overlay rather than inside the SVG, because "YOU ARE HERE" is words.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Circle } from 'react-native-svg';
import { signal, font, color, tracking, trackingPx } from '@/design/tokens';
import { monoCanDraw } from '@/design/monoVoice';

interface Props {
  width: number;
  height?: number;
  /** "You are here" in the athlete's language. */
  label: string;
}

export function GhostClimb({ width, height = 150, label }: Props) {
  // The handoff's own rise, in fractions so it holds its shape at any device width.
  const xs = [0.037, 0.19, 0.344, 0.497, 0.65, 0.804, 0.957];
  const ys = [0.8, 0.733, 0.64, 0.573, 0.453, 0.36, 0.213];
  const pts = xs.map((fx, i) => `${fx * width},${ys[i] * height}`).join(' ');
  const originX = xs[0] * width;
  const originY = ys[0] * height;

  return (
    <View style={{ width, height }} accessibilityRole="image" accessibilityLabel={label}>
      <Svg width={width} height={height}>
        <Polyline
          points={pts}
          fill="none"
          stroke={color.border}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray="4 7"
        />
        <Circle cx={originX} cy={originY} r={6} fill={signal[0]} />
      </Svg>
      <Text
        style={[
          styles.label,
          { left: originX + 12, top: originY + 12, fontFamily: monoCanDraw(label) ? font.monoMedium : font.sansMedium }, // rtl-ok: merged onto label (sets textAlign); left/top place it against the plotted origin
        ]}
        numberOfLines={1}
      >
        {/* A legend, so it is stamped like every other one in the instrument — the copy is stored
            in sentence case and uppercased here, exactly as `Legend` does. */}
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    position: 'absolute',
    fontSize: 14.5,
    letterSpacing: trackingPx(11, tracking.legend),
    color: signal[0],
    textAlign: 'left',
  },
});
