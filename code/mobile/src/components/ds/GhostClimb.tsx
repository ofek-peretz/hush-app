/**
 * GhostClimb — the graph that has not happened yet (v7 3.6b, "Progress — day one").
 *
 * A dashed cream trace rising off a single lit moss point: "YOU ARE HERE". It is not a forecast and
 * carries no numbers — Hush shows only what was measured, and on day one nothing has been. The line
 * is the SHAPE of a climb, drawn so the empty page still says what the page is for.
 *
 * The label rides in an RN Text overlay rather than inside the SVG, because "YOU ARE HERE" is words.
 */

// 

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Circle } from 'react-native-svg';
import { signal, font, color, tracking, trackingPx } from '@/design/tokens';
import { legendVoice } from '@/design/monoVoice';

/** The legend size, named once so the face/tracking call and the style cannot disagree. */
const LABEL_SIZE = 17;

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

  /*
   * ⛔ THE WEIGHT OF THE LINE SCALES WITH THE DRAWING (2026-08-22).
   *
   * The trace, its dashes and the point were absolute — 2.5, `4 7`, r=6 — chosen against the 150
   * this component shipped at. Progress · day one now draws it at up to 320 (see `DayOne`), and an
   * absolute stroke inside a frame twice the size is not the same design at a larger scale: it is a
   * thinner one. Same rule as the stage's two figures, which derive their leading and tracking from
   * whatever size they were given rather than carrying numbers chosen at one of them.
   *
   * ⚠️ RATIOS OFF THE ORIGINAL, so 150 renders byte-identically to what was approved.
   */
  const k = height / 150;
  const stroke = Math.round(2.5 * k * 10) / 10;
  const dash = `${Math.round(4 * k * 10) / 10} ${Math.round(7 * k * 10) / 10}`;
  const dot = Math.round(6 * k * 10) / 10;

  return (
    <View style={{ width, height }} accessibilityRole="image" accessibilityLabel={label}>
      <Svg width={width} height={height}>
        <Polyline
          points={pts}
          fill="none"
          stroke={color.border}
          strokeWidth={stroke}
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray={dash}
        />
        <Circle cx={originX} cy={originY} r={dot} fill={signal[0]} />
      </Svg>
      <Text
        style={[
          styles.label,
          /*
            ⛔ THE TRACKING NOW FOLLOWS THE FACE (2026-08-27) — IT WAS ASKING HALF THE QUESTION.

            This line already asked `monoCanDraw(label)` for the FACE, correctly. The letter-spacing
            sat in the StyleSheet as a flat `.16em` and was applied regardless — so on the empty
            Progress screen, "YOU ARE HERE" was drawn in the sans (right) and then opened up by
            2.72pt anyway, and `כאן אתה נמצא` read as `כ א ן  א ת ה  נ מ צ א`.

            That is the EXACT fault `Legend` has a docblock about — *"the letter-spacing did not
            follow, so a Hebrew legend was drawn in the sans face and then opened up by .16em"* —
            reproduced in a component that was written after the fix. `legendVoice` exists so one
            call answers both halves; it is used here now, as `Legend` uses it.

            ⚠️ THE TYPE LINT COULD NOT SEE IT. Its rule needs `font.sans` inside the style block, and
            this block declares no family at all — the face is decided out here, in the JSX.
          */
          // rtl-ok: merged onto label (sets textAlign); left/top place it against the plotted origin
          {
            left: originX + 12,
            top: originY + 12,
            fontFamily: legendVoice(label, LABEL_SIZE, tracking.legend).latin ? font.monoMedium : font.sansMedium, // rtl-ok: merged onto styles.label, which sets textAlign
            letterSpacing: legendVoice(label, LABEL_SIZE, tracking.legend).letterSpacing,
          },
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
    fontSize: LABEL_SIZE,
    /* ⚠️ THE TRACKING IS COMPUTED OFF THE SIZE THAT IS ACTUALLY SET. It read `trackingPx(11, …)`
       long after the size became 17 — 1.76px instead of 2.72px — so "YOU ARE HERE", the one legend
       on the empty Progress screen, read visibly tighter than every other legend in the app. */
    color: signal[0],
    textAlign: 'left',
  },
});
