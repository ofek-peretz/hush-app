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

import React from 'react';
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';
import { signal, stage } from '@/design/tokens';

const MOSS = signal[0];

/*
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ IT SAID "SEEN AT AN ANGLE" AND IT WAS DEAD FLAT (2026-08-27).
 *
 * The track was three axis-aligned `<Rect>`s with `rx` at half their height — three concentric
 * stadium outlines, straight on. The treadmill beside it is drawn in three-quarter view: a raked
 * deck, an upright leaning back, a console above it. **The two drawings the header calls "one
 * family" were in two different projections**, and only one of them looked like a place.
 *
 * ⚠️ AND FLAT MADE IT ECHO THE BUTTON. A horizontal stadium outline is the exact silhouette of this
 * app's primary control, and `התחל קרדיו` sits about a hundred points below it in the same width. The
 * one illustration in the product read as a large empty button.
 *
 * ⛔ THE START LINE WAS INVISIBLE. `Line` ran y 110→124 and the runner was a `r={7}` circle with a
 * 3.5 stroke centred at y=124 — outer radius 8.75, covering y 115→133. Nine of the line's fourteen
 * points were underneath it, and on glass nothing of it could be seen. The runner also sat ON the
 * outer kerb (`y = 26 + 98`), which is the boundary, not a lane.
 *
 * ── WHAT IT IS NOW ──────────────────────────────────────────────────────────────────────────────
 * One path, in perspective: the far straight is shorter and higher than the near one, so the bends
 * foreshorten and the shape reads as ground rather than as an outline. The three lanes are the SAME
 * path scaled about the figure's own centre — so they cannot drift out of family the way three
 * hand-tuned rectangles could, and the lane spacing narrows toward the far side exactly as
 * perspective requires, for free.
 *
 * ⚠️ AND THERE IS ONE MARK, NOT TWO. The start line is deleted rather than made bigger: this header
 * says the drawings are FURNITURE, and a start line beside a runner is a second thing competing for
 * twelve points of near straight. The filled dot is where she is, and that is the whole sentence.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
/** The outer kerb, in three-quarter view. Symmetric about x=150; the lanes are this, scaled. */
const TRACK = 'M72 120 L228 120 C262 116 244 60 206 56 L94 56 C56 60 38 116 72 120 Z';
/** Scaled about the figure's centre — the shape's own bounding centre, not the viewBox's. */
const lane = (s: number) => `translate(${150 - 150 * s} ${88 - 88 * s}) scale(${s})`;

/** An athletics track, seen at an angle — two straights, two bends, a lane inside a lane. */
export function TrackArt({ width = 300, height = 150 }: { width?: number; height?: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 300 150" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <G opacity={0.9}>
        <Path d={TRACK} stroke={MOSS} strokeWidth={2.5} fill="none" opacity={0.85} />
        <G transform={lane(0.8)}>
          <Path d={TRACK} stroke={MOSS} strokeWidth={1.9} fill="none" opacity={0.45} />
        </G>
        <G transform={lane(0.62)}>
          <Path d={TRACK} stroke={MOSS} strokeWidth={2.4} fill="none" opacity={0.22} />
        </G>
        {/* The runner — the one filled mark, in lane one on the near straight, where she is. */}
        <Circle cx={150} cy={117} r={5.5} fill={stage[0]} stroke={MOSS} strokeWidth={3} />
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
