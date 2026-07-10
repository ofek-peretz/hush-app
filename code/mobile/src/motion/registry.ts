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
import { closeGripBench, dbBenchPress, inclineBbPress, inclineDbPress, machineChestPress } from './library/pressHorizontal';
import { arnoldPress, bbOverheadPress, dbShoulderPress, machineShoulderPress } from './library/pressVertical';
import { cableRow, dbRow, facePull, machineRow, tBarRow } from './library/pullRow';

const RIGS: Rig[] = [
  // benchmarks
  bbBenchPress, bbBackSquat, bbRow, latPulldown,
  // press_horizontal
  inclineBbPress, dbBenchPress, inclineDbPress, machineChestPress, closeGripBench,
  // press_vertical
  bbOverheadPress, dbShoulderPress, machineShoulderPress, arnoldPress,
  // pull_row
  tBarRow, dbRow, cableRow, machineRow, facePull,
];

export const EXERCISE_MOTION: Record<string, Rig> = Object.fromEntries(RIGS.map((r) => [r.id, r]));

export function exerciseMotion(exerciseId: string | null | undefined): Rig | null {
  if (!exerciseId) return null;
  return EXERCISE_MOTION[exerciseId] ?? null;
}

export function hasExerciseMotion(exerciseId: string | null | undefined): boolean {
  return exerciseMotion(exerciseId) != null;
}
