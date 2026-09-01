/**
 * MotionThumb — one STILL frame of an exercise's motion rig, small enough to sit beside a list row.
 *
 * Built for the plan builder (founder, 2026-08-25: *"מסך הבנייה צריך להציג ליד כל תרגיל את הסרטון
 * שלו… המשתמש ישר ידע במה מדובר"*). A list of forty looping `MotionFigure`s would be forty rAF
 * clocks; a list of forty stills is just SVG. The frame is the mid-rep pose (rom 0.55) — the most
 * recognisable instant of most lifts: deeper than the setup, short of the lockout. Tapping the row
 * opens the full looping demo (`ExerciseDemo`), so the still is the invitation, not the lesson.
 *
 * Same geometry pipeline as everything else (`buildFrame` → the shared primitive renderer), so the
 * thumb, the live demo and the CI validator can never disagree about a movement — and the same
 * `figure` switch serves her athlete on her build.
 */

//

import React from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg, { G } from 'react-native-svg';
import type { FigureSex } from '../types';
import type { MotionTone } from '../palette';
import { buildFrame, VIEWBOX } from '../frame';
import { exerciseMotion } from '../registry';
import { renderPrimitive } from './MotionFigure';

interface Props {
  exerciseId?: string | null;
  /** Square edge, points. The 16:10 frame letter-boxes inside it. */
  size: number;
  figure?: FigureSex;
  /** ⛔ THE MAP'S THUMB WAS #191714 ON #1b1914 — see `MOTION_PALETTE_STAGE`. Dark surfaces pass 'stage'. */
  tone?: MotionTone;
  style?: ViewStyle;
}

/** The mid-rep instant — recognisable for presses, pulls, squats and hinges alike. */
const THUMB_ROM = 0.55;

export function MotionThumb({ exerciseId, size, figure, tone, style }: Props) {
  const rig = exerciseMotion(exerciseId);
  if (!rig) return null;
  const prims = buildFrame(rig, THUMB_ROM, figure ?? 'male');
  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]} pointerEvents="none">
      <Svg width={size} height={(size * VIEWBOX.h) / VIEWBOX.w} viewBox={`${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`}>
        <G>{prims.map((p, i) => renderPrimitive(p, i, tone))}</G>
      </Svg>
    </View>
  );
}
