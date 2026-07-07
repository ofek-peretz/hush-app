/**
 * The motion registry — the single place that maps an exercise id to its rig, mirroring the shape
 * of `platform/media/exerciseVideo`. Empty entries fall back to the existing video seam and then
 * the static silhouette, so an exercise lights up the moment its rig is added, with no other change.
 */
import type { Rig } from './types';
import { bbBenchPress } from './library/bbBenchPress';
import { bbBackSquat } from './library/bbBackSquat';
import { bbRow } from './library/bbRow';
import { latPulldown } from './library/latPulldown';

export const EXERCISE_MOTION: Record<string, Rig> = {
  bb_bench_press: bbBenchPress,
  bb_back_squat: bbBackSquat,
  bb_row: bbRow,
  lat_pulldown: latPulldown,
};

export function exerciseMotion(exerciseId: string | null | undefined): Rig | null {
  if (!exerciseId) return null;
  return EXERCISE_MOTION[exerciseId] ?? null;
}

export function hasExerciseMotion(exerciseId: string | null | undefined): boolean {
  return exerciseMotion(exerciseId) != null;
}
