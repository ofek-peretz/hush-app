/**
 * FooterFade — the "there is more" signal above a sticky footer (design review 2026-09-01).
 *
 * Five screens ended a scrolling list at the footer's top edge with no signal: the last visible
 * row cut mid-line and the screen READ AS FINISHED — on WellDone that hid "אימון חלקי נשמר.", the
 * most important status of the session, and on Today it hid the whole "השבוע שלך עד כה" block.
 * A 32-point fade from transparent to the screen's own ground is the standard, quiet way a page
 * admits it continues; it sits just above the footer and never intercepts a touch.
 *
 * Usage: render as the FIRST child of the footer view (the footer is relatively positioned by
 * default) — the fade hangs `height` points above it, over the scrolling content.
 *
 * ⚠️ Pass the SCREEN'S ground (`color.bg` is the default; a paper sheet passes its paper). A fade
 * to the wrong ground draws a visible band — worse than no fade.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { color } from '@/design/tokens';

let uid = 0;

interface Props {
  /** Fade height in points. 32 reads as a hint without eating a line of content. */
  height?: number;
  /** The ground the content fades into — MUST match the screen behind the footer. */
  ground?: string;
}

export function FooterFade({ height = 32, ground = color.bg }: Props) {
  // A stable per-instance id: two fades on one screen (a sheet over a page) must not share defs.
  const id = React.useRef(`footerfade-${++uid}`).current;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: -height, height }]}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={ground} stopOpacity={0} />
            <Stop offset="1" stopColor={ground} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0 },
});
