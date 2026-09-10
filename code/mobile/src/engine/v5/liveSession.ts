/**
 * Hush Engine v5 — Stage 2: Loop 1, live in a workout (the integration edge).
 *
 * The pure `correctInSession` (loop1.ts) decides the next set's load from the set just performed;
 * this thin layer sources its inputs from the catalogue and applies the result to the remaining sets
 * of the current exercise.
 *
 * ⚠️ WHO CALLS IT (corrected 2026-09-09). It no longer runs in `sessionStore.completeSet` — the
 * founder's 2026-08-26 ruling made the touch stage a LOGGER (only `carryWeightForward` survives
 * there). Its one production caller is the voice conductor (`platform/voice/voiceConductor`, spec
 * §6), which speaks the verdict and applies it under `applyLoop1`.
 */

import { exerciseMeta } from '@/engine/catalog';
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

/** Engine meta the live loop needs (equipment + bodyweight). `observedLoads` — her learned real grid
 *  for this lift — lets a mid-session correction snap to a weight that physically exists at her gym
 *  (the same grid the between-session prescription uses); absent → the equipment default increment. */
export function metaFor(exerciseId: string, observedLoads?: number[]): ExerciseMeta {
  const m = exerciseMeta(exerciseId);
  return { equipment: m.equipment, bodyweight: m.bodyweight, observedLoads };
}

export interface LiveStep {
  exerciseId: string;
  globalIndex: number;
  /**
   * The rep prescription, or ABSENT on a step that has none.
   *
   * Loop 1 corrects a LOAD from a rep count, so it has nothing to say about a plank, a 400 m repeat
   * or five minutes of mobility — and a session can now contain all three between two sets of the
   * same lift. Such a step is stepped over: it is not corrected, and it does not break the chain of
   * a load being carried forward across the sets that surround it.
   */
  target?: { recommendedWeight: number | null; recommendedReps: number; repBandLo?: number; repBandHi?: number; perRung?: number };
}

export interface Loop1Applied<T extends LiveStep> {
  plan: T[];
  corrected: boolean;
  direction: 'up' | 'down' | 'none';
  nextLoad: number | null;
}

/**
 * Carry a PERFORMED weight onto the remaining sets of the SAME exercise (weight only). The load the
 * athlete actually lifts is the baseline for the rest of the exercise — if she edits the prescribed
 * weight (up or down: the machine's real pin, a heavier dumbbell she reached for), that choice STICKS
 * for the remaining sets instead of reverting to the prescription every set. Reps/band/perRung are
 * untouched (each set still targets Tlo). Loop 1's rep-based correction then applies ON TOP of this
 * baseline. No-op for bodyweight (weight null), the last set, or when nothing actually changes — so a
 * set completed at exactly the prescription is a true no-op (same plan reference). Pure.
 */
export function carryWeightForward<T extends LiveStep>(plan: T[], completedGlobalIndex: number, weight: number | null): T[] {
  if (weight == null) return plan;
  const cur = plan.find((s) => s.globalIndex === completedGlobalIndex);
  if (!cur) return plan;
  let changed = false;
  const out = plan.map((s) => {
    // A step with no rep prescription has no load to carry — it is stepped over, and the chain
    // continues to the next set of the same lift beyond it.
    if (s.globalIndex > completedGlobalIndex && s.exerciseId === cur.exerciseId && s.target && s.target.recommendedWeight !== weight) {
      changed = true;
      return { ...s, target: { ...s.target, recommendedWeight: weight } } as T;
    }
    return s;
  });
  return changed ? out : plan;
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
  /** Her learned real grid for this lift (the loads she has actually performed), so a correction lands
   *  on a weight that exists at her gym. Absent → the equipment default increment (B-6). */
  observedLoads?: number[],
  /** L11 — the rail for this lift: one rung above her heaviest completed-at-Tlo load (settled history
   *  plus this session). Absent/null → inactive, exactly as L11 defines it for a never-completed lift. */
  railCeiling?: number | null,
  /** F-20 — the previous WORKING set's performed reps on this lift, this session (warm-up bridges and
   *  approach sets excluded), or null when this was the first. The second witness for a 1-rep miss. */
  prevReps?: number | null,
  /** The lift has no evidence in her history: every miss moves, from set 1, cap 3 (`Loop1Input.firstTime`). */
  firstTime?: boolean,
): Loop1Applied<T> {
  const cur = plan.find((s) => s.globalIndex === completedGlobalIndex);
  const noop: Loop1Applied<T> = { plan, corrected: false, direction: 'none', nextLoad: performedLoad };
  if (!cur) return noop;

  const next = plan.find((s) => s.globalIndex > completedGlobalIndex && s.exerciseId === cur.exerciseId);
  if (!next) return noop; // last set of this exercise — nothing ahead to correct (S-13)

  // Loop 1 corrects a LOAD from a rep count. A step with no rep prescription has neither, so there
  // is nothing to correct and nothing to say about it.
  if (!cur.target) return noop;
  const meta = metaFor(cur.exerciseId, observedLoads);
  // Tlo comes from the IMMUTABLE band floor, never `recommendedReps`: the edit wheel overwrites the
  // latter with her performed reps, which would make every set sit "in band" and freeze the load
  // (founder QA, Build #33). Fall back to recommendedReps only for legacy targets that carry no band.
  const band = bandFromTarget(cur.target.repBandLo ?? cur.target.recommendedReps, cur.target.repBandHi);
  // F-20 — the previous set's verdict against the SAME band (the band is per-exercise and immutable
  // within a session, so the witness is judged by the law it will be corroborating).
  const prevMiss = prevReps == null ? null : prevReps > band.hi ? ('up' as const) : prevReps < band.lo ? ('down' as const) : null;
  const r = correctInSession({
    currentLoad: performedLoad,
    band,
    repsJustDone: performedReps,
    correctionsSoFar,
    isLastSet: false,
    meta,
    // Her fitted reps-per-rung (F-13), stamped on the target by the prescription; null → B-5 one rung.
    perRung: cur.target.perRung ?? null,
    railCeiling, // L11 — an in-session raise is bounded by her own record (S-11, "always inside the rail")
    prevMiss,
    firstTime,
  });
  if (!r.corrected || r.nextLoad == null) return noop;

  // `s.target &&` — the same guard `carryWeightForward` keeps: a step with no rep prescription is
  // STEPPED OVER (see LiveStep). Without it, the spread manufactured a target of `{ recommendedWeight }`
  // alone onto a target-less step — a malformed prescription with no reps — instead of leaving it be.
  const newPlan = plan.map((s) =>
    s.globalIndex > completedGlobalIndex && s.exerciseId === cur.exerciseId && s.target
      ? ({ ...s, target: { ...s.target, recommendedWeight: r.nextLoad } } as T)
      : s,
  );
  return { plan: newPlan, corrected: true, direction: r.direction, nextLoad: r.nextLoad };
}
