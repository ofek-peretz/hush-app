/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * WHERE SHE IS ABOUT TO RUN, DRAWN.
 *
 * ⛔ FOUNDER, 2026-08-12: *"אני רוצה בחלל שישאר למטה שלחיצה על OUTSIDE יופיע ציור של מסלול מרוץ או
 * משהו בסגנון ושיהיה מרשים, ולחיצה על הליכון שיופיע ציור של הליכון ושיהיה מרשים."*
 *
 * Two drawings, one per answer, in the space the enlarged controls leave. They are the only
 * illustration in the product and they earn their place by doing a job no sentence does: the
 * choice she is making is about a PLACE, and a place is a thing you recognise before you read.
 *
 * ── WHY VECTOR AND NOT AN IMAGE ─────────────────────────────────────────────────────────────────
 * It has to be moss on black at any size, in both themes, on a screen whose whole palette is two
 * greys and one green — and it has to weigh nothing. Every stroke here is `signal[0]` at a stated
 * opacity, so the two drawings read as one family and neither can drift off the palette.
 *
 * ⚠️ THEY ARE FURNITURE, NOT INSTRUMENTS. Nothing in either drawing is a measurement: the track has
 * no distance on it and the belt has no speed. A drawing that carried a number would be the first
 * thing on this screen claiming something before she has moved.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
// @ts-nocheck

import React from 'react';
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';
import { signal, stage } from '@/design/tokens';

const MOSS = signal[0];

/** An athletics track, seen at an angle — two straights, two bends, a lane inside a lane. */
export function TrackArt({ width = 300, height = 150 }: { width?: number; height?: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 300 150" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <G opacity={0.9}>
        {/* The outer kerb, then two inner lanes — a track is legible from the ratio of its bends. */}
        <Rect x={14} y={26} width={272} height={98} rx={49} stroke={MOSS} strokeWidth={2.5} fill="none" opacity={0.85} />
        <Rect x={34} y={42} width={232} height={66} rx={33} stroke={MOSS} strokeWidth={1.5} fill="none" opacity={0.45} />
        <Rect x={52} y={57} width={196} height={36} rx={18} stroke={MOSS} strokeWidth={1.5} fill="none" opacity={0.22} />
        {/* The start line, on the near straight. */}
        <Line x1={150} y1={110} x2={150} y2={124} stroke={MOSS} strokeWidth={2.5} strokeLinecap="round" />
        {/* And the runner on it — the one filled mark, where she is. */}
        <Circle cx={150} cy={124} r={7} fill={stage[0]} stroke={MOSS} strokeWidth={3.5} />
      </G>
    </Svg>
  );
}

/** A treadmill, side on — the deck, the belt's rollers, the console she reads. */
export function TreadmillArt({ width = 300, height = 150 }: { width?: number; height?: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 300 150" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <G opacity={0.9}>
        {/* The deck: a long belt on two rollers, raked the way a treadmill actually sits. */}
        <Path d="M52 116 L214 116" stroke={MOSS} strokeWidth={2.5} strokeLinecap="round" opacity={0.85} />
        <Ellipse cx={52} cy={110} rx={9} ry={9} stroke={MOSS} strokeWidth={2.5} fill="none" opacity={0.85} />
        <Ellipse cx={214} cy={110} rx={9} ry={9} stroke={MOSS} strokeWidth={2.5} fill="none" opacity={0.85} />
        <Path d="M52 101 L214 101" stroke={MOSS} strokeWidth={1.5} strokeLinecap="round" opacity={0.4} />
        {/* The upright and the console — the shape that makes it a treadmill and not a ramp. */}
        <Path d="M214 110 L246 46" stroke={MOSS} strokeWidth={2.5} strokeLinecap="round" opacity={0.85} />
        <Rect x={222} y={26} width={56} height={30} rx={7} stroke={MOSS} strokeWidth={2.5} fill="none" opacity={0.85} />
        <Line x1={232} y1={38} x2={252} y2={38} stroke={MOSS} strokeWidth={1.5} strokeLinecap="round" opacity={0.45} />
        <Line x1={232} y1={46} x2={244} y2={46} stroke={MOSS} strokeWidth={1.5} strokeLinecap="round" opacity={0.28} />
        {/* The handrail. */}
        <Path d="M196 74 L236 74" stroke={MOSS} strokeWidth={1.5} strokeLinecap="round" opacity={0.4} />
        {/* The belt, moving — three marks under the deck, the only motion in either drawing. */}
        <Line x1={78} y1={128} x2={104} y2={128} stroke={MOSS} strokeWidth={2} strokeLinecap="round" opacity={0.35} />
        <Line x1={116} y1={128} x2={150} y2={128} stroke={MOSS} strokeWidth={2} strokeLinecap="round" opacity={0.22} />
        <Line x1={162} y1={128} x2={180} y2={128} stroke={MOSS} strokeWidth={2} strokeLinecap="round" opacity={0.14} />
      </G>
    </Svg>
  );
}
