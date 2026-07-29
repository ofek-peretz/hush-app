/**
 * Stage — the ground of every screen: the warm near-black LIT FROM ABOVE.
 *
 * Every frame in the v7 handoff carries the same surface —
 * `linear-gradient(175deg, #1B1914 0%, #131210 38%, #0F0E0C 100%)` — and that light is
 * not decoration: it is the rule the whole palette rests on. Emphasis in v7 is
 * "standing in the light" versus "resting in shadow", which only means something if
 * the light is actually there. A flat `#131210` fill loses it.
 *
 * 175° is very nearly straight down (180° would be exactly top→bottom), so the wash
 * leans a few degrees across as it falls. Drawn as an SVG rect because React Native
 * has no CSS gradients, and the app already carries `react-native-svg`.
 *
 * Drop it as the FIRST child of a screen's root view; the root keeps
 * `backgroundColor: color.bg` (the gradient's own middle stop) so nothing flashes
 * before it paints and nothing breaks if it is absent.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { stage } from '@/design/tokens';

/** 175° in CSS = 5° off straight-down. x2/y2 express that as a unit vector. */
const RAD = ((175 - 90) * Math.PI) / 180;

export function Stage() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="hushStage" x1="0" y1="0" x2={String(Math.cos(RAD).toFixed(4))} y2="1">
            <Stop offset="0" stopColor={stage.gradient[0]} />
            <Stop offset={String(stage.gradientLocations[1])} stopColor={stage.gradient[1]} />
            <Stop offset="1" stopColor={stage.gradient[2]} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#hushStage)" />
      </Svg>
    </View>
  );
}
