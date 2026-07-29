/**
 * Standalone plan snapshot builder (phone side).
 *
 * The phone owns the MODEL; the watch owns nothing but execution. This module
 * precomputes the model's output — every remaining workout of the week, fully
 * prescribed and name-resolved per set — into a `WatchPlanSnapshot` the watch
 * stores durably and can execute with the phone absent. The watch never
 * recomputes targets: what is prescribed here is what it runs.
 *
 * Pure over its inputs (days + targets + clock) so it is unit-testable anywhere;
 * catalog/name/equipment resolution reuses the same sources the live mirror uses
 * (exerciseById + loadSetup), keeping the wrist presentation identical whether a
 * set is mirrored live or executed locally.
 */
import type { ProgramDay, SetTarget } from '@/data/local/models';
import { exerciseById } from '@/data/exercises';
import { loadSetup } from '@/domain/loadPresentation';
import {
  WATCH_PLAN_SCHEMA_VERSION,
  type WatchPlanSnapshot,
  type WatchPlanStep,
  type WatchPlanWorkout,
} from './protocol';

/** Stable content hash (djb2 over the canonical JSON) — cheap, deterministic,
 *  and only used to detect "the plan changed" / name the executed plan. */
function contentHash(workouts: WatchPlanWorkout[]): string {
  const json = JSON.stringify(workouts);
  let h = 5381;
  for (let i = 0; i < json.length; i++) {
    h = ((h << 5) + h + json.charCodeAt(i)) | 0;
  }
  return `plan_${(h >>> 0).toString(36)}`;
}

function buildSteps(day: ProgramDay, targets: SetTarget[], restInterSFor?: (exerciseId: string) => number): WatchPlanStep[] {
  const find = (exerciseId: string, setIndex: number): SetTarget =>
    targets.find((t) => t.exerciseId === exerciseId && t.setIndex === setIndex) ?? {
      exerciseId,
      setIndex,
      recommendedWeight: null,
      recommendedReps: 8, // data gap (§7.9): a neutral target, never a blank set
    };
  const steps: WatchPlanStep[] = [];
  let global = 0;
  for (const slot of day.slots) {
    const ex = exerciseById(slot.exerciseId);
    for (let s = 0; s < slot.setCount; s++) {
      const target = find(slot.exerciseId, s);
      const setup = loadSetup(slot.exerciseId, target.recommendedWeight, 'kg');
      steps.push({
        exerciseId: slot.exerciseId,
        exerciseName: ex?.name ?? slot.exerciseId,
        exerciseGroup: ex?.muscle ?? '',
        setIndexInExercise: s,
        totalSetsInExercise: slot.setCount,
        globalIndex: global,
        targetWeight: target.recommendedWeight,
        targetReps: target.recommendedReps,
        // Her band's ceiling, so the wrist can draw the same ruler standalone that it draws mirrored.
        targetRepsHi: target.repBandHi,
        blockId: target.blockId,
        reasonType: target.reasonType,
        reasonDelta: target.reasonDelta,
        restInterS: restInterSFor ? restInterSFor(slot.exerciseId) : undefined,
        loadSetup: setup
          ? {
              style: setup.style,
              perSide: setup.perSide,
              plates: setup.plates,
              barKg: setup.barKg,
              perHand: setup.perHand,
              pin: setup.pin,
              fixedBar: setup.fixedBar,
            }
          : null,
      });
      global += 1;
    }
  }
  return steps;
}

export interface WatchPlanInputs {
  /** The week's days; rest + completed days are excluded from the snapshot. */
  days: ProgramDay[];
  /** Model targets per day id. A day with no entry is skipped (a partial snapshot
   *  is still useful — the watch just can't start THAT workout offline). */
  targetsByDay: Record<string, SetTarget[]>;
  nowMs: number;
  /** Hush-owned rest lengths (s) — passed in so this module stays constant-free.
   *  restInterS is the plan-level FALLBACK (stale watch builds); restInterSFor supplies
   *  the per-exercise (tier-based) rest each step actually carries. */
  restInterS: number;
  restTransitionS: number;
  restInterSFor?: (exerciseId: string) => number;
}

/** Build the snapshot, or null when nothing remains to execute (all done / no
 *  targets available) — the watch keeps its previous plan in that case. */
export function buildWatchPlanSnapshot(inp: WatchPlanInputs): WatchPlanSnapshot | null {
  const workouts: WatchPlanWorkout[] = [];
  for (const day of inp.days) {
    if (day.isRest || day.completed) continue;
    const targets = inp.targetsByDay[day.id];
    if (!targets) continue;
    const steps = buildSteps(day, targets, inp.restInterSFor);
    if (steps.length === 0) continue;
    workouts.push({
      id: day.id,
      name: day.name,
      muscles: day.muscleGroups.join(' · '),
      steps,
    });
  }
  if (workouts.length === 0) return null;
  return {
    schema: WATCH_PLAN_SCHEMA_VERSION,
    planId: contentHash(workouts),
    generatedAt: new Date(inp.nowMs).toISOString(),
    restInterS: inp.restInterS,
    restTransitionS: inp.restTransitionS,
    workouts,
  };
}
