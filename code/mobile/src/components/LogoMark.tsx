/**
 * LogoMark (spec §9) — the Hush "H" tile: rounded square, 135° gradient
 * #2D7DD2 → #185FA5, white "H" 700. Used in Dynamic Island, Live Activity,
 * notification banner. Gradient via react-native-svg (no extra native dep).
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { color } from '@/design/tokens';

interface Props {
  size?: number; // tile side (px)
  radius?: number; // corner radius
  letterRatio?: number; // H font size as fraction of size
}

export function LogoMark({ size = 26, radius = 7, letterRatio = 0.5 }: Props) {
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Hush"
      style={[styles.wrap, { width: size, height: size }]}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          {/* 135°: top-left → bottom-right */}
          <LinearGradient id="hushLogo" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={color.logoGradStart} />
            <Stop offset="1" stopColor={color.logoGradEnd} />
          </LinearGradient>
        </Defs>
        <Rect width={size} height={size} rx={radius} ry={radius} fill="url(#hushLogo)" />
      </Svg>
      <Text
        allowFontScaling={false}
        style={[styles.h, { fontSize: Math.round(size * letterRatio) }]}
      >
        H
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  h: { color: color.textPrimary, fontWeight: '700' },
});
