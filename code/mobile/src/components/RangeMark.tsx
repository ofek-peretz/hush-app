/**
 * THE RANGE MARK — the brand's glyph: a hairline spanning two end ticks.
 *
 * A measured range, which is what the whole product is: not a number, a band you land inside. It is
 * struck in cream beside the wordmark, in moss under the active tab, and in moss again at the head
 * of the paywall where the trial closes.
 *
 * Sized by its WIDTH; the ticks and the bar follow from it, so one mark reads the same at 16 and at
 * 44. Drawn from three plain Views rather than an SVG — three rectangles need no renderer.
 */

// 

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { color } from '@/design/tokens';

interface Props {
  /** Overall width in points. The handoff draws it at 16 (tab), 26 (wordmark) and 44 (paywall). */
  width?: number;
  /** Tick height; the bar sits on its centre line. Defaults to a little under half the width. */
  height?: number;
  /** What it is struck in. Cream by default — the brand mark; moss where it marks a signal. */
  tone?: string;
  thickness?: number;
}

export function RangeMark({ width = 26, height = 11, tone = color.textPrimary, thickness = 1.5 }: Props) {
  return (
    <View style={[styles.root, { width, height }]}>
      <View style={[styles.bar, { top: (height - thickness) / 2, height: thickness, backgroundColor: tone }]} />
      <View style={[styles.tick, styles.start, { width: thickness, backgroundColor: tone }]} />
      <View style={[styles.tick, styles.end, { width: thickness, backgroundColor: tone }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'relative' },
  bar: { position: 'absolute', start: 0, end: 0 },
  tick: { position: 'absolute', top: 0, bottom: 0 },
  start: { start: 0 },
  end: { end: 0 },
});
