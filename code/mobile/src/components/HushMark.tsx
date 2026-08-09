/**
 * HushMark — the v7 brand mark: the measured-range glyph. A cream hairline spanning two
 * end ticks — a bracket that says "a measured span", the same glyph Home strikes beside its
 * wordmark and the tab bar strikes in moss under the active tab.
 *
 * This REPLACED the v5 ring-with-hand (a thin circle + level hand + moss dot). v7 makes the
 * whole app an engraved instrument, and the mark follows: the ring is gone, the span is the
 * mark. On the dark stage it defaults to CREAM; a caller on a paper card passes `color`.
 *
 * The glyph's native proportions are 26 × 11 (from the Home range-mark). `size` sets the
 * WIDTH; the height and stroke scale from it, so the bracket keeps its shape at any size.
 * Used large above the wordmark on the welcome screen, and small on the paywall / profile.
 */
// @ts-nocheck

// 

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { color as tokenColor } from '@/design/tokens';

interface Props {
  size?: number; // the mark's WIDTH; height follows at 11/26 of it
  color?: string; // bar + ticks colour (defaults to cream on the stage)
}

// Native proportions of the range glyph (matches HomeView's RangeMark: 26 × 11, 1.5 strokes).
const BASE_W = 26;
const RATIO_H = 11 / 26;
const RATIO_STROKE = 1.5 / 26;
const RATIO_BAR_TOP = 5 / 26;

export function HushMark({ size = BASE_W, color = tokenColor.textPrimary }: Props) {
  const height = size * RATIO_H;
  const stroke = size * RATIO_STROKE;
  const barTop = size * RATIO_BAR_TOP;
  return (
    <View accessibilityRole="image" accessibilityLabel="Hush" style={{ width: size, height }}>
      {/* the spanning hairline */}
      <View style={[styles.bar, { top: barTop, height: stroke, backgroundColor: color }]} />
      {/* the two end ticks */}
      <View style={[styles.tickStart, { width: stroke, height, backgroundColor: color }]} />
      <View style={[styles.tickEnd, { width: stroke, height, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', start: 0, end: 0 },
  tickStart: { position: 'absolute', top: 0, start: 0 },
  tickEnd: { position: 'absolute', top: 0, end: 0 },
});
