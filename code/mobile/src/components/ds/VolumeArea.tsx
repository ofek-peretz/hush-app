/**
 * VolumeArea — the weekly-volume graph on Progress · Lifts (v7 3.2). A single moss series drawn as a
 * filled area: the tonnage the athlete moved each training week, oldest → newest. Unlike the
 * Sparkline (a running-max staircase that can only rise), this line reports raw weekly effort, so it
 * CAN dip — that honesty is the point (an easy week reads as an easy week).
 *
 * COLOUR is semantic, not accent: moss is what "work done" wears everywhere in Hush. On the dark
 * stage the line takes lit moss (`signal[0]`) and the fill a deep-moss gradient fading to nothing.
 *
 * The two figures (first week, this week) ride in SANS Text overlays, never inside the SVG in mono —
 * mono carries no words (the law), and "WEEK 1" is a word. Defensive by construction: 0–1 points
 * draw a dot, a flat series draws level; it never throws, because a progress screen must not crash.
 */
// @ts-nocheck

// 

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Polyline, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { signal, font, color } from '@/design/tokens';
import { monoCanDraw } from '@/design/monoVoice';

interface Props {
  /** Tonnes per training week, oldest → newest. */
  data: number[];
  width: number;
  height?: number;
  startLabel?: string;
  endLabel?: string;
}

/** Mono when the face can draw the reading; the interface sans when it cannot. */
const labelFace = (v: string) => (monoCanDraw(v) ? font.monoMedium : font.sansMedium);

export function VolumeArea({ data, width, height = 150, startLabel, endLabel }: Props) {
  const padX = 12;
  const top = 14;
  const bottom = height - 26; // room beneath the plot for the baseline label
  const n = data.length;
  const max = Math.max(1, ...data);

  const x = (i: number) => (n <= 1 ? width / 2 : padX + (i / (n - 1)) * (width - padX * 2));
  const y = (v: number) => bottom - (v / max) * (bottom - top);

  const lastX = x(n - 1);
  const lastY = y(data[n - 1] ?? 0);

  const linePts = data.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const fillPath =
    n > 1
      ? `M ${x(0)},${y(data[0])} ${data.map((v, i) => `L ${x(i)},${y(v)}`).join(' ')} L ${lastX},${bottom} L ${x(0)},${bottom} Z`
      : '';

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="volFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={signal[1]} stopOpacity={0.28} />
            <Stop offset="1" stopColor={signal[1]} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {n > 1 ? <Path d={fillPath} fill="url(#volFill)" stroke="none" /> : null}
        {n > 1 ? (
          <Polyline
            points={linePts}
            fill="none"
            stroke={signal[0]}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}
        <Circle cx={lastX} cy={lastY} r={5} fill={signal[0]} />
      </Svg>
      {startLabel ? (
        <Text style={[styles.label, styles.start, { fontFamily: labelFace(startLabel) }]}>{startLabel}</Text>
      ) : null}
      {endLabel ? (
        <Text style={[styles.label, styles.end, { fontFamily: labelFace(endLabel) }]}>{endLabel}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // v7 3.2 sets both ends of the graph in the instrument's mono at 11px — they are readings off
  // the trace, not captions about it. The caller uppercases; the face is chosen per string so a
  // Hebrew reading falls back rather than breaking (see `monoVoice`).
  label: {
    position: 'absolute',
    fontSize: 17,
    textAlign: 'left', // logical start; the `end` variant overrides to 'right'
  },
  start: { left: 10, bottom: 4, color: color.textMuted },
  end: { right: 10, top: 4, color: signal[0], textAlign: 'right' },
});
