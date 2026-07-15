/**
 * Hush Engine v5 — Stage 2: Loop 1, live in a workout (the integration edge).
 *
 * The pure `correctInSession` (loop1.ts) decides the next set's load from the set just performed;
 * this thin layer sources its inputs from the catalogue and applies the result to the remaining sets
 * of the current exercise. It runs at the ONE place the phone and the watch both pass through
 * (sessionStore.completeSet), so a correction reaches both surfaces from a single call.
 */

import { exerciseMeta } from '@/engine/v4/catalogAdapter';
import { correctInSession } from './loop1';
import type { Band, ExerciseMeta } from './types';

/**
 * The athlete's rep band for a set. `lo` is the target (the prescribed reps); `hi` is the top of her
 * declared T (Thi), stamped on the target by the prescription (Stage 4). When Thi is absent — an
 * older profile with no declared T — a provisional window (lo+4) stands in until she declares one.
 * This is NOT the deleted `T+4` progression ceiling; it is only Loop 1's in-session window.
 */
export function bandFromTarget(recommendedReps: number, repBandHi?: number): Band {
  return { lo: recommendedReps, hi: repBandHi != null && repBandHi >= recommendedReps ? repBandHi : recommendedReps + 4 };
}

/** Engine meta the live loop needs (equipment + bodyweight). ObservedLoads arrive in Stage 3/4. */
export function metaFor(exerciseId: string): ExerciseMeta {
  const m = exerciseMeta(exerciseId);
  return { equipment: m.equipment, bodyweight: m.bodyweight };
}

export interface LiveStep {
  exerciseId: string;
  globalIndex: number;
  target: { recommendedWeight: number | null; recommendedReps: number; repBandHi?: number };
}

export interface Loop1Applied<T extends LiveStep> {
  plan: T[];
  corrected: boolean;
  direction: 'up' | 'down' | 'none';
  nextLoad: number | null;
}

/**
 * Apply Loop 1 to the plan after a set was completed. `performedLoad` / `performedReps` are the FACT
 * (what she lifted, not what was asked). When the reps fall outside the band, the corrected load is
 * written to **every remaining set of the same exercise** (a raise/drop carries forward, it does not
 * revert). Bodyweight, the last set of an exercise, and a spent correction budget are all no-ops
 * (handled inside `correctInSession`). Pure over its inputs.
 */
export function applyLoop1<T extends LiveStep>(
  plan: T[],
  completedGlobalIndex: number,
  performedLoad: number | null,
  performedReps: number,
  correctionsSoFar: number,
): Loop1Applied<T> {
  const cur = plan.find((s) => s.globalIndex === completedGlobalIndex);
  const noop: Loop1Applied<T> = { plan, corrected: false, direction: 'none', nextLoad: performedLoad };
  if (!cur) return noop;

  const next = plan.find((s) => s.globalIndex > completedGlobalIndex && s.exerciseId === cur.exerciseId);
  if (!next) return noop; // last set of this exercise — nothing ahead to correct (S-13)

  const meta = metaFor(cur.exerciseId);
  const band = bandFromTarget(cur.target.recommendedReps, cur.target.repBandHi);
  const r = correctInSession({
    currentLoad: performedLoad,
    band,
    repsJustDone: performedReps,
    correctionsSoFar,
    isLastSet: false,
    meta,
    perRung: null, // Stage 3 feeds her fitted reps-per-rung; until then, one cautious rung (B-5)
  });
  if (!r.corrected || r.nextLoad == null) return noop;

  const newPlan = plan.map((s) =>
    s.globalIndex > completedGlobalIndex && s.exerciseId === cur.exerciseId
      ? ({ ...s, target: { ...s.target, recommendedWeight: r.nextLoad } } as T)
      : s,
  );
  return { plan: newPlan, corrected: true, direction: r.direction, nextLoad: r.nextLoad };
}
