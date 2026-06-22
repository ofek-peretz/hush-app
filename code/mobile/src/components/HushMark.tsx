/**
 * HushMark — the brand mark, 1:1 from the design `assets/mark.svg`: a thin ink
 * ring with a single horizontal hand (an instrument "at rest, level") and a small
 * ochre dot at its centre. Replaces the old gradient "H" tile on the paper theme.
 * Used left of the wordmark on Home / Recovery, and large above the wordmark on
 * the welcome screen.
 */
import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { signal } from '@/design/tokens';

const INK = '#2E2A24'; // the mark's ring + hand (exact from mark.svg)

interface Props {
  size?: number;
  color?: string; // ring + hand color (defaults to the mark ink)
}

export function HushMark({ size = 26, color = INK }: Props) {
  const k = size / 48; // the svg is authored at 48×48
  return (
    <View accessibilityRole="image" accessibilityLabel="Hush" style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <Circle cx={24} cy={24} r={22.25} stroke={color} strokeWidth={1.5} fill="none" />
        <Line x1={13} y1={24} x2={35} y2={24} stroke={color} strokeWidth={2.25} strokeLinecap="round" />
        <Circle cx={24} cy={24} r={2.6} fill={signal[0]} />
      </Svg>
    </View>
  );
}
